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
            "penalty_summary": {"meal_break": 40},
            "penalty_events": [
                {"name": "meal_break", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": MONDAY.isoformat(), "minute": None},
                {"name": "meal_break", "cost": 20, "amount": 1,
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
        batch_id=draft.batch_id, created_by="STF001",
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


def test_weight_complaint_uses_adjust_weight(db_session, live_session, monkeypatch):
    """가중치 불만 → adjust_weight(올바른 카테고리·방향) — 숫자를 지어내지 않는다 (#136).

    solve는 fake — 여기서는 실 LLM의 분류 판단만 검증한다.
    """
    import app.routers.schedule as schedule_router
    import app.scheduler.service as service_mod
    from app import models

    def _fake_generate(req, db):
        return {
            "status": "OPTIMAL", "solve_time_seconds": 7.0,
            "objective_value": 2100, "best_objective_bound": 2080,
            "schedules": [], "shortages": [],
            "penalty_summary": {"meal_break": 20},
            "penalty_events": [], "per_student": [],
        }

    def _fake_replace(db, *, department_id, period_start, period_end,
                      created_by, schedules, solver_summary):
        batch = models.ScheduleBatch(
            department_id=department_id, status="draft",
            period_start=period_start, period_end=period_end,
            solver_summary=solver_summary,
        )
        db.add(batch)
        db.flush()
        return batch.batch_id, len(schedules)

    monkeypatch.setattr(service_mod, "generate_schedule", _fake_generate)
    monkeypatch.setattr(schedule_router, "_replace_draft_batch", _fake_replace)

    text, calls, status = chat.run_turn(
        db_session, live_session,
        "학생들이 식사 시간을 못 챙기는 게 계속 마음에 걸려. 식사 시간 확보를 지금보다 훨씬 중요하게 보고 다시 짜줘.",
    )
    adjusts = [c for c in calls if c["tool"] == "adjust_weight"]
    assert adjusts, f"adjust_weight 미호출: {[c['tool'] for c in calls]}"
    assert adjusts[0]["args"]["category"] == "meal_break", adjusts[0]["args"]
    assert adjusts[0]["args"]["direction"] == "up", adjusts[0]["args"]
    assert adjusts[0].get("inverse", {}).get("op") == "adjust_weight"
    assert status == "applied", f"status={status}"


@pytest.fixture
def verifiable_session(db_session):
    """가능 시간이 채워진 세션 — 편집이 hard 제약을 깨는지 실제로 판정할 수 있다 (#195).

    live_session은 AvailableTime이 없어 모든 배정이 HC-CLASS-1 위반으로 잡힌다.
    "이번 편집이 새로 만든 위반"을 보려면 깨끗한 출발점이 필요하다.
    """
    dept = models.Department(name="정보서비스팀-verify")
    db_session.add(dept)
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF900", name="담당자", department_id=dept.department_id,
                     password_hash="x"),
        models.Student(student_id="20223333", name="조수현", password_hash="x",
                       funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add(models.Application(
        student_id="20223333", posting_id=posting.posting_id, status="합격"))
    db_session.add_all([
        models.AvailableTime(student_id="20223333", day_of_week=d,
                             start_time=datetime.time(9), end_time=datetime.time(18),
                             preference=2)
        for d in range(1, 6)
    ])
    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=MONDAY + datetime.timedelta(days=13),
        solver_summary={"penalty_summary": {}, "penalty_events": []},
    )
    db_session.add(draft)
    db_session.flush()
    db_session.add(models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20223333",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=datetime.time(9), end_time=datetime.time(12),
    ))
    session = models.ChatSession(
        department_id=dept.department_id, period_start=MONDAY,
        period_end=MONDAY + datetime.timedelta(days=13),
        batch_id=draft.batch_id, created_by="STF900",
    )
    db_session.add(session)
    db_session.commit()
    return session


def test_rule_question_uses_verify_schedule(db_session, verifiable_session):
    """"규정 지키나"류 질문에 결정적 검증기를 부른다 — 짐작으로 답하지 않는다 (#195)."""
    text, calls, status = chat.run_turn(
        db_session, verifiable_session,
        "이 근무표가 규정을 지키고 있는지 확인해줘.",
    )
    tools_used = [c["tool"] for c in calls]
    assert "verify_schedule" in tools_used, f"호출된 툴: {tools_used}"
    assert text.strip()


def test_edit_breaking_availability_is_reported(db_session, verifiable_session):
    """가능 시간 밖으로 옮기는 편집은 적용되지만, 모델이 그 위반을 사용자에게 알린다 (#195).

    apply_draft_edit는 겹침·주간 상한만 보므로 이 편집을 막지 못한다. 쓰기 툴
    결과의 new_violations가 그 구멍을 메우는지, 그리고 모델이 그것을 답변에
    옮기는지가 이 테스트의 관심사다.
    """
    text, calls, status = chat.run_turn(
        db_session, verifiable_session,
        "조수현 학생 9/7 월요일 근무를 저녁 8시부터 10시로 옮겨줘.",
    )
    moves = [c for c in calls if c["tool"] == "move_schedule" and c["result"].get("ok")]
    assert moves, f"편집이 적용되지 않음: {[c['tool'] for c in calls]}"
    assert "new_violations" in moves[0]["result"], moves[0]["result"]

    # 모델이 위반을 삼키고 "완료했습니다"로만 답하면 이 툴을 넣은 의미가 없다
    assert any(
        kw in text for kw in ("가능", "위반", "규정", "벗어", "밖")
    ), f"위반을 알리지 않은 답변: {text}"
