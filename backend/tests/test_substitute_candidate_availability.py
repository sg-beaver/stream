"""대타 후보 탐색이 '그날 실제로 가능한 시간'을 보는지.

예전에는 `available_time` 행을 날것으로 읽어, 행 하나가 요청 구간을 통째로
덮어야만 가능하다고 봤다. 그래서 셋이 어긋났다.

- 그날 "못 나옵니다"를 낸 학생(`availability_exception`)이 그대로 후보에 올랐다
- 지난 학기에 낸 가능 시간으로 이번 학기 근무의 후보가 됐다
- 선호도가 달라 두 행으로 나뉜 연속 구간은 "덮지 못한다"고 보여, 내내 가능한
  학생이 후보에서 사라졌다

기준은 솔버·수합 화면이 쓰는 `materialize_availability`와 같아야 한다 —
"생성은 되는데 대타는 안 되는" 상태가 생기면 안 된다.
"""

from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

WORK_DATE = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7) + timedelta(weeks=2)


def _client_as(db_session, user_id, role):
    def _get_db():
        yield db_session

    def _user():
        return auth.CurrentUser(id=user_id, role=role)

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[auth.get_current_user] = _user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()
    # 날짜 예외를 허용하는 부서 — weekly_only면 예외 자체가 무시되는 게 정상이다
    db_session.add(models.DepartmentPolicy(
        department_id=dept.department_id, availability_mode="weekly_with_exceptions"))
    db_session.add(models.Staff(
        staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"))
    for sid, name in (("20221111", "학생A"), ("20222222", "학생B")):
        db_session.add(models.Student(student_id=sid, name=name, password_hash="x"))
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    for sid in ("20221111", "20222222"):
        db_session.add(models.Application(
            student_id=sid, posting_id=posting.posting_id, status="합격"))
    batch = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=WORK_DATE, period_end=WORK_DATE)
    db_session.add(batch)
    db_session.flush()
    ws = models.WorkSchedule(
        batch_id=batch.batch_id, student_id="20221111", department_id=dept.department_id,
        work_date=WORK_DATE, start_time=time(14, 0), end_time=time(18, 0))
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    return {"department_id": dept.department_id, "schedule": ws}


def _request_id(db_session, scenario):
    """요청은 시나리오당 한 번만 만든다 — 겹치는 구간을 두 번 요청하면 409다."""
    client = _client_as(db_session, "20221111", "student")
    res = client.post("/api/substitute-requests",
                      json={"schedule_id": scenario["schedule"].schedule_id, "reason": "사유"})
    assert res.status_code == 201, res.text
    return res.json()["request_id"]


def _candidate_ids(db_session, request_id):
    staff = _client_as(db_session, "STF001", "staff")
    res = staff.get(f"/api/substitute-requests/{request_id}/candidates")
    assert res.status_code == 200, res.text
    return {c["student_id"] for c in res.json()}


def _weekly(db_session, student_id, start, end, preference=2, term=None):
    db_session.add(models.AvailableTime(
        student_id=student_id, term=term, day_of_week=WORK_DATE.isoweekday(),
        start_time=start, end_time=end, preference=preference, source="manual"))
    db_session.commit()


def test_all_day_unavailable_exception_removes_the_candidate(db_session, scenario):
    """그날 종일 못 나온다고 낸 학생은 후보가 아니다."""
    _weekly(db_session, "20222222", time(8, 0), time(22, 0))
    request_id = _request_id(db_session, scenario)
    assert "20222222" in _candidate_ids(db_session, request_id)  # 예외 전에는 후보

    db_session.add(models.AvailabilityException(
        student_id="20222222", exception_date=WORK_DATE,
        exception_type="UNAVAILABLE", start_time=None, end_time=None))
    db_session.commit()
    assert "20222222" not in _candidate_ids(db_session, request_id)


def test_partial_unavailable_exception_removes_the_candidate(db_session, scenario):
    """요청 구간 일부만 겹치는 부분 예외도 그 구간을 못 덮게 만든다."""
    _weekly(db_session, "20222222", time(8, 0), time(22, 0))
    db_session.add(models.AvailabilityException(
        student_id="20222222", exception_date=WORK_DATE,
        exception_type="UNAVAILABLE", start_time=time(15, 0), end_time=time(16, 0)))
    db_session.commit()
    assert "20222222" not in _candidate_ids(db_session, _request_id(db_session, scenario))


def test_other_terms_availability_does_not_qualify(db_session, scenario):
    """다른 학기에 낸 가능 시간으로는 후보가 되지 않는다."""
    _weekly(db_session, "20222222", time(8, 0), time(22, 0), term="1999-1")
    assert "20222222" not in _candidate_ids(db_session, _request_id(db_session, scenario))


def test_adjacent_intervals_split_by_preference_still_qualify(db_session, scenario):
    """선호도가 달라 두 행으로 나뉘어도 맞닿아 있으면 연속으로 가능한 시간이다.

    학생은 14~18시 내내 가능하다고 냈고, 앞 절반만 '희망'으로 표시했을 뿐이다.
    """
    _weekly(db_session, "20222222", time(14, 0), time(16, 0), preference=3)
    _weekly(db_session, "20222222", time(16, 0), time(18, 0), preference=2)
    assert "20222222" in _candidate_ids(db_session, _request_id(db_session, scenario))


def test_a_real_gap_still_disqualifies(db_session, scenario):
    """맞닿지 않고 사이가 비면 그건 진짜 못 하는 시간이다 — 과잉 허용이 아니다."""
    _weekly(db_session, "20222222", time(14, 0), time(15, 0))
    _weekly(db_session, "20222222", time(17, 0), time(18, 0))
    assert "20222222" not in _candidate_ids(db_session, _request_id(db_session, scenario))
