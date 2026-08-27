"""POST/GET/PATCH /api/substitute-requests* — 대타 요청·후보 탐색·수락/거절·승인 (REQ-SUB-001~006)."""

from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

# 지난 근무는 대타 요청·수락·승인이 막히므로 시나리오 근무일은 항상 미래의
# 월요일로 잡는다 (day_of_week=1, AvailableTime과 동일 기준).
WORK_DATE = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)


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
        period_start=WORK_DATE,
        period_end=WORK_DATE,
    )
    db_session.add(batch)
    db_session.flush()

    work_schedule = models.WorkSchedule(
        batch_id=batch.batch_id,
        student_id="20221111",
        department_id=dept.department_id,
        work_date=WORK_DATE,
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
    assert item["date"] == WORK_DATE.isoformat()


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


# ---- 지난 근무·재확정 배치 가드, 승인 후 재요청 ----

def _approve_transfer_to_b(db_session, scenario):
    """A의 근무를 B에게 승인 이전한 상태를 만든다."""
    request_id = _create_request(db_session, scenario)
    _accept_as_b(db_session, request_id)
    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/approve"
    )
    assert res.status_code == 200
    return request_id


def test_create_rejects_past_schedule(db_session, scenario):
    schedule = scenario["schedule"]
    schedule.work_date = date.today() - timedelta(days=1)
    db_session.commit()

    res = _client_as(db_session, "20221111", "student").post(
        "/api/substitute-requests", json={"schedule_id": schedule.schedule_id}
    )
    assert res.status_code == 400


def test_open_and_respond_exclude_past_schedule(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    scenario["schedule"].work_date = date.today() - timedelta(days=1)
    db_session.commit()

    res_b = _client_as(db_session, "20222222", "student").get("/api/substitute-requests/open")
    assert res_b.json() == []

    res = _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    assert res.status_code == 409


def test_open_and_approve_exclude_superseded_batch(db_session, scenario):
    request_id = _create_request(db_session, scenario)
    _accept_as_b(db_session, request_id)
    scenario["schedule"].batch.status = "superseded"
    db_session.commit()

    res_c = _client_as(db_session, "20223333", "student").get("/api/substitute-requests/open")
    assert res_c.json() == []

    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/approve"
    )
    assert res.status_code == 409
    db_session.refresh(scenario["schedule"])
    assert scenario["schedule"].student_id == "20221111"  # 근무표는 그대로


def test_transferred_schedule_can_be_rerequested_by_new_owner(db_session, scenario):
    _approve_transfer_to_b(db_session, scenario)

    # 근무를 넘겨받은 B가 같은 근무의 대타를 다시 구할 수 있어야 한다
    res = _client_as(db_session, "20222222", "student").post(
        "/api/substitute-requests",
        json={"schedule_id": scenario["schedule"].schedule_id, "reason": "일정 변경"},
    )
    assert res.status_code == 201


# ---- 부분 대타 — 근무 일부 구간만 요청·승인 (#123) ----

def _post_request(db_session, scenario, start=None, end=None, student="20221111"):
    """구간을 지정해 대타 요청을 등록한다. start/end가 None이면 근무 전체 요청."""
    body = {"schedule_id": scenario["schedule"].schedule_id, "reason": "부분 대타"}
    if start is not None:
        body["start_time"] = start
    if end is not None:
        body["end_time"] = end
    return _client_as(db_session, student, "student").post("/api/substitute-requests", json=body)


def _day_rows(db_session, scenario):
    """그날 그 부서 근무표를 (시작, 종료, 담당 학생) 튜플로 정렬해 돌려준다."""
    db_session.expire_all()
    rows = (
        db_session.query(models.WorkSchedule)
        .filter(
            models.WorkSchedule.work_date == WORK_DATE,
            models.WorkSchedule.department_id == scenario["department_id"],
        )
        .all()
    )
    return sorted((r.start_time, r.end_time, r.student_id) for r in rows)


def _accept_and_approve(db_session, request_id):
    _accept_as_b(db_session, request_id)
    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/approve"
    )
    assert res.status_code == 200


def test_create_partial_segment_stores_segment(db_session, scenario):
    res = _post_request(db_session, scenario, "15:00", "16:30")
    assert res.status_code == 201

    request = db_session.query(models.SubstituteRequest).one()
    assert (request.start_time, request.end_time) == (time(15, 0), time(16, 30))


def test_create_without_segment_defaults_to_whole_shift(db_session, scenario):
    """구간을 생략한 기존 클라이언트의 요청은 근무 전체 구간으로 저장된다."""
    assert _post_request(db_session, scenario).status_code == 201

    request = db_session.query(models.SubstituteRequest).one()
    assert (request.start_time, request.end_time) == (time(14, 0), time(18, 0))


@pytest.mark.parametrize(
    "start,end",
    [
        ("14:00", "15:00"),  # 근무 시작과 일치하는 경계 구간
        ("17:00", "18:00"),  # 근무 끝과 일치하는 경계 구간
        ("15:00", "16:30"),  # 근무 한가운데 구간
        ("14:00", "18:00"),  # 근무 전체를 명시한 구간
    ],
)
def test_create_accepts_valid_segments(db_session, scenario, start, end):
    assert _post_request(db_session, scenario, start, end).status_code == 201


def test_create_rejects_segment_outside_shift(db_session, scenario):
    """근무(14:00-18:00) 밖으로 삐져나온 구간은 거부된다."""
    assert _post_request(db_session, scenario, "13:00", "15:00").status_code == 400
    assert _post_request(db_session, scenario, "17:00", "19:00").status_code == 400
    assert _post_request(db_session, scenario, "09:00", "10:00").status_code == 400


@pytest.mark.parametrize(
    "start,end",
    [
        ("15:15", "16:00"),  # 30분 격자에 맞지 않는 시작
        ("15:00", "16:20"),  # 30분 격자에 맞지 않는 종료
        ("15:00", "15:00"),  # 길이 0
        ("16:00", "15:00"),  # 종료가 시작보다 앞
    ],
)
def test_create_rejects_malformed_segments(db_session, scenario, start, end):
    assert _post_request(db_session, scenario, start, end).status_code == 422


def test_create_rejects_half_specified_segment(db_session, scenario):
    """한쪽만 보낸 구간은 '전체 요청'으로 오해될 수 있으므로 거부한다."""
    assert _post_request(db_session, scenario, start="15:00").status_code == 422
    assert _post_request(db_session, scenario, end="16:00").status_code == 422


def test_create_allows_disjoint_segments_on_same_shift(db_session, scenario):
    """불연속 선택은 구간별 요청으로 쪼개져 들어온다 — 같은 근무라도 겹치지 않으면 통과."""
    assert _post_request(db_session, scenario, "14:00", "15:00").status_code == 201
    assert _post_request(db_session, scenario, "16:00", "17:00").status_code == 201
    assert db_session.query(models.SubstituteRequest).count() == 2


def test_create_conflicts_on_overlapping_segment(db_session, scenario):
    assert _post_request(db_session, scenario, "14:00", "16:00").status_code == 201
    assert _post_request(db_session, scenario, "15:00", "17:00").status_code == 409
    # 경계만 맞닿는 구간은 겹치는 게 아니다
    assert _post_request(db_session, scenario, "16:00", "17:00").status_code == 201


def test_approve_splits_shift_into_three(db_session, scenario):
    """14:00-18:00 근무 중 15:00-16:30만 대타 → 앞·대타·뒤 3구간으로 쪼개진다."""
    res = _post_request(db_session, scenario, "15:00", "16:30")
    _accept_and_approve(db_session, res.json()["request_id"])

    assert _day_rows(db_session, scenario) == [
        (time(14, 0), time(15, 0), "20221111"),
        (time(15, 0), time(16, 30), "20222222"),
        (time(16, 30), time(18, 0), "20221111"),
    ]


def test_approve_boundary_segment_splits_into_two(db_session, scenario):
    """근무 시작과 맞닿은 구간이면 빈 앞 구간은 만들지 않는다."""
    res = _post_request(db_session, scenario, "14:00", "15:00")
    _accept_and_approve(db_session, res.json()["request_id"])

    assert _day_rows(db_session, scenario) == [
        (time(14, 0), time(15, 0), "20222222"),
        (time(15, 0), time(18, 0), "20221111"),
    ]


def test_approve_whole_shift_keeps_single_row(db_session, scenario):
    """근무 전체 대타는 예전처럼 담당 학생만 바뀐 한 행으로 남는다 (REQ-SUB-005)."""
    res = _post_request(db_session, scenario, "14:00", "18:00")
    _accept_and_approve(db_session, res.json()["request_id"])

    assert _day_rows(db_session, scenario) == [(time(14, 0), time(18, 0), "20222222")]


def test_approve_keeps_batch_department_and_date_on_split_rows(db_session, scenario):
    res = _post_request(db_session, scenario, "15:00", "16:30")
    _accept_and_approve(db_session, res.json()["request_id"])

    db_session.expire_all()
    rows = (
        db_session.query(models.WorkSchedule)
        .filter(models.WorkSchedule.work_date == WORK_DATE)
        .all()
    )
    assert len(rows) == 3
    assert {r.batch_id for r in rows} == {scenario["schedule"].batch_id}
    assert {r.department_id for r in rows} == {scenario["department_id"]}


def test_approved_request_points_at_substitute_row(db_session, scenario):
    """요청의 schedule_id는 승인 뒤 '대타가 맡은 행'을 가리켜야 한다 (근무표 화면 매칭용)."""
    res = _post_request(db_session, scenario, "15:00", "16:30")
    request_id = res.json()["request_id"]
    _accept_and_approve(db_session, request_id)

    db_session.expire_all()
    request = db_session.get(models.SubstituteRequest, request_id)
    linked = db_session.get(models.WorkSchedule, request.schedule_id)
    assert (linked.start_time, linked.end_time, linked.student_id) == (
        time(15, 0), time(16, 30), "20222222",
    )


def test_approve_repoints_other_open_request_to_remainder_row(db_session, scenario):
    """같은 근무의 다른 진행 중 요청은 분할 뒤 잔여 구간 행으로 옮겨 붙는다."""
    first = _post_request(db_session, scenario, "14:00", "15:00").json()["request_id"]
    second = _post_request(db_session, scenario, "16:00", "17:00").json()["request_id"]
    original_schedule_id = scenario["schedule"].schedule_id

    _accept_and_approve(db_session, first)

    db_session.expire_all()
    moved = db_session.get(models.SubstituteRequest, second)
    assert moved.schedule_id != original_schedule_id
    remainder = db_session.get(models.WorkSchedule, moved.schedule_id)
    # 16:00-17:00은 남은 15:00-18:00 구간 안에 들어간다
    assert (remainder.start_time, remainder.end_time, remainder.student_id) == (
        time(15, 0), time(18, 0), "20221111",
    )
    # 옮겨진 요청은 그대로 승인까지 갈 수 있어야 한다
    res = _client_as(db_session, "20223333", "student").patch(
        f"/api/substitute-requests/{second}/respond",
        json={"substitute_id": "20223333", "response": "수락"},
    )
    assert res.status_code == 200
    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{second}/approve"
    )
    assert res.status_code == 200
    assert _day_rows(db_session, scenario) == [
        (time(14, 0), time(15, 0), "20222222"),
        (time(15, 0), time(16, 0), "20221111"),
        (time(16, 0), time(17, 0), "20223333"),
        (time(17, 0), time(18, 0), "20221111"),
    ]


def test_reject_does_not_split_schedule(db_session, scenario):
    """반려는 승인 전 처리이므로 근무 행은 원본 그대로 남는다."""
    request_id = _post_request(db_session, scenario, "15:00", "16:30").json()["request_id"]
    _accept_as_b(db_session, request_id)

    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/reject", json={"reject_reason": "인원 조정"}
    )
    assert res.status_code == 200
    assert _day_rows(db_session, scenario) == [(time(14, 0), time(18, 0), "20221111")]


def test_candidates_are_judged_on_request_segment(db_session, scenario):
    """C가 14:00-15:00에 다른 근무가 있어도, 16:00-17:00 요청에는 후보로 남는다."""
    db_session.add(
        models.WorkSchedule(
            batch_id=scenario["schedule"].batch_id,
            student_id="20223333",
            department_id=scenario["department_id"],
            work_date=WORK_DATE,
            start_time=time(14, 0),
            end_time=time(15, 0),
        )
    )
    db_session.commit()

    late = _post_request(db_session, scenario, "16:00", "17:00").json()["request_id"]
    res = _client_as(db_session, "20221111", "student").get(
        f"/api/substitute-requests/{late}/candidates"
    )
    assert {c["student_id"] for c in res.json()} == {"20222222", "20223333"}

    early = _post_request(db_session, scenario, "14:00", "15:00").json()["request_id"]
    res = _client_as(db_session, "20221111", "student").get(
        f"/api/substitute-requests/{early}/candidates"
    )
    assert {c["student_id"] for c in res.json()} == {"20222222"}  # C는 그 구간에 근무 중


def test_candidates_need_availability_covering_segment(db_session, scenario):
    """구간이 겹치는 것만으로는 부족하다 — 가능시간이 구간 전체를 덮어야 한다."""
    db_session.query(models.AvailableTime).filter(
        models.AvailableTime.student_id == "20223333"
    ).update({"start_time": time(16, 0)})
    db_session.commit()

    request_id = _post_request(db_session, scenario, "15:00", "16:30").json()["request_id"]
    res = _client_as(db_session, "20221111", "student").get(
        f"/api/substitute-requests/{request_id}/candidates"
    )
    assert {c["student_id"] for c in res.json()} == {"20222222"}


def test_list_items_report_request_segment_not_shift(db_session, scenario):
    """목록의 start/end는 근무 시간이 아니라 요청 구간이다."""
    _post_request(db_session, scenario, "15:00", "16:30")

    res = _client_as(db_session, "STF001", "staff").get(
        f"/api/substitute-requests/department/{scenario['department_id']}"
    )
    item = res.json()[0]
    assert (item["start_time"], item["end_time"]) == ("15:00:00", "16:30:00")

    res_open = _client_as(db_session, "20222222", "student").get("/api/substitute-requests/open")
    assert (res_open.json()[0]["start_time"], res_open.json()[0]["end_time"]) == (
        "15:00:00", "16:30:00",
    )
