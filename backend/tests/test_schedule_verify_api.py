"""GET /api/schedule/verify 테스트 (#156).

배치가 SPEC 3장 Hard Constraint를 지키는지 결정적으로 검증하는 경로.
검증 로직 자체는 tests/scheduler/test_verify_batch.py에서 다루고,
여기서는 라우터의 권한·응답 계약만 고정한다.
"""

import datetime

import pytest

from app import models
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

TUESDAY = datetime.date(2026, 9, 1)  # 2026-2학기 평일, 개관 08:00~22:00


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
        models.Student(student_id="20221111", name="학생A", password_hash="x", funding_type="gyobi"),
        models.JobPosting(posting_id=1, department_id=dept.department_id, title="공고"),
    ])
    db_session.add(models.Application(student_id="20221111", posting_id=1, status="합격"))
    db_session.add(
        models.AvailableTime(
            student_id="20221111", day_of_week=2,
            start_time=_t("09:00"), end_time=_t("12:00"), preference=2,
        )
    )
    batch = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=TUESDAY, period_end=TUESDAY,
    )
    db_session.add(batch)
    db_session.flush()
    # 가용 시간(09:00~12:00) 밖으로 한 시간 넘겨 배정 — HC-CLASS-1 위반
    db_session.add(models.WorkSchedule(
        batch_id=batch.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=TUESDAY,
        start_time=_t("09:00"), end_time=_t("13:00"),
    ))
    db_session.commit()
    return {"dept": dept, "batch": batch}


def test_reports_violations_of_a_confirmed_batch(db_session, scenario):
    client = _client_as(db_session, "STF001", "staff")
    res = client.get(f"/api/schedule/verify?batch_id={scenario['batch'].batch_id}")

    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "confirmed"
    assert body["solver_generated"] is False  # 손으로 넣은 배치
    assert body["ok"] is False
    violations = {v["rule"] for v in body["violations"]}
    assert "HC-CLASS-1" in violations
    assert "PROVENANCE" in violations
    assert body["coverage"]["open_slots"] == 28


def test_missing_batch_is_404(db_session, scenario):
    client = _client_as(db_session, "STF001", "staff")
    assert client.get("/api/schedule/verify?batch_id=99999").status_code == 404


def test_other_department_staff_is_403(db_session, scenario):
    client = _client_as(db_session, "STF002", "staff")
    res = client.get(f"/api/schedule/verify?batch_id={scenario['batch'].batch_id}")
    assert res.status_code == 403


def test_student_cannot_verify(db_session, scenario):
    client = _client_as(db_session, "20221111", "student")
    res = client.get(f"/api/schedule/verify?batch_id={scenario['batch'].batch_id}")
    assert res.status_code == 403
