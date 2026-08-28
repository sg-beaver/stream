"""시간표 검토 챗봇 API·툴 루프 테스트 (#134, LLM 호출 없음).

chat._llm_step을 monkeypatch해 툴 루프를 mock으로 돈다 — Gemini 응답 한
스텝(LlmStep)만 바꿔치기하므로 루프·툴 실행·기록·저장 경로는 전부 실제
코드가 돈다. 실제 LLM 판단 품질은 tests/scheduler/test_chat_live.py에서
다룬다.
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
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Staff(staff_id="STF003", name="같은 부서 동료", department_id=dept.department_id, password_hash="x"),
        models.Staff(staff_id="STF002", name="타부서 담당자", department_id=other_dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x"),
    ])
    db_session.add(models.DepartmentPolicy(
        department_id=dept.department_id, availability_mode="weekly_only",
        custom_rules="금요일 오전엔 경험자가 필요하다",
    ))

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END,
        solver_summary={
            "penalty_summary": {"meal_missed": 40, "preferred_slot_miss": 6},
            "penalty_events": [
                {"name": "meal_missed", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": MONDAY.isoformat(), "minute": None},
                {"name": "meal_missed", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": (MONDAY + datetime.timedelta(days=1)).isoformat(), "minute": None},
                {"name": "preferred_slot_miss", "cost": 6, "amount": 2,
                 "student_id": None, "day": None, "minute": None},
            ],
        },
    )
    db_session.add(draft)
    db_session.flush()

    db_session.add(models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=_t("09:00"), end_time=_t("12:00"),
    ))
    db_session.add(models.AvailableTime(
        term="2026-2", student_id="20221111", day_of_week=1,
        start_time=_t("09:00"), end_time=_t("15:00"), preference=1,
    ))
    db_session.add(models.ClassTime(
        term="2026-2", student_id="20221111", day_of_week=2,
        start_time=_t("10:00"), end_time=_t("12:00"),
    ))
    db_session.commit()
    return {"dept": dept, "draft": draft}


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
    """스텝 목록을 순서대로 돌려주는 _llm_step mock."""
    queue = list(steps)
    monkeypatch.setattr(chat, "_llm_step", lambda contents: queue.pop(0))


class TestSessionLifecycle:
    def test_create_session_caches_draft_batch(self, db_session, scenario):
        _, session_id = _create_session(db_session, scenario)
        row = db_session.query(models.ChatSession).get(session_id)
        assert row.batch_id == scenario["draft"].batch_id

    def test_create_without_draft_is_400(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": "2027-01-04", "period_end": "2027-01-17",
        })
        assert res.status_code == 400
        assert "draft" in res.json()["error"]

    def test_other_department_staff_is_403(self, db_session, scenario):
        client = _client_as(db_session, "STF002", "staff")
        res = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": MONDAY.isoformat(), "period_end": PERIOD_END.isoformat(),
        })
        assert res.status_code == 403

    def test_student_role_is_403(self, db_session, scenario):
        client = _client_as(db_session, "20221111", "student")
        res = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": MONDAY.isoformat(), "period_end": PERIOD_END.isoformat(),
        })
        assert res.status_code == 403

    def test_colleague_cannot_use_others_session(self, db_session, scenario):
        """같은 부서라도 세션은 시작한 직원 전용이다 (결정 3)."""
        _, session_id = _create_session(db_session, scenario)
        colleague = _client_as(db_session, "STF003", "staff")
        res = colleague.get(f"/api/schedule/chat/sessions/{session_id}/messages")
        assert res.status_code == 403


class TestToolLoop:
    def test_plain_answer_records_no_tools(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [LlmStep(text="이 기간 근무표는 2주 단위입니다.")])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "이 근무표 기간이 어떻게 돼?"},
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["role"] == "assistant"
        assert body["tool_calls"] is None
        assert body["turn_status"] is None

    def test_tool_call_executes_and_is_recorded(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("find_schedules", {"student_id": "20221111"})]),
            LlmStep(text="학생A는 9/7 월요일 09:00-12:00 근무입니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "학생A 근무 언제야?"},
        )
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert len(calls) == 1
        assert calls[0]["tool"] == "find_schedules"
        assert calls[0]["result"]["count"] == 1
        assert calls[0]["result"]["schedules"][0]["student_id"] == "20221111"
        # 읽기 툴에는 inverse가 없다 — 되돌릴 것이 없다
        assert "inverse" not in calls[0]

    def test_tool_error_returns_to_model_and_loop_continues(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("get_student_availability", {"student_id": "99999999"})]),
            LlmStep(text="해당 학생을 찾을 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "99999999 학생 가능 시간 알려줘"},
        )
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert "error" in calls[0]["result"]
        assert res.json()["turn_status"] is None  # 턴은 정상 종료

    def test_unknown_tool_is_refused_not_crashed(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {"schedule_id": 1})]),  # 아직 없는 쓰기 툴
            LlmStep(text="수정 기능은 아직 지원하지 않습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "학생A 근무 옮겨줘"},
        )
        assert res.status_code == 201, res.json()
        assert "알 수 없는 툴" in res.json()["tool_calls"][0]["result"]["error"]

    def test_budget_exceeded_after_step_cap(self, db_session, scenario, monkeypatch):
        steps = [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET)
        ]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "전부 다 보여줘"},
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "budget_exceeded"
        assert len(body["tool_calls"]) == chat.STEP_BUDGET
        assert "나눠서" in body["content"]


class TestReadTools:
    def test_explain_penalty_returns_events(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, staff_id="STF001",
        )
        result = chat._tool_explain_penalty(db_session, session, {"category": "meal_missed"})
        assert result["label"] == "식사 시간 미확보"
        assert result["total_cost"] == 40
        assert len(result["events"]) == 2
        assert result["events"][0]["student_id"] == "20221111"

    def test_explain_penalty_absent_category_notes_no_violation(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, staff_id="STF001",
        )
        result = chat._tool_explain_penalty(db_session, session, {"category": "exam_proximity"})
        assert result["events"] == []
        assert "없습니다" in result["note"]

    def test_get_student_availability_scopes_to_term(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, staff_id="STF001",
        )
        result = chat._tool_get_student_availability(
            db_session, session, {"student_id": "20221111"}
        )
        assert result["term"] == "2026-2"  # 9/7은 2026-2 학기
        assert result["available_times"][0]["day"] == "월"
        assert result["class_times"][0]["day"] == "화"

    def test_find_schedules_date_filter(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, staff_id="STF001",
        )
        hit = chat._tool_find_schedules(db_session, session, {"work_date": MONDAY.isoformat()})
        miss = chat._tool_find_schedules(db_session, session, {"work_date": "2026-09-08"})
        assert hit["count"] == 1
        assert miss["count"] == 0


class TestBatchFollowing:
    def test_session_follows_regenerated_draft(self, db_session, scenario, monkeypatch):
        """재생성으로 draft가 삭제·재생성돼도 세션이 새 배치를 따라간다 (사실 F)."""
        _mock_steps(monkeypatch, [LlmStep(text="확인했습니다.")])
        client, session_id = _create_session(db_session, scenario)

        old_batch_id = scenario["draft"].batch_id
        db_session.query(models.WorkSchedule).filter_by(batch_id=old_batch_id).delete()
        db_session.delete(scenario["draft"])
        new_draft = models.ScheduleBatch(
            department_id=scenario["dept"].department_id, status="draft",
            period_start=MONDAY, period_end=PERIOD_END, solver_summary={},
        )
        db_session.add(new_draft)
        db_session.commit()

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "새 근무표 어때?"},
        )
        assert res.status_code == 201, res.json()
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        # sqlite는 삭제된 autoincrement id를 재사용할 수 있어 old != new 비교는
        # 무의미하다 — 세션이 "현재 존재하는 draft"를 가리키는지만 확인한다
        assert row.batch_id == new_draft.batch_id

    def test_message_without_any_draft_is_409(self, db_session, scenario):
        client, session_id = _create_session(db_session, scenario)
        db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id
        ).delete()
        db_session.delete(scenario["draft"])
        db_session.commit()

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "근무표 어때?"},
        )
        assert res.status_code == 409
        assert "재생성" in res.json()["error"]


class TestHistory:
    def test_history_restores_after_reload(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [LlmStep(text="첫 답변"), LlmStep(text="두 번째 답변")])
        client, session_id = _create_session(db_session, scenario)
        client.post(f"/api/schedule/chat/sessions/{session_id}/messages", json={"content": "질문1"})
        client.post(f"/api/schedule/chat/sessions/{session_id}/messages", json={"content": "질문2"})

        res = client.get(f"/api/schedule/chat/sessions/{session_id}/messages")
        assert res.status_code == 200
        roles = [(m["role"], m["content"]) for m in res.json()]
        assert roles == [
            ("user", "질문1"), ("assistant", "첫 답변"),
            ("user", "질문2"), ("assistant", "두 번째 답변"),
        ]
