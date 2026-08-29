"""근무표 편성 권한 — 학생팀장 (#156).

근무표를 짜는 사람이 늘 직원인 것은 아니다. 근로 학생 중 '학생팀장'이 부서
근무표를 편성하지만, 직원 권한을 통째로 주면 대타 승인·공고 관리·부서 정책
변경까지 열린다. 여기서 고정하는 것은 **어디까지 열리고 어디서 막히는가**다.
"""

import datetime

import pytest

from app import models
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

TUESDAY = datetime.date(2026, 9, 1)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    """부서 2곳 · 직원 1명 · 같은 부서의 학생팀장/일반 학생 · 다른 부서의 학생팀장."""
    dept = models.Department(name="정보서비스팀-test")
    other = models.Department(name="다른 부서")
    db_session.add_all([dept, other])
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF010", name="담당자",
                     department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20260001", name="학생팀장", password_hash="x",
                       funding_type="gyobi", is_team_lead=True),
        models.Student(student_id="20260002", name="일반 근로학생", password_hash="x",
                       funding_type="gyobi", is_team_lead=False),
        models.Student(student_id="20260003", name="타부서 학생팀장", password_hash="x",
                       funding_type="gyobi", is_team_lead=True),
        models.JobPosting(posting_id=1, department_id=dept.department_id, title="공고"),
        models.JobPosting(posting_id=2, department_id=other.department_id, title="타부서 공고"),
    ])
    db_session.add_all([
        models.Application(student_id="20260001", posting_id=1, status="합격"),
        models.Application(student_id="20260002", posting_id=1, status="합격"),
        models.Application(student_id="20260003", posting_id=2, status="합격"),
    ])
    batch = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=TUESDAY, period_end=TUESDAY,
        solver_summary={"status": "OPTIMAL"},
    )
    db_session.add(batch)
    db_session.flush()
    db_session.add(models.WorkSchedule(
        batch_id=batch.batch_id, student_id="20260002",
        department_id=dept.department_id, work_date=TUESDAY,
        start_time=_t("09:00"), end_time=_t("12:00"),
    ))
    db_session.commit()
    return {"dept": dept, "other": other, "batch": batch}


def _draft_url(scenario):
    return (f"/api/schedule/draft?department_id={scenario['dept'].department_id}"
            f"&period_start={TUESDAY}&period_end={TUESDAY}")


# ---- 열리는 것: 근무표 편성 경로 ----


@pytest.mark.parametrize("path", [
    "draft", "verify", "availability", "availability_dates",
])
def test_team_lead_can_use_schedule_editing_paths(db_session, scenario, path):
    client = _client_as(db_session, "20260001", "student")
    dept_id = scenario["dept"].department_id
    url = {
        "draft": _draft_url(scenario),
        "verify": f"/api/schedule/verify?batch_id={scenario['batch'].batch_id}",
        "availability": f"/api/availability/department/{dept_id}",
        "availability_dates": (
            f"/api/availability/department/{dept_id}/dates"
            f"?from_date={TUESDAY}&to_date={TUESDAY}"
        ),
    }[path]
    assert client.get(url).status_code == 200


def test_staff_still_have_the_same_access(db_session, scenario):
    client = _client_as(db_session, "STF010", "staff")
    assert client.get(_draft_url(scenario)).status_code == 200


# ---- 막히는 것 ----


def test_ordinary_student_cannot_edit_schedules(db_session, scenario):
    """근로 학생이라도 팀장이 아니면 편성 경로에 못 들어온다."""
    client = _client_as(db_session, "20260002", "student")
    res = client.get(_draft_url(scenario))
    assert res.status_code == 403
    assert "편성할 권한" in res.json()["error"]


def test_team_lead_of_another_department_is_403(db_session, scenario):
    """권한 자체는 있어도 자기가 일하는 부서 밖은 건드릴 수 없다."""
    client = _client_as(db_session, "20260003", "student")
    res = client.get(_draft_url(scenario))
    assert res.status_code == 403
    assert "본인 소속 부서" in res.json()["error"]


def test_team_lead_cannot_change_department_policy(db_session, scenario):
    """부서 정책 변경은 직원 몫 — 가중치·개관 시간은 운영 결정이다."""
    client = _client_as(db_session, "20260001", "student")
    res = client.patch(
        f"/api/schedule/policy/{scenario['dept'].department_id}",
        json={"min_per_slot": 2},
    )
    assert res.status_code == 403


def test_team_lead_cannot_approve_substitute_requests(db_session, scenario):
    """대타 승인은 학생팀장의 권한이 아니다."""
    row = (
        db_session.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == scenario["batch"].batch_id)
        .first()
    )
    request = models.SubstituteRequest(
        schedule_id=row.schedule_id, requester_id="20260002",
        start_time=row.start_time, end_time=row.end_time,
        substitute_id="20260001", status="수락",
    )
    db_session.add(request)
    db_session.commit()

    client = _client_as(db_session, "20260001", "student")
    res = client.patch(f"/api/substitute-requests/{request.request_id}/approve", json={})
    assert res.status_code == 403


def test_team_lead_cannot_manage_postings(db_session, scenario):
    client = _client_as(db_session, "20260001", "student")
    res = client.post("/api/postings", json={
        "department_id": scenario["dept"].department_id,
        "title": "학생팀장이 올린 공고",
        "description": "x",
    })
    assert res.status_code == 403
