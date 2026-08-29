"""근무표 편성 권한 — 학생팀장 (#156).

근무표를 짜는 사람이 늘 직원인 것은 아니다. 근로 학생 중 '학생팀장'이 부서
근무표를 편성하지만, 직원 권한을 통째로 주면 대타 승인·공고 관리까지 열린다.
여기서 고정하는 것은 **어디까지 열리고 어디서 막히는가**다. 부서 정책은 조회만
열었다가 변경까지 열었다 — 편성 기준이 곧 편성 결과이기 때문이다.
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
        # 부서 정책 변경 경로가 열려 있어서(#156) PATCH 대상 행이 필요하다
        models.DepartmentPolicy(department_id=dept.department_id,
                                availability_mode="weekly_only"),
        models.DepartmentPolicy(department_id=other.department_id,
                                availability_mode="weekly_only"),
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
    "draft", "verify", "availability", "availability_dates", "department_schedule",
    "policy", "roster", "class_time", "substitute_list",
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
        "department_schedule": f"/api/schedule/department/{dept_id}",
        # 편성 화면이 그리드를 그리려면 개관 시간대가 필요하다 — 읽기만 열린다
        "policy": f"/api/schedule/policy/{dept_id}",
        # 아래 셋은 편성 화면이 읽는 것들. 명단은 지원자 API(자소서 포함) 대신
        # 학생 목록을 쓴다 — 팀장에게 동료 자소서를 열어줄 수는 없다
        "roster": f"/api/students/department/{dept_id}",
        "class_time": f"/api/class-time/department/{dept_id}",
        "substitute_list": f"/api/substitute-requests/department/{dept_id}",
    }[path]
    assert client.get(url).status_code == 200


def test_staff_still_have_the_same_access(db_session, scenario):
    client = _client_as(db_session, "STF010", "staff")
    assert client.get(_draft_url(scenario)).status_code == 200


def test_team_lead_can_change_own_department_policy(db_session, scenario):
    """부서 설정 변경도 편성 경로다 (#156).

    개관 시간·근무 슬롯·배정 인원·중요도가 곧 편성 결과라, 편성만 맡기고 기준값을
    직원 몫으로 두면 근무표를 짤 때마다 직원 응답을 기다리게 된다.
    """
    client = _client_as(db_session, "20260001", "student")
    res = client.patch(
        f"/api/schedule/policy/{scenario['dept'].department_id}",
        json={"biweekly_max_hours": 150, "custom_rules": "금요일 마감은 경험자 1명"},
    )
    assert res.status_code == 200, res.json()
    assert res.json()["biweekly_max_hours"] == 150

    row = (
        db_session.query(models.DepartmentPolicy)
        .filter(
            models.DepartmentPolicy.department_id == scenario["dept"].department_id
        )
        .first()
    )
    assert row.biweekly_max_hours == 150
    assert row.custom_rules == "금요일 마감은 경험자 1명"


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


def test_team_lead_cannot_change_another_departments_policy(db_session, scenario):
    """정책 변경이 열려도 부서 경계는 그대로다."""
    client = _client_as(db_session, "20260001", "student")
    res = client.patch(
        f"/api/schedule/policy/{scenario['other'].department_id}",
        json={"biweekly_max_hours": 150},
    )
    assert res.status_code == 403
    assert "본인 소속 부서" in res.json()["error"]


def test_ordinary_student_cannot_change_department_policy(db_session, scenario):
    """팀장이 아닌 근로 학생에게는 여전히 닫혀 있다."""
    client = _client_as(db_session, "20260002", "student")
    res = client.patch(
        f"/api/schedule/policy/{scenario['dept'].department_id}",
        json={"biweekly_max_hours": 150},
    )
    assert res.status_code == 403
    assert "편성할 권한" in res.json()["error"]


def test_team_lead_can_request_ai_review_of_own_department(db_session, scenario):
    """AI 검토도 편성 경로다. 부서 규칙이 없으면 조용한 실패(200 + no_rules)."""
    client = _client_as(db_session, "20260001", "student")
    res = client.post("/api/schedule/review", json={"batch_id": scenario["batch"].batch_id})
    assert res.status_code == 200
    assert res.json()["review_available"] is False


def test_ai_review_of_another_department_is_403(db_session, scenario):
    """검토는 배치 ID만 받으므로, 남의 부서 배치 번호를 넣어도 막혀야 한다."""
    client = _client_as(db_session, "20260003", "student")
    res = client.post("/api/schedule/review", json={"batch_id": scenario["batch"].batch_id})
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


# ---- 학생팀장 지정 (#156) ----


def test_staff_can_promote_and_demote_a_team_lead(db_session, scenario):
    client = _client_as(db_session, "STF010", "staff")
    promoted = client.patch(
        "/api/students/20260002/team-lead", json={"is_team_lead": True}
    )
    assert promoted.status_code == 200, promoted.json()
    assert promoted.json()["is_team_lead"] is True

    # 지정되면 곧바로 편성 경로가 열린다
    assert _client_as(db_session, "20260002", "student").get(
        _draft_url(scenario)
    ).status_code == 200

    # _client_as는 app.dependency_overrides를 갈아끼우므로 직원으로 다시 잡는다
    demoted = _client_as(db_session, "STF010", "staff").patch(
        "/api/students/20260002/team-lead", json={"is_team_lead": False}
    )
    assert demoted.json()["is_team_lead"] is False
    assert _client_as(db_session, "20260002", "student").get(
        _draft_url(scenario)
    ).status_code == 403


def test_team_lead_cannot_promote_others(db_session, scenario):
    """팀장이 팀장을 만들 수 있으면 권한 경계가 스스로 넓어진다."""
    client = _client_as(db_session, "20260001", "student")
    res = client.patch("/api/students/20260002/team-lead", json={"is_team_lead": True})
    assert res.status_code == 403


def test_staff_cannot_promote_a_student_of_another_department(db_session, scenario):
    client = _client_as(db_session, "STF010", "staff")
    res = client.patch("/api/students/20260003/team-lead", json={"is_team_lead": True})
    assert res.status_code == 403


def test_login_gives_a_team_lead_their_department_scope(db_session, scenario):
    """편성 화면은 부서 스코프로 API를 부른다 — 로그인 응답에 부서가 없으면 못 쓴다."""
    from app.auth import hash_password

    for student_id in ("20260001", "20260002"):
        row = db_session.query(models.Student).filter(
            models.Student.student_id == student_id
        ).first()
        row.password_hash = hash_password("stream1234")
    db_session.commit()

    client = _client_as(db_session, "20260001", "student")
    lead = client.post("/api/auth/login", json={
        "id": "20260001", "password": "stream1234", "role": "student",
    }).json()
    assert lead["is_team_lead"] is True
    assert lead["department_id"] == scenario["dept"].department_id

    ordinary = client.post("/api/auth/login", json={
        "id": "20260002", "password": "stream1234", "role": "student",
    }).json()
    assert ordinary["is_team_lead"] is False
    assert ordinary["department_id"] is None


def test_team_lead_cannot_read_cover_letters(db_session, scenario):
    """지원자 API는 자소서 본문을 담는다 — 팀장에게 동료 자소서를 열어줄 수 없다."""
    client = _client_as(db_session, "20260001", "student")
    assert client.get("/api/applications/posting/1").status_code == 403
