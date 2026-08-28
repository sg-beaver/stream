"""챗봇 쓰기 툴·턴 되돌리기 테스트 (#135, LLM 호출 없음).

핵심 회귀 두 가지 —
① 쓰기 툴이 draft 배치만 바꾸고 confirmed·manual(학생 노출 경로)은 불변,
② 턴 되돌리기는 역순 일괄 취소이며 도중 실패 시 전체 롤백(부분 복구 없음).
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

MONDAY = datetime.date(2026, 9, 7)
TUESDAY = datetime.date(2026, 9, 8)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀", weekly_hour_limit=14)
    db_session.add(dept)
    db_session.flush()

    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x", funding_type="gyobi"),
        models.Student(student_id="20222222", name="학생B", password_hash="x", funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add_all([
        models.Application(student_id=s, posting_id=posting.posting_id, status="합격")
        for s in ("20221111", "20222222")
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END, solver_summary={},
    )
    confirmed = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=MONDAY, period_end=PERIOD_END,
    )
    manual = models.ScheduleBatch(department_id=dept.department_id, status="manual")
    db_session.add_all([draft, confirmed, manual])
    db_session.flush()

    def _row(batch, student_id, day, start, end):
        row = models.WorkSchedule(
            batch_id=batch.batch_id, student_id=student_id,
            department_id=dept.department_id, work_date=day,
            start_time=_t(start), end_time=_t(end),
        )
        db_session.add(row)
        return row

    draft_a = _row(draft, "20221111", MONDAY, "09:00", "12:00")
    confirmed_row = _row(confirmed, "20221111", TUESDAY, "14:00", "16:00")
    manual_row = _row(manual, "20222222", TUESDAY, "14:00", "16:00")
    db_session.commit()
    return {
        "dept": dept, "draft": draft, "draft_a": draft_a,
        "confirmed_row": confirmed_row, "manual_row": manual_row,
    }


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


class TestWriteTools:
    def test_move_applies_and_records_inverse(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("find_schedules", {"student_id": "20221111"})]),
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="월요일 근무를 13:00-16:00로 옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생A 월요일 근무 오후로 옮겨줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "applied"

        move = body["tool_calls"][1]
        assert move["tool"] == "move_schedule"
        assert move["result"]["ok"] is True
        assert move["inverse"]["op"] == "move"
        assert move["inverse"]["start_time"] == "09:00:00"
        # 읽기 호출에는 inverse가 없다
        assert "inverse" not in body["tool_calls"][0]

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")

    def test_add_uses_session_batch_not_model_args(self, db_session, scenario, monkeypatch):
        """모델이 batch_id를 지정할 수 없다 — 세션의 현재 draft에만 추가된다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("add_schedule", {
                "student_id": "20222222", "work_date": MONDAY.isoformat(),
                "start_time": "13:00", "end_time": "15:00",
                "batch_id": 99999,  # 모델이 멋대로 넣어도 무시된다
            })]),
            LlmStep(text="추가했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생B 월요일 오후 추가해줘")
        assert res.status_code == 201, res.json()
        added_id = res.json()["tool_calls"][0]["result"]["schedule_id"]
        row = db_session.get(models.WorkSchedule, added_id)
        assert row.batch_id == scenario["draft"].batch_id

    def test_validation_failure_is_partial_failed_and_draft_unchanged(
        self, db_session, scenario, monkeypatch
    ):
        """겹침 이동 실패 — 사유가 결과에 남고 turn_status=partial_failed."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "work_date": TUESDAY.isoformat(),
                "start_time": "15:00", "end_time": "17:00",  # confirmed 화 14-16과 겹침
            })]),
            LlmStep(text="그 시간은 기존 배정과 겹쳐 옮길 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "화요일 오후로 옮겨줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "partial_failed"
        assert "겹칩니다" in body["tool_calls"][0]["result"]["error"]
        db_session.expire_all()
        assert scenario["draft_a"].work_date == MONDAY  # 변경 없음

    def test_writes_never_touch_confirmed_or_manual(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["confirmed_row"].schedule_id,
                "start_time": "10:00", "end_time": "12:00",
            })]),
            LlmStep(text="확정 배정은 고칠 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "화요일 확정 근무 옮겨줘")
        assert res.status_code == 201, res.json()
        assert "draft" in res.json()["tool_calls"][0]["result"]["error"]
        db_session.expire_all()
        assert scenario["confirmed_row"].start_time == _t("14:00")
        assert scenario["manual_row"].start_time == _t("14:00")

    def test_student_schedule_me_unchanged_after_chat_edit(self, db_session, scenario, monkeypatch):
        student = _client_as(db_session, "20221111", "student")
        before = student.get("/api/schedule/me").json()

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "옮겨줘").status_code == 201

        student = _client_as(db_session, "20221111", "student")
        assert student.get("/api/schedule/me").json() == before


class TestRevert:
    def _turn_with_move(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "옮겨줘")
        assert res.status_code == 201
        return client, session_id, res.json()["message_id"]

    def test_revert_restores_and_marks_reverted(self, db_session, scenario, monkeypatch):
        client, session_id, message_id = self._turn_with_move(db_session, scenario, monkeypatch)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 200, res.json()
        assert res.json()["turn_status"] == "reverted"
        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("09:00")  # 원상 복구

    def test_revert_twice_is_409(self, db_session, scenario, monkeypatch):
        client, session_id, message_id = self._turn_with_move(db_session, scenario, monkeypatch)
        assert client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        ).status_code == 200
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 409
        assert "이미" in res.json()["error"]

    def test_revert_turn_without_writes_is_400(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [LlmStep(text="그냥 답변입니다.")])
        client, session_id = _create_session(db_session, scenario)
        message_id = _send(client, session_id, "안녕").json()["message_id"]
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 400

    def test_revert_multi_write_turn_reverses_in_order(self, db_session, scenario, monkeypatch):
        """move → add 턴의 되돌리기: add 취소(remove) → move 복원 순서."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("move_schedule", {
                    "schedule_id": scenario["draft_a"].schedule_id,
                    "start_time": "13:00", "end_time": "16:00",
                }),
                ("add_schedule", {
                    "student_id": "20222222", "work_date": MONDAY.isoformat(),
                    "start_time": "09:00", "end_time": "12:00",
                }),
            ]),
            LlmStep(text="옮기고 추가했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "옮기고 그 자리에 학생B 넣어줘")
        assert res.status_code == 201, res.json()
        message_id = res.json()["message_id"]
        added_id = res.json()["tool_calls"][1]["result"]["schedule_id"]

        assert client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        ).status_code == 200

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("09:00")
        assert db_session.get(models.WorkSchedule, added_id) is None

    def test_revert_conflict_rolls_back_everything(self, db_session, scenario, monkeypatch):
        """되돌릴 자리를 그 사이 다른 편집이 차지 — 전체 실패, 부분 복구 없음."""
        client, session_id, message_id = self._turn_with_move(db_session, scenario, monkeypatch)

        # 되돌리기가 복원할 자리(월 09-12)에 다른 배정을 끼워 넣는다
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=MONDAY,
            start_time=_t("10:00"), end_time=_t("11:00"),
        ))
        db_session.commit()

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 409
        assert "취소했습니다" in res.json()["error"]

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")  # 이동 상태 그대로 유지
        # 메시지도 reverted로 바뀌지 않았다 — 다시 시도 가능
        msg = db_session.get(models.ChatMessage, message_id)
        assert msg.turn_status == "applied"


class TestBudgetWithWrites:
    def test_budget_exceeded_keeps_applied_writes_revertable(self, db_session, scenario, monkeypatch):
        """예산 초과로 끊겨도 적용된 쓰기는 남고, 그 턴을 되돌릴 수 있다 (§6.4)."""
        steps = [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
        ] + [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET + 1)
        ]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "이것저것 다 해줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "budget_exceeded"
        assert "되돌릴 수 있습니다" in body["content"]

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")  # 쓰기는 적용됨

        res2 = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{body['message_id']}/revert"
        )
        assert res2.status_code == 200
        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("09:00")
