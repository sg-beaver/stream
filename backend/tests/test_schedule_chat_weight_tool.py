"""챗봇 가중치 조정 툴 테스트 (#136, LLM·solver 호출 없음).

generate_schedule과 _replace_draft_batch를 monkeypatch해 solve 없이
배율 계산·확인 게이트·전역 턴당 1회·penalty diff·세션 갱신·persist를
검증한다. 실제 solve 품질·시간은 #149에서 실측 완료(결정적 약 7초).
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

MONDAY = datetime.date(2026, 9, 7)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x", funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add(models.Application(student_id="20221111", posting_id=posting.posting_id, status="합격"))

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END,
        solver_summary={"penalty_summary": {"meal_break": 60, "preference_match": 12}},
    )
    db_session.add(draft)
    db_session.flush()
    row = models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=_t("09:00"), end_time=_t("12:00"),
    )
    db_session.add(row)
    db_session.commit()
    return {"dept": dept, "draft": draft, "row": row}


@pytest.fixture
def fake_resolve(monkeypatch, db_session, scenario):
    """generate_schedule·_replace_draft_batch를 solve 없이 흉내 낸다.

    호출 기록(scales)과 '재생성 후' penalty를 관찰할 수 있게 한다.
    """
    calls = {"requests": [], "replaced": 0}

    def _fake_generate(req, db):
        calls["requests"].append(req)
        return {
            "status": "OPTIMAL",
            "solve_time_seconds": 7.0,
            "objective_value": 2100,
            "best_objective_bound": 2080,
            "schedules": [],
            "shortages": [],
            "penalty_summary": {"meal_break": 20, "preference_match": 21},
            "penalty_events": [],
            "per_student": [],
        }

    def _fake_replace(db, *, department_id, period_start, period_end,
                      created_by, schedules, solver_summary):
        calls["replaced"] += 1
        new_batch = models.ScheduleBatch(
            department_id=department_id, status="draft",
            period_start=period_start, period_end=period_end,
            solver_summary=solver_summary,
        )
        # 기존 draft 교체 흉내 — 실제 _replace_draft_batch처럼 옛 draft를 지운다
        old = (
            db.query(models.ScheduleBatch)
            .filter_by(department_id=department_id, status="draft",
                       period_start=period_start, period_end=period_end)
            .first()
        )
        if old is not None:
            db.query(models.WorkSchedule).filter_by(batch_id=old.batch_id).delete()
            db.delete(old)
            db.flush()
        db.add(new_batch)
        db.flush()
        return new_batch.batch_id, len(schedules)

    import app.scheduler.service as service_mod
    import app.routers.schedule as schedule_router
    monkeypatch.setattr(service_mod, "generate_schedule", _fake_generate)
    monkeypatch.setattr(schedule_router, "_replace_draft_batch", _fake_replace)
    return calls


def _create_session(db_session, scenario):
    client = _client_as(db_session, "STF001", "staff")
    res = client.post("/api/schedule/chat/sessions", json={
        "department_id": scenario["dept"].department_id,
        "period_start": MONDAY.isoformat(),
        "period_end": PERIOD_END.isoformat(),
    })
    assert res.status_code == 201, res.json()
    return client, res.json()["session_id"]


def _mock_steps(monkeypatch, steps):
    queue = list(steps)
    monkeypatch.setattr(chat, "_llm_step", lambda contents: queue.pop(0))


def _send(client, session_id, content):
    return client.post(
        f"/api/schedule/chat/sessions/{session_id}/messages",
        json={"content": content},
    )


class TestAdjustWeight:
    def test_adjust_resolves_and_returns_diff(self, db_session, scenario, fake_resolve, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="식사 페널티가 60→20으로 줄고 선호 미충족이 12→21로 늘었습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "식사 시간을 더 중요하게 봐줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "applied"

        call = body["tool_calls"][0]
        assert call["result"]["ok"] is True
        assert call["result"]["scale"] == {"before": 1.0, "after": 1.5}
        assert call["result"]["penalty_diff"]["before"] == {"meal_break": 60, "preference_match": 12}
        assert call["result"]["penalty_diff"]["after"] == {"meal_break": 20, "preference_match": 21}
        assert call["inverses"] == [{
            "op": "adjust_weight", "category": "meal_break",
            "direction": "down", "confirm_loss": True,
        }]

        # 세션에 배율이 남고, 재생성으로 배치가 교체돼도 세션이 따라간다
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert row.session_weight_scales == {"meal_break": 1.5}
        assert fake_resolve["requests"][0].extra_weight_scales == {"meal_break": 1.5}
        new_draft = db_session.query(models.ScheduleBatch).filter_by(status="draft").one()
        assert row.batch_id == new_draft.batch_id

    def test_up_then_down_returns_to_one(self, db_session, scenario, fake_resolve, monkeypatch):
        """×1.5 후 ×1/1.5 = 정확히 1.0 — 되돌리기 정합의 근거."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="올렸습니다."),
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "down"})]),
            LlmStep(text="내렸습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "식사 올려줘").status_code == 201
        assert _send(client, session_id, "다시 내려줘").status_code == 201
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert row.session_weight_scales["meal_break"] == pytest.approx(1.0)

    def test_understaffing_is_rejected(self, db_session, scenario, fake_resolve, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "understaffing", "direction": "down"})]),
            LlmStep(text="그 항목은 조정할 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "미충원 페널티 좀 낮춰줘")
        assert res.status_code == 201
        assert "조정할 수 없는" in res.json()["tool_calls"][0]["result"]["error"]
        assert fake_resolve["replaced"] == 0  # solve가 돌지 않았다

    def test_global_tool_once_per_turn(self, db_session, scenario, fake_resolve, monkeypatch):
        """전역 툴 2회 시도 — 두 번째는 거부되고 solve는 1회만 (결정 16)."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("adjust_weight", {"category": "meal_break", "direction": "up"}),
                ("adjust_weight", {"category": "exam_proximity", "direction": "up"}),
            ]),
            LlmStep(text="한 번만 조정했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "식사도 시험도 다 올려줘")
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert calls[0]["result"]["ok"] is True
        assert "턴당 1회" in calls[1]["result"]["error"]
        assert fake_resolve["replaced"] == 1

    def test_scale_range_clamp(self, db_session, scenario, fake_resolve, monkeypatch):
        """반복 상향으로 안전 범위(5.0 — 화면 저장 범위와 정합)를 넘기면 거부된다."""
        steps = []
        for _ in range(4):  # 1.5^4 ≈ 5.06 > 5.0 — 네 번째에서 걸린다
            steps.append(LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]))
            steps.append(LlmStep(text="조정했습니다."))
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)
        last = None
        for _ in range(4):
            last = _send(client, session_id, "더 올려줘")
        error = last.json()["tool_calls"][0]["result"].get("error", "")
        assert "허용 범위" in error
        assert fake_resolve["replaced"] == 3  # 성공한 조정만 재생성

    def test_resolve_failure_consumes_turn_budget(self, db_session, scenario, fake_resolve, monkeypatch):
        """재solve 실패도 턴당 1회를 소진한다 — 실패 반복으로 한 턴에 solve를
        여러 번 돌리는 우회 차단 (spec-reviewer Medium 반영)."""
        from app.scheduler.service import ScheduleTimeout

        def _failing_generate(req, db):
            fake_resolve["requests"].append(req)
            raise ScheduleTimeout("시간 제한 내에 근무표를 생성하지 못했습니다.")

        import app.scheduler.service as service_mod
        monkeypatch.setattr(service_mod, "generate_schedule", _failing_generate)

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("adjust_weight", {"category": "meal_break", "direction": "up"}),
                ("adjust_weight", {"category": "meal_break", "direction": "up"}),
            ]),
            LlmStep(text="재생성에 실패했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "식사 올려줘")
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert "재생성에 실패" in calls[0]["result"]["error"]
        assert "턴당 1회" in calls[1]["result"]["error"]  # 두 번째 시도는 차단
        assert len(fake_resolve["requests"]) == 1  # solve 시도는 1회뿐
        # 실패한 배율은 세션에 남지 않는다
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert not row.session_weight_scales


class TestConfirmationGate:
    def _apply_manual_edit(self, db_session, scenario, client, session_id, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["row"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        assert _send(client, session_id, "옮겨줘").status_code == 201

    def test_adjust_after_manual_edit_requires_confirmation(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """수동 수정이 있으면 confirm_loss 없이 solve가 돌지 않는다 (§0.2 순서 강제)."""
        client, session_id = _create_session(db_session, scenario)
        self._apply_manual_edit(db_session, scenario, client, session_id, monkeypatch)

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="수동 수정 1건이 사라집니다. 진행할까요?"),
        ])
        res = _send(client, session_id, "식사 올려줘")
        assert res.status_code == 201, res.json()
        call = res.json()["tool_calls"][0]
        assert call["result"]["confirmation_required"] is True
        assert call["result"]["pending_manual_edits"] == 1
        assert "inverses" not in call           # 쓰기가 아니다
        assert res.json()["turn_status"] is None  # 아무것도 적용 안 됨
        assert fake_resolve["replaced"] == 0

    def test_same_turn_edit_then_adjust_requires_confirmation(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """같은 턴에서 편집 직후 adjust — 아직 저장 전인 이 턴의 편집도 세야 한다
        (spec-reviewer Critical 반영: 놓치면 방금 만든 수정이 경고 없이 소실)."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["row"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="옮겼고, 재생성은 수정 손실 확인이 필요합니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "옮기고 나서 식사도 올려줘")
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert calls[0]["result"]["ok"] is True  # 편집은 적용
        assert calls[1]["result"]["confirmation_required"] is True
        assert calls[1]["result"]["pending_manual_edits"] == 1
        assert fake_resolve["replaced"] == 0  # solve가 돌지 않았다

    def test_confirmed_adjust_proceeds(self, db_session, scenario, fake_resolve, monkeypatch):
        client, session_id = _create_session(db_session, scenario)
        self._apply_manual_edit(db_session, scenario, client, session_id, monkeypatch)

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {
                "category": "meal_break", "direction": "up", "confirm_loss": True,
            })]),
            LlmStep(text="확인받고 재생성했습니다."),
        ])
        res = _send(client, session_id, "응 진행해")
        assert res.status_code == 201, res.json()
        assert res.json()["tool_calls"][0]["result"]["ok"] is True
        assert fake_resolve["replaced"] == 1

    def test_reverted_edit_does_not_require_confirmation(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """수동 수정을 이미 되돌렸으면 잃을 것이 없다 — 확인 없이 진행."""
        client, session_id = _create_session(db_session, scenario)
        self._apply_manual_edit(db_session, scenario, client, session_id, monkeypatch)
        msgs = client.get(f"/api/schedule/chat/sessions/{session_id}/messages").json()
        edit_msg_id = msgs[-1]["message_id"]
        assert client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{edit_msg_id}/revert"
        ).status_code == 200

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="재생성했습니다."),
        ])
        res = _send(client, session_id, "식사 올려줘")
        assert res.status_code == 201
        assert res.json()["tool_calls"][0]["result"]["ok"] is True


class TestRevertAdjust:
    def test_revert_adjust_turn_resolves_back(self, db_session, scenario, fake_resolve, monkeypatch):
        """adjust 턴 되돌리기 = 반대 방향 재조정 + 재solve."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="올렸습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "식사 올려줘")
        message_id = res.json()["message_id"]
        assert fake_resolve["replaced"] == 1

        res2 = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res2.status_code == 200, res2.json()
        assert res2.json()["turn_status"] == "reverted"
        assert fake_resolve["replaced"] == 2  # 되돌리기도 재solve

        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert row.session_weight_scales["meal_break"] == pytest.approx(1.0)


class TestPersist:
    def test_persist_merges_into_department_policy(self, db_session, scenario, fake_resolve, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="올렸습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "식사 올려줘").status_code == 201

        res = client.post(f"/api/schedule/chat/sessions/{session_id}/weights/persist")
        assert res.status_code == 200, res.json()
        assert res.json()["saved"] == {"meal_break": 1.5}

        policy_row = (
            db_session.query(models.DepartmentPolicy)
            .filter_by(department_id=scenario["dept"].department_id)
            .first()
        )
        db_session.refresh(policy_row)
        assert policy_row.soft_weight_scales == {"meal_break": 1.5}
        # 세션 임시 배율은 초기화 — 이중 적용 방지
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert not row.session_weight_scales

    def test_persist_rejects_out_of_range_merge(self, db_session, scenario, fake_resolve, monkeypatch):
        """부서 저장값 4.0 × 세션 1.5 = 6.0 > 5 — 화면 저장 범위(0~5)를 챗봇
        경로로 우회할 수 없다 (spec-reviewer Critical 반영)."""
        db_session.add(models.DepartmentPolicy(
            department_id=scenario["dept"].department_id,
            availability_mode="weekly_only",
            soft_weight_scales={"meal_break": 4.0},
        ))
        db_session.commit()

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("adjust_weight", {"category": "meal_break", "direction": "up"})]),
            LlmStep(text="올렸습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "식사 올려줘").status_code == 201

        res = client.post(f"/api/schedule/chat/sessions/{session_id}/weights/persist")
        assert res.status_code == 400
        assert "저장 허용 범위" in res.json()["error"]
        # 실패해도 세션 배율은 남는다 — 사용자가 되돌리거나 부서값을 낮출 수 있게
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert row.session_weight_scales == {"meal_break": 1.5}

    def test_persist_without_adjustments_is_400(self, db_session, scenario):
        client, session_id = _create_session(db_session, scenario)
        res = client.post(f"/api/schedule/chat/sessions/{session_id}/weights/persist")
        assert res.status_code == 400

    def test_persist_requires_session_owner(self, db_session, scenario):
        _, session_id = _create_session(db_session, scenario)
        db_session.add(models.Staff(
            staff_id="STF002", name="동료", department_id=scenario["dept"].department_id,
            password_hash="x",
        ))
        db_session.commit()
        other = _client_as(db_session, "STF002", "staff")
        res = other.post(f"/api/schedule/chat/sessions/{session_id}/weights/persist")
        assert res.status_code == 403
