"""챗봇 제약 검증 툴 테스트 (#195, LLM 호출 없음).

핵심 회귀 —
① `verify_schedule`이 AI 판단이 아니라 verify_batch의 결정적 채점을 돌려준다,
② 쓰기 툴이 **이번 편집이 새로 만든** 위반만 결과에 얹는다 (원래 있던 위반은 빼고).

apply_draft_edit가 보는 것은 겹침과 주간 상한뿐이라, 가능 시간 밖으로 옮기는
편집은 그대로 통과한다 — 그 구멍이 결과에 드러나는지가 이 파일의 관심사다.
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
    """가능 시간 안에 배정된 draft — 이 상태에서 시작하면 편집이 만든 위반만 남는다."""
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자",
                     department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x",
                       funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add(models.Application(
        student_id="20221111", posting_id=posting.posting_id, status="합격"))
    # 월~금 09:00-18:00 가능 — 이 밖으로 옮기면 HC-CLASS-1 위반이 된다
    db_session.add_all([
        models.AvailableTime(student_id="20221111", day_of_week=d,
                             start_time=_t("09:00"), end_time=_t("18:00"), preference=2)
        for d in range(1, 6)
    ])
    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END, solver_summary={},
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
        f"/api/schedule/chat/sessions/{session_id}/messages", json={"content": content})


def _tool_call(res, name):
    return next(c for c in res.json()["tool_calls"] if c["tool"] == name)


class TestVerifyTool:
    def test_verify_is_registered_as_a_read_tool(self):
        assert "verify_schedule" in chat.READ_TOOL_HANDLERS
        assert "verify_schedule" in [d.name for d in chat._TOOL_DECLARATIONS]

    def test_clean_draft_verifies_ok(self, db_session, scenario, monkeypatch):
        client, session_id = _create_session(db_session, scenario)
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("verify_schedule", {})]),
            LlmStep(text="규정 위반은 없습니다."),
        ])
        res = _send(client, session_id, "규정 지키고 있나요?")
        assert res.status_code == 201, res.json()
        result = _tool_call(res, "verify_schedule")["result"]
        assert result["ok"] is True
        assert result["critical_count"] == 0

    def test_availability_violation_is_reported_as_critical(
        self, db_session, scenario, monkeypatch
    ):
        # 가능 시간(09:00-18:00) 밖으로 직접 옮겨 놓고 검증만 시킨다
        scenario["row"].start_time = _t("20:00")
        scenario["row"].end_time = _t("22:00")
        db_session.commit()

        client, session_id = _create_session(db_session, scenario)
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("verify_schedule", {})]),
            LlmStep(text="위반이 있습니다."),
        ])
        res = _send(client, session_id, "규정 지키고 있나요?")
        result = _tool_call(res, "verify_schedule")["result"]
        assert result["ok"] is False
        assert result["critical_count"] >= 1
        rules = {v["rule"] for v in result["violations"]}
        assert "HC-CLASS-1" in rules
        # 담당자는 이름으로 말한다 — 학번만 돌려주면 모델이 이름을 지어낸다
        assert any(v["student"] and "학생A" in v["student"] for v in result["violations"])


class TestEditReportsNewViolations:
    def test_move_outside_availability_reports_new_violation(
        self, db_session, scenario, monkeypatch
    ):
        client, session_id = _create_session(db_session, scenario)
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["row"].schedule_id,
                "start_time": "20:00", "end_time": "22:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        res = _send(client, session_id, "학생A 월요일 근무를 저녁 8시로 옮겨줘")
        assert res.status_code == 201, res.json()
        result = _tool_call(res, "move_schedule")["result"]
        # 편집 자체는 성공한다 — apply_draft_edit는 가능 시간을 보지 않는다
        assert result["ok"] is True
        assert "new_violations" in result, result
        rules = {v["rule"] for v in result["new_violations"]["violations"]}
        assert "HC-CLASS-1" in rules

    def test_clean_move_reports_no_new_violations(
        self, db_session, scenario, monkeypatch
    ):
        client, session_id = _create_session(db_session, scenario)
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["row"].schedule_id,
                "start_time": "14:00", "end_time": "17:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        res = _send(client, session_id, "학생A 월요일 근무를 오후 2시로 옮겨줘")
        result = _tool_call(res, "move_schedule")["result"]
        assert result["ok"] is True
        assert "new_violations" not in result, result

    def test_preexisting_violation_is_not_reported_as_new(
        self, db_session, scenario, monkeypatch
    ):
        """원래 있던 위반까지 "이번 수정이 만들었다"고 보고하면 모델이 엉뚱한
        되돌리기를 제안한다 — 편집 전 스냅샷과의 차집합이어야 한다."""
        stale = models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id,
            work_date=MONDAY + datetime.timedelta(days=1),
            start_time=_t("20:00"), end_time=_t("22:00"),
        )
        db_session.add(stale)
        db_session.commit()

        client, session_id = _create_session(db_session, scenario)
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["row"].schedule_id,
                "start_time": "14:00", "end_time": "17:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        res = _send(client, session_id, "학생A 월요일 근무를 오후 2시로 옮겨줘")
        result = _tool_call(res, "move_schedule")["result"]
        assert "new_violations" not in result, result
