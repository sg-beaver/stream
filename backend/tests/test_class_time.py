"""GET/PUT /api/class-time/me, GET /api/class-time/department/{id} — 수업 시간 (REQ-SCHED-015)."""

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app


@pytest.fixture
def client(db_session):
    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id="20221234", role="student")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def student(db_session):
    s = models.Student(student_id="20221234", name="김서강", password_hash="x")
    db_session.add(s)
    db_session.commit()
    return s


def test_get_my_class_time_empty(client, student):
    res = client.get("/api/class-time/me")
    assert res.status_code == 200
    assert res.json() == {"slots": []}


def test_put_replaces_and_get_reflects_it(client, student):
    slots = ["화-09:00", "화-10:00", "목-14:00"]
    res = client.put("/api/class-time/me", json={"slots": slots})
    assert res.status_code == 200
    assert sorted(res.json()["slots"]) == sorted(slots)

    rows = client.get("/api/class-time/me")
    assert sorted(rows.json()["slots"]) == sorted(slots)


def test_put_does_not_accumulate_on_resave(client, student, db_session):
    client.put("/api/class-time/me", json={"slots": ["화-09:00"]})
    client.put("/api/class-time/me", json={"slots": ["목-14:00"]})

    res = client.get("/api/class-time/me")
    assert res.json()["slots"] == ["목-14:00"]
    assert db_session.query(models.ClassTime).count() == 1


def test_staff_cannot_access_me(db_session):
    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id="STF001", role="staff")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    try:
        c = TestClient(app)
        assert c.get("/api/class-time/me").status_code == 403
        assert c.put("/api/class-time/me", json={"slots": []}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_department_list(db_session):
    dept = models.Department(name="정보서비스팀")
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    staff = models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x")
    other_staff = models.Staff(
        staff_id="STF002", name="타부서 담당자", department_id=other_dept.department_id, password_hash="x"
    )
    student = models.Student(student_id="20221234", name="김서강", password_hash="x")
    db_session.add_all([staff, other_staff, student])

    posting = models.JobPosting(department_id=dept.department_id, title="테스트 공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add(models.Application(student_id="20221234", posting_id=posting.posting_id, status="합격"))
    db_session.commit()

    def _client_as(user_id, role):
        def _override_get_db():
            yield db_session

        def _override_current_user():
            return auth.CurrentUser(id=user_id, role=role)

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[auth.get_current_user] = _override_current_user
        return TestClient(app)

    try:
        _client_as("20221234", "student").put("/api/class-time/me", json={"slots": ["월-09:00"]})

        res = _client_as("STF001", "staff").get(f"/api/class-time/department/{dept.department_id}")
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["student_id"] == "20221234"
        assert res.json()[0]["student_name"] == "김서강"

        res_other = _client_as("STF002", "staff").get(f"/api/class-time/department/{dept.department_id}")
        assert res_other.status_code == 403
    finally:
        app.dependency_overrides.clear()
