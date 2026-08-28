"""실제 Gemini를 호출하는 챗봇 툴 사용 판단 테스트 (#134).

GEMINI_API_KEY가 없으면 전부 skip — CI에서는 돌지 않고 로컬 검증용이다.
LLM 출력은 비결정적이므로 개별 실패는 재실행으로 확인한다.

검증 대상 (이슈 #134 완료 조건):
- 일반 질문(인사)에 불필요한 툴을 부르지 않는다
- "왜 이래?" 질문에 explain_penalty를 호출해 근거 있는 답을 낸다
"""

import datetime
import os

import pytest

from app import models
from app.scheduler import chat

pytestmark = pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY", "").strip(),
    reason="GEMINI_API_KEY 없음 — 실제 Gemini 호출 테스트는 키가 있을 때만 돈다",
)

MONDAY = datetime.date(2026, 9, 7)


@pytest.fixture
def live_session(db_session):
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()
    db_session.add(models.Staff(
        staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"
    ))
    db_session.add(models.Student(student_id="20221111", name="학생A", password_hash="x"))
    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=MONDAY + datetime.timedelta(days=13),
        solver_summary={
            "penalty_summary": {"meal_missed": 40},
            "penalty_events": [
                {"name": "meal_missed", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": MONDAY.isoformat(), "minute": None},
                {"name": "meal_missed", "cost": 20, "amount": 1,
                 "student_id": "20221111",
                 "day": (MONDAY + datetime.timedelta(days=2)).isoformat(), "minute": None},
            ],
        },
    )
    db_session.add(draft)
    db_session.flush()
    db_session.add(models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=datetime.time(9), end_time=datetime.time(14),
    ))
    session = models.ChatSession(
        department_id=dept.department_id, period_start=MONDAY,
        period_end=MONDAY + datetime.timedelta(days=13),
        batch_id=draft.batch_id, staff_id="STF001",
    )
    db_session.add(session)
    db_session.commit()
    return session


def test_greeting_calls_no_tools(db_session, live_session):
    """인사에 툴을 부르지 않는다 — 불필요한 호출 억제 확인."""
    text, calls, status = chat.run_turn(db_session, live_session, "안녕하세요!")
    assert calls == [], f"인사에 툴 호출: {[c['tool'] for c in calls]}"
    assert text.strip()
    assert status is None


def test_why_question_uses_explain_penalty(db_session, live_session):
    """페널티 이유 질문에 explain_penalty로 근거를 조회한다 (결정 18)."""
    text, calls, status = chat.run_turn(
        db_session, live_session,
        "식사 시간 미확보 페널티가 왜 발생했어? 누가 언제 걸린 건지 알려줘.",
    )
    tools_used = [c["tool"] for c in calls]
    assert "explain_penalty" in tools_used, f"호출된 툴: {tools_used}"
    assert "20221111" in text or "학생A" in text, f"근거 없는 답변: {text}"


def test_edit_request_finds_before_moving(db_session, live_session):
    """변경 요청 — schedule_id를 추측하지 않고 find_schedules로 확인한 뒤 옮긴다 (#135)."""
    text, calls, status = chat.run_turn(
        db_session, live_session,
        "20221111 학생의 9/7 월요일 근무를 오후 2시부터 5시로 옮겨줘.",
    )
    tools_used = [c["tool"] for c in calls]
    assert "move_schedule" in tools_used, f"호출된 툴: {tools_used}"
    move_idx = tools_used.index("move_schedule")
    assert "find_schedules" in tools_used[:move_idx], (
        f"조회 없이 바로 수정: {tools_used}"
    )
    move = calls[move_idx]
    assert move.get("inverse"), "쓰기에 inverse가 기록되지 않음"
    assert status == "applied", f"status={status}, calls={tools_used}"


def test_multi_step_edit_completes_in_one_turn(db_session, live_session):
    """다단계 요청(삭제 + 추가)이 한 턴에 완결된다 — v2 분류기가 못 하던 것 (#135)."""
    text, calls, status = chat.run_turn(
        db_session, live_session,
        "20221111 학생의 월요일 근무를 빼고, 대신 화요일 09:00-12:00로 넣어줘.",
    )
    tools_used = [c["tool"] for c in calls]
    assert "remove_schedule" in tools_used, f"호출된 툴: {tools_used}"
    assert "add_schedule" in tools_used, f"호출된 툴: {tools_used}"
    writes = [c for c in calls if c.get("inverse")]
    assert len(writes) >= 2
    assert status == "applied", f"status={status}"
