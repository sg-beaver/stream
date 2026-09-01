"""대타 수락·승인이 후보 조건을 실제로 지키는지.

후보 탐색(`_find_candidates`)은 겹치는 근무·부서·가능시간을 제대로 걸렀지만,
**수락(`/respond`)은 후보 자격을 한 번도 보지 않았고 승인(`/approve`)은 주간
상한만 봤다.** 그래서 목록에 뜨지 않는 학생도 요청 id만 알면 수락할 수 있었고,
승인까지 통과해 확정 근무표에 같은 학생의 겹치는 행이 남았다.

목록에 뜨는 조건과 수락이 통과하는 조건은 **같은 함수**여야 한다 — 갈라지면
"목록엔 없는데 수락은 되는" 상태가 다시 생긴다.
"""

from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

# 지난 근무·D-2 이내는 요청 자체가 막히므로 넉넉히 미래의 월요일로 잡는다
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
    """A(원 근무자, 14~18시 확정)·B(같은 부서 후보)·D(다른 부서)."""
    dept = models.Department(name="정보서비스팀")
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    db_session.add(models.Staff(
        staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"))
    for sid, name in (("20221111", "학생A"), ("20222222", "학생B"), ("20224444", "학생D")):
        db_session.add(models.Student(student_id=sid, name=name, password_hash="x"))

    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    other_posting = models.JobPosting(
        department_id=other_dept.department_id, title="타부서 공고", status="모집중")
    db_session.add_all([posting, other_posting])
    db_session.flush()
    for sid in ("20221111", "20222222"):
        db_session.add(models.Application(
            student_id=sid, posting_id=posting.posting_id, status="합격"))
    db_session.add(models.Application(
        student_id="20224444", posting_id=other_posting.posting_id, status="합격"))

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
    return {"department_id": dept.department_id, "batch": batch, "schedule": ws}


def _available(db_session, student_id, start=time(8, 0), end=time(22, 0), **kwargs):
    db_session.add(models.AvailableTime(
        student_id=student_id, day_of_week=WORK_DATE.isoweekday(),
        start_time=start, end_time=end, preference=2, source="manual", **kwargs))
    db_session.commit()


def _request(db_session, scenario):
    client = _client_as(db_session, "20221111", "student")
    res = client.post("/api/substitute-requests",
                      json={"schedule_id": scenario["schedule"].schedule_id, "reason": "사유"})
    assert res.status_code == 201, res.text
    return res.json()["request_id"]


def _accept(db_session, request_id, student_id):
    return _client_as(db_session, student_id, "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": student_id, "response": "수락"})


# ── 겹치는 근무 ─────────────────────────────────────────────
def test_accept_rejected_when_substitute_already_works_then(db_session, scenario):
    """B가 그 시간에 이미 근무가 있으면 수락 자체가 막혀야 한다."""
    _available(db_session, "20222222")
    db_session.add(models.WorkSchedule(
        batch_id=scenario["batch"].batch_id, student_id="20222222",
        department_id=scenario["department_id"], work_date=WORK_DATE,
        start_time=time(15, 0), end_time=time(17, 0)))
    db_session.commit()

    res = _accept(db_session, _request(db_session, scenario), "20222222")
    assert res.status_code == 409, res.text


def test_approve_rejected_when_work_appears_after_accept(db_session, scenario):
    """수락 뒤에 근무가 생겨도 승인이 막아야 한다 — 상한 재검사와 같은 이유."""
    _available(db_session, "20222222")
    request_id = _request(db_session, scenario)
    assert _accept(db_session, request_id, "20222222").status_code == 200

    # 수락과 승인 사이에 담당자가 B에게 겹치는 근무를 등록했다
    db_session.add(models.WorkSchedule(
        batch_id=scenario["batch"].batch_id, student_id="20222222",
        department_id=scenario["department_id"], work_date=WORK_DATE,
        start_time=time(15, 0), end_time=time(17, 0)))
    db_session.commit()

    staff = _client_as(db_session, "STF001", "staff")
    res = staff.patch(f"/api/substitute-requests/{request_id}/approve")
    assert res.status_code == 409, res.text

    rows = (db_session.query(models.WorkSchedule)
            .filter(models.WorkSchedule.student_id == "20222222",
                    models.WorkSchedule.work_date == WORK_DATE).all())
    assert len(rows) == 1, "승인이 막혔는데도 근무가 늘었다"


# ── 부서 ────────────────────────────────────────────────────
def test_accept_rejected_for_other_department_student(db_session, scenario):
    """대타도 같은 부서 학생이어야 한다 — 승인 직원의 부서만 보면 걸러지지 않는다."""
    _available(db_session, "20224444")
    res = _accept(db_session, _request(db_session, scenario), "20224444")
    assert res.status_code == 409, res.text


# ── 요청자 본인 ─────────────────────────────────────────────
def test_requester_cannot_accept_own_request(db_session, scenario):
    """후보 탐색은 요청자를 빼는데 수락 경로는 보지 않았다."""
    _available(db_session, "20221111")
    res = _accept(db_session, _request(db_session, scenario), "20221111")
    assert res.status_code == 409, res.text


# ── 정상 경로는 그대로 ──────────────────────────────────────
def test_eligible_candidate_still_accepts_and_is_approved(db_session, scenario):
    _available(db_session, "20222222")
    request_id = _request(db_session, scenario)
    assert _accept(db_session, request_id, "20222222").status_code == 200
    staff = _client_as(db_session, "STF001", "staff")
    assert staff.patch(f"/api/substitute-requests/{request_id}/approve").status_code == 200
