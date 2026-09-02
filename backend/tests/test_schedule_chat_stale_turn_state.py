"""재solve·예산 경계에서 턴 상태가 어긋나는 회귀 (QA 2026-09-02, #267·#268·#269).

세 증상 모두 "이미 사라진 편집을 아직 있는 것처럼 다룬다"는 한 뿌리에서 나온다.

- 예산에 걸려 거부된 쓰기를 실패로 세지 않아 turn_status가 "applied"로 나갔다.
  담당자는 요청한 수정이 다 반영된 줄 알고 확정으로 넘어간다 (#222의 예산 경계판).
- 재solve가 draft를 갈아엎은 뒤에도 손실 확인 게이트가 사라진 편집을 계속 세어,
  한 번 편집한 세션은 끝까지 가중치 조정마다 확인 턴을 하나씩 더 먹었다.
- 같은 이유로 되돌리기 버튼이 남아 눌러도 409였고, 그 사유도 스코프 검사 문구라
  담당자가 원인을 알 수 없었다.
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_schedule_chat_weight_tool import (  # noqa: F401
    MONDAY,
    PERIOD_END,
    _create_session,
    _mock_steps,
    _send,
    _t,
    fake_resolve,
    scenario,
)
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401


@pytest.fixture
def distinct_batch_resolve(monkeypatch, fake_resolve):
    """새 배치를 **먼저** 만들고 옛 배치를 지우는 _replace_draft_batch 흉내.

    fake_resolve는 삭제 후 삽입이라 sqlite가 rowid를 재사용해 batch_id가 그대로
    1로 남는다 — 그러면 재생성 전후를 구분하는 검사가 전부 통과해 버려 이 회귀를
    잡지 못한다. 배포(postgres)에서는 항상 새 id가 나오므로 그쪽에 맞춘다.
    """
    import app.routers.schedule as schedule_router

    def _fake_replace(db, *, department_id, period_start, period_end,
                      created_by, schedules, solver_summary):
        fake_resolve["replaced"] += 1
        new_batch = models.ScheduleBatch(
            department_id=department_id, status="draft",
            period_start=period_start, period_end=period_end,
            solver_summary=solver_summary,
        )
        db.add(new_batch)
        db.flush()
        old = (
            db.query(models.ScheduleBatch)
            .filter_by(department_id=department_id, status="draft",
                       period_start=period_start, period_end=period_end)
            .filter(models.ScheduleBatch.batch_id != new_batch.batch_id)
            .first()
        )
        if old is not None:
            db.query(models.WorkSchedule).filter_by(batch_id=old.batch_id).delete()
            db.delete(old)
            db.flush()
        return new_batch.batch_id, len(schedules)

    monkeypatch.setattr(schedule_router, "_replace_draft_batch", _fake_replace)
    return fake_resolve


def _move_then(monkeypatch, row, *rest):
    """편집 1건을 적용하는 스텝 + 뒤이을 스텝들."""
    return [
        LlmStep(function_calls=[("move_schedule", {
            "schedule_id": row.schedule_id,
            "start_time": "13:00", "end_time": "16:00",
        })]),
        *rest,
    ]


def _adjust(confirm_loss=False):
    args = {"category": "meal_break", "direction": "up"}
    if confirm_loss:
        args["confirm_loss"] = True
    return LlmStep(function_calls=[("adjust_weight", args)])


class TestBudgetRefusedWriteIsFailure:
    def test_write_refused_by_budget_reports_partial_failed(
        self, db_session, scenario, monkeypatch
    ):
        """예산에 걸려 거부된 쓰기가 있으면 '변경 반영됨'으로 끝나지 않는다.

        앞선 쓰기 1건은 성공했으므로 이전에는 turn_status가 "applied"였다 —
        빠진 수정이 있다는 사실이 배지에서 사라졌다.
        """
        row = scenario["row"]
        steps = _move_then(monkeypatch, row) + [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET - 1)
        ] + [
            LlmStep(function_calls=[("remove_schedule", {"schedule_id": row.schedule_id})]),
            LlmStep(text="말씀하신 대로 처리했습니다."),
        ]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)

        body = _send(client, session_id, "옮기고 나머지도 다 지워줘").json()

        refused = [
            c for c in body["tool_calls"]
            if c["tool"] == "remove_schedule" and "예산" in (c["result"].get("error") or "")
        ]
        assert refused, "예산 거부가 기록되지 않았다"
        assert body["turn_status"] == "partial_failed"
        # 성공한 편집은 그대로 남는다 — 되돌릴 수 있어야 하기 때문
        db_session.expire_all()
        assert row.start_time == _t("13:00")

    def test_read_refused_by_budget_is_not_a_write_failure(
        self, db_session, scenario, monkeypatch
    ):
        """거부된 것이 읽기면 실패로 세지 않는다 — 쓰기는 다 반영됐다."""
        row = scenario["row"]
        steps = _move_then(monkeypatch, row) + [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET)
        ] + [
            LlmStep(text="다 했습니다."),
        ]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)

        body = _send(client, session_id, "옮기고 이것저것 봐줘").json()
        assert body["turn_status"] == "applied"


class TestResolveSupersedesEdits:
    def _edit_then_resolve(self, db_session, scenario, monkeypatch):
        client, session_id = _create_session(db_session, scenario)

        _mock_steps(monkeypatch, _move_then(monkeypatch, scenario["row"], LlmStep(text="옮겼습니다.")))
        edit_msg_id = _send(client, session_id, "옮겨줘").json()["message_id"]

        _mock_steps(monkeypatch, [_adjust(confirm_loss=True), LlmStep(text="조정했습니다.")])
        assert _send(client, session_id, "식사시간 더 챙겨줘").status_code == 201

        return client, session_id, edit_msg_id

    def test_edit_turn_is_marked_superseded(
        self, db_session, scenario, monkeypatch, distinct_batch_resolve
    ):
        """재solve가 draft를 갈아엎으면 그 앞의 편집 턴에 표시가 남는다."""
        _, _, edit_msg_id = self._edit_then_resolve(db_session, scenario, monkeypatch)

        db_session.expire_all()
        assert db_session.query(models.WorkSchedule).count() == 0  # 편집분은 실제로 사라졌다
        assert db_session.get(models.ChatMessage, edit_msg_id).turn_status == "superseded"

    def test_confirm_gate_does_not_count_vanished_edits(
        self, db_session, scenario, monkeypatch, distinct_batch_resolve
    ):
        """사라진 편집을 두고 손실 확인을 다시 요구하지 않는다.

        이전에는 count가 0으로 내려가지 않아, 한 번 편집한 세션은 끝까지
        가중치 조정마다 확인 턴을 하나씩 더 먹었다 — 되돌려서 지울 수도
        없으니(그 턴은 superseded다) 탈출구가 '새 대화 시작'뿐이었다.
        """
        client, session_id, _ = self._edit_then_resolve(db_session, scenario, monkeypatch)

        _mock_steps(monkeypatch, [_adjust(), LlmStep(text="조정했습니다.")])
        call = _send(client, session_id, "조금 더 올려줘").json()["tool_calls"][0]

        assert not call["result"].get("confirmation_required"), call["result"]
        assert call["result"]["ok"] is True

    def test_gate_still_fires_for_edits_that_remain(
        self, db_session, scenario, monkeypatch, distinct_batch_resolve
    ):
        """살아 있는 편집에는 확인 게이트가 그대로 뜬다 — §0.2 순서 강제."""
        client, session_id = _create_session(db_session, scenario)

        _mock_steps(monkeypatch, _move_then(monkeypatch, scenario["row"], LlmStep(text="옮겼습니다.")))
        assert _send(client, session_id, "옮겨줘").status_code == 201

        _mock_steps(monkeypatch, [_adjust(), LlmStep(text="확인이 필요합니다.")])
        call = _send(client, session_id, "식사시간 챙겨줘").json()["tool_calls"][0]

        assert call["result"]["confirmation_required"] is True
        assert call["result"]["pending_manual_edits"] == 1

    def test_same_turn_edit_before_resolve_is_not_recounted(
        self, db_session, scenario, monkeypatch, distinct_batch_resolve
    ):
        """한 턴 안에서 편집 → 재solve를 했어도 다음 턴이 그 편집을 세지 않는다.

        재solve 시점에 그 턴의 assistant 메시지는 아직 없어 turn_status로는
        거를 수 없다 — 카운터가 재solve 지점에서 되감아야 잡힌다.
        """
        client, session_id = _create_session(db_session, scenario)

        _mock_steps(monkeypatch, _move_then(
            monkeypatch, scenario["row"], _adjust(confirm_loss=True), LlmStep(text="다 했습니다."),
        ))
        assert _send(client, session_id, "옮기고 식사시간도 챙겨줘").status_code == 201

        _mock_steps(monkeypatch, [_adjust(), LlmStep(text="조정했습니다.")])
        call = _send(client, session_id, "더 올려줘").json()["tool_calls"][0]

        assert not call["result"].get("confirmation_required"), call["result"]


class TestRevertAfterResolve:
    def test_superseded_turn_revert_explains_why(
        self, db_session, scenario, monkeypatch, distinct_batch_resolve
    ):
        """되돌리기가 거부되더라도 사유가 담당자에게 읽히는 말이어야 한다.

        이전에는 스코프 검사 문구("이 세션이 검토 중인 draft에만 추가할 수
        있습니다")가 그대로 나가 원인을 알 수 없었다.
        """
        client, session_id, edit_msg_id = TestResolveSupersedesEdits()._edit_then_resolve(
            db_session, scenario, monkeypatch
        )

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{edit_msg_id}/revert"
        )
        assert res.status_code == 409
        assert "다시 생성" in res.json()["error"]

    def test_revert_still_works_without_resolve(
        self, db_session, scenario, monkeypatch
    ):
        """재solve가 없었으면 되돌리기는 그대로 된다 — 회귀 방지."""
        client, session_id = _create_session(db_session, scenario)
        _mock_steps(monkeypatch, _move_then(monkeypatch, scenario["row"], LlmStep(text="옮겼습니다.")))
        msg_id = _send(client, session_id, "옮겨줘").json()["message_id"]

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{msg_id}/revert"
        )
        assert res.status_code == 200
        db_session.expire_all()
        assert scenario["row"].start_time == _t("09:00")
        assert db_session.get(models.ChatMessage, msg_id).turn_status == "reverted"
