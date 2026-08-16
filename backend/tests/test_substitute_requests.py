"""POST/GET/PATCH /api/substitute-requests* — 대타 요청·후보 탐색·수락/거절·승인 (REQ-SUB-001~006)."""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app


def _client_as(db_session, user_id, role):
    """주어진 사용자로 요청을 보내는 TestClient. db_session은 시나리오 전체가 공유한다."""

    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id=user_id, role=role)

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def scenario(db_session):
    """부서 1곳(+다른 부서 1곳), 직원 2명, 학생 3명(A=원 근무자, B·C=대타 후보), A의 확정 근무 1건."""
    dept = models.Department(name="정보서비스팀")
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    staff = models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x")
    other_staff = models.Staff(
        staff_id="STF002", name="타부서 담당자", department_id=other_dept.department_id, password_hash="x"
    )
    student_a = models.Student(student_id="20221111", name="학생A", password_hash="x")
    student_b = models.Student(student_id="20222222", name="학생B", password_hash="x")
    student_c = models.Student(student_id="20223333", name="학생C", password_hash="x")
    db_session.add_all([staff, other_staff, student_a, student_b, student_c])

    posting = models.JobPosting(department_id=dept.department_id, title="테스트 공고", status="모집중")
    db_session.add(posting)
    db_session.flush()

    # get_department_student_ids는 "해당 부서 공고에 합격한" 학생을 부서 소속으로 본다
    db_session.add_all(
        [
            models.Application(student_id=s, posting_id=posting.posting_id, status="합격")
            for s in ("20221111", "20222222", "20223333")
        ]
    )

    batch = models.ScheduleBatch(
        department_id=dept.department_id,
        status="confirmed",
        period_start=date(2026, 8, 10),
        period_end=date(2026, 8, 10),
    )
    db_session.add(batch)
    db_session.flush()

    # 2026-08-10은 월요일 (day_of_week=1, AvailableTime과 동일 기준)
    work_schedule = models.WorkSchedule(
        batch_id=batch.batch_id,
        student_id="20221111",
        department_id=dept.department_id,
        work_date=date(2026, 8, 10),
        start_time=time(14, 0),
        end_time=time(18, 0),
    )
    db_session.add(work_schedule)

    # B, C 모두 그 시간대에 가능 — 어느 쪽이 먼저 수락하는지로 시나리오를 나눈다
    db_session.add(
        models.AvailableTime(
            student_id="20222222", day_of_week=1, start_time=time(13, 0), end_time=time(19, 0),
            preference=2, source="manual",
        )
    )
    db_session.add(
        models.AvailableTime(
            student_id="20223333", day_of_week=1, start_time=time(13, 0), end_time=time(19, 0),
            preference=2, source="manual",
        )
    )
    db_session.commit()
    db_session.refresh(work_schedule)

    return {"department_id": dept.department_id, "other_department_id": other_dept.department_id, "schedule": work_schedule}


def _create_request(db_session, scenario):
    client = _client_as(db_session, "20221111", "student")
    res = client.post(
        "/api/substitute-requests",
        json={"schedule_id": scenario["schedule"].schedule_id, "reason": "시험 일정과 겹침"},
    )
    assert res.status_code == 201
    return res.json()["request_id"]


def test_create_substitute_request(db_session, scenario):
    client = _client_as(db_session, "20221111", "student")
    res = client.post(
        "/api/substitute-requests",
        json={"schedule_id": scenario["schedule"].schedule_id, "reason": "시험 일정과 겹침"},
    )
    assert res.status_code == 201
    assert res.json() == {"request_id": res.json()["request_id"], "status": "대기"}


def test_create_rejects_other_students_schedule(db_session, scenario):
    client = _client_as(db_session, "20222222", "student")  # B가 A의 근무를 요청
    res = client.post("/api/substitute-requests", json={"schedule_id": scenario["schedule"].schedule_id})
    assert res.status_code == 403


def test_create_conflicts_when_already_open(db_session, scenario):
    _create_request(db_session, scenario)
    client = _client_as(db_session, "20221111", "student")
    res = client.post("/api/substitute-requests", json={"schedule_id": scenario["schedule"].schedule_id})
    assert res.status_code == 409


def test_list_candidates_finds_b_and_c_excludes_a(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "20221111", "student")
    res = client.get(f"/api/substitute-requests/{request_id}/candidates")
    assert res.status_code == 200
    ids = {c["student_id"] for c in res.json()}
    assert ids == {"20222222", "20223333"}


def test_list_candidates_staff_own_department_ok(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "STF001", "staff")
    res = client.get(f"/api/substitute-requests/{request_id}/candidates")
    assert res.status_code == 200


def test_list_candidates_staff_other_department_forbidden(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "STF002", "staff")
    res = client.get(f"/api/substitute-requests/{request_id}/candidates")
    assert res.status_code == 403


def test_respond_accept_sets_status(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "20222222", "student")
    res = client.patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    assert res.status_code == 200
    assert res.json() == {"request_id": request_id, "status": "수락"}


def test_respond_decline_leaves_pending(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "20223333", "student")
    res = client.patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20223333", "response": "거절"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "대기"  # 다른 후보가 계속 수락할 수 있어야 함


def test_respond_forbidden_for_other_student(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "20222222", "student")  # B가 C 명의로 응답 시도
    res = client.patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20223333", "response": "수락"},
    )
    assert res.status_code == 403


def test_respond_conflicts_after_someone_already_accepted(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    res = _client_as(db_session, "20223333", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20223333", "response": "수락"},
    )
    assert res.status_code == 409


def test_approve_requires_accepted_candidate(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    client = _client_as(db_session, "STF001", "staff")
    res = client.patch(f"/api/substitute-requests/{request_id}/approve")
    assert res.status_code == 400


def test_approve_reassigns_schedule_to_substitute(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )

    client = _client_as(db_session, "STF001", "staff")
    res = client.patch(f"/api/substitute-requests/{request_id}/approve")
    assert res.status_code == 200
    assert res.json() == {"request_id": request_id, "status": "승인", "approved_by": "STF001"}

    db_session.refresh(scenario["schedule"])
    assert scenario["schedule"].student_id == "20222222"  # 원래 A 근무가 B로 교체됨


def test_approve_other_department_forbidden(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    client = _client_as(db_session, "STF002", "staff")
    res = client.patch(f"/api/substitute-requests/{request_id}/approve")
    assert res.status_code == 403


def test_list_department_requests(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )

    client = _client_as(db_session, "STF001", "staff")
    res = client.get(f"/api/substitute-requests/department/{scenario['department_id']}")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    item = items[0]
    assert item["request_id"] == request_id
    assert item["requester_id"] == "20221111"
    assert item["requester_name"] == "학생A"
    assert item["status"] == "수락"
    assert item["substitute_id"] == "20222222"
    assert item["substitute_name"] == "학생B"
    assert item["date"] == "2026-08-10"


def test_list_department_requests_other_department_forbidden(db_session, scenario):
    _create_request(db_session, scenario)
    client = _client_as(db_session, "STF002", "staff")
    res = client.get(f"/api/substitute-requests/department/{scenario['department_id']}")
    assert res.status_code == 403


def _accept_as_b(db_session, request_id):
    res = _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    assert res.status_code == 200


# ---- GET /me — 내 대타 요청·대타 근무 기록 ----

def test_my_requests_shows_requester_and_substitute_roles(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _accept_as_b(db_session, request_id)

    res_a = _client_as(db_session, "20221111", "student").get("/api/substitute-requests/me")
    assert res_a.status_code == 200
    assert [(r["request_id"], r["role"]) for r in res_a.json()] == [(request_id, "requester")]
    assert res_a.json()[0]["schedule_id"] == scenario["schedule"].schedule_id

    res_b = _client_as(db_session, "20222222", "student").get("/api/substitute-requests/me")
    assert [(r["request_id"], r["role"]) for r in res_b.json()] == [(request_id, "substitute")]

    res_c = _client_as(db_session, "20223333", "student").get("/api/substitute-requests/me")
    assert res_c.json() == []


def test_my_requests_forbidden_for_staff(db_session, scenario):
    res = _client_as(db_session, "STF001", "staff").get("/api/substitute-requests/me")
    assert res.status_code == 403


# ---- GET /open — 내가 후보인 대기 중 요청 ----

def test_open_requests_visible_to_eligible_candidates_only(db_session, scenario):
    request_id = _create_request(db_session, scenario)

    res_b = _client_as(db_session, "20222222", "student").get("/api/substitute-requests/open")
    assert res_b.status_code == 200
    assert [r["request_id"] for r in res_b.json()] == [request_id]
    assert res_b.json()[0]["requester_name"] == "학생A"

    # 요청자 본인에게는 보이지 않는다
    res_a = _client_as(db_session, "20221111", "student").get("/api/substitute-requests/open")
    assert res_a.json() == []


def test_open_requests_disappear_after_accept(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _accept_as_b(db_session, request_id)

    res_c = _client_as(db_session, "20223333", "student").get("/api/substitute-requests/open")
    assert res_c.json() == []  # "대기" 상태가 아니므로 응답 대상에서 빠진다


# ---- PATCH /reject — 직원 반려 (REQ-SUB-008) ----

def test_reject_sets_status_and_reason(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _accept_as_b(db_session, request_id)

    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/reject",
        json={"reject_reason": "해당 주 근무 인원 조정 필요"},
    )
    assert res.status_code == 200
    assert res.json() == {
        "request_id": request_id, "status": "반려",
        "reject_reason": "해당 주 근무 인원 조정 필요",
    }

    # 근무표는 원 근무자에게 그대로 남는다
    db_session.refresh(scenario["schedule"])
    assert scenario["schedule"].student_id == "20221111"


def test_reject_forbidden_for_other_department(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    res = _client_as(db_session, "STF002", "staff").patch(
        f"/api/substitute-requests/{request_id}/reject", json={}
    )
    assert res.status_code == 403


def test_reject_conflicts_after_approve(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _accept_as_b(db_session, request_id)
    _client_as(db_session, "STF001", "staff").patch(f"/api/substitute-requests/{request_id}/approve")

    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/reject", json={}
    )
    assert res.status_code == 409


def test_respond_conflicts_after_reject(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/reject", json={"reject_reason": "일정 조정"}
    )

    res = _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    assert res.status_code == 409


def test_can_recreate_request_after_reject(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/reject", json={}
    )

    res = _client_as(db_session, "20221111", "student").post(
        "/api/substitute-requests",
        json={"schedule_id": scenario["schedule"].schedule_id, "reason": "다시 요청"},
    )
    assert res.status_code == 201
