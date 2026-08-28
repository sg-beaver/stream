"""GET /api/schedule/draft 테스트 (#137, REQ-SCHED-022).

챗봇이 draft를 고친 뒤 화면이 최신 상태를 다시 읽는 경로. 이 조회가 없으면
화면은 generate 응답을 그대로 들고 있어 챗봇 변경이 빠진 옛 배정으로
확정된다 — 그 시나리오를 여기서 고정한다.
"""

import datetime

import pytest

from app import models
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

MONDAY = datetime.date(2026, 9, 7)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀")
    other = models.Department(name="다른 부서")
    db_session.add_all([dept, other])
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Staff(staff_id="STF002", name="타부서", department_id=other.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x"),
    ])
    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END,
        solver_summary={
            "status": "OPTIMAL", "solve_time_seconds": 7.0,
            "penalty_summary": {"meal_break": 40}, "shortages": [], "per_student": [],
        },
    )
    confirmed = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=MONDAY, period_end=PERIOD_END,
    )
    db_session.add_all([draft, confirmed])
    db_session.flush()
    row = models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=_t("09:00"), end_time=_t("12:00"),
    )
    db_session.add(row)
    db_session.add(models.WorkSchedule(
        batch_id=confirmed.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=_t("18:00"), end_time=_t("20:00"),
    ))
    db_session.commit()
    return {"dept": dept, "draft": draft, "row": row}


def _get(client, scenario):
    return client.get(
        "/api/schedule/draft"
        f"?department_id={scenario['dept'].department_id}"
        f"&period_start={MONDAY.isoformat()}&period_end={PERIOD_END.isoformat()}"
    )


def test_returns_draft_rows_only(db_session, scenario):
    """draft 배정만 — 같은 기간의 confirmed 배정은 섞이지 않는다."""
    client = _client_as(db_session, "STF001", "staff")
    res = _get(client, scenario)
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["batch_id"] == scenario["draft"].batch_id
    assert len(body["schedules"]) == 1
    item = body["schedules"][0]
    assert item["student_id"] == "20221111"
    assert item["student_name"] == "학생A"
    assert item["start_time"] == "09:00"
    assert item["day_of_week"] == "월"
    assert body["status"] == "OPTIMAL"
    assert body["penalty_summary"] == {"meal_break": 40}


def test_reflects_edit_made_after_generate(db_session, scenario):
    """챗봇 편집(여기서는 직접 수정)이 조회에 그대로 반영된다 — 이 PR의 핵심."""
    scenario["row"].start_time = _t("13:00")
    scenario["row"].end_time = _t("16:00")
    db_session.commit()

    client = _client_as(db_session, "STF001", "staff")
    res = _get(client, scenario)
    assert res.status_code == 200
    assert res.json()["schedules"][0]["start_time"] == "13:00"


def test_missing_draft_is_404(db_session, scenario):
    client = _client_as(db_session, "STF001", "staff")
    res = client.get(
        "/api/schedule/draft"
        f"?department_id={scenario['dept'].department_id}"
        "&period_start=2027-01-04&period_end=2027-01-17"
    )
    assert res.status_code == 404


def test_other_department_staff_is_403(db_session, scenario):
    client = _client_as(db_session, "STF002", "staff")
    assert _get(client, scenario).status_code == 403


def test_student_role_is_403(db_session, scenario):
    client = _client_as(db_session, "20221111", "student")
    assert _get(client, scenario).status_code == 403
