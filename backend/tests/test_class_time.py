"""GET/PUT /api/class-time/me, GET /api/class-time/department/{id} — 수업 시간 (REQ-SCHED-015)."""

from datetime import time

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
    body = res.json()
    assert body["slots"] == []
    # 학기를 지정하지 않으면 서버가 오늘 기준 학기를 골라 알려준다 (#89 후속)
    assert body["term"]


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


# ---------------------------------------------------------------------------
# 학기별 시간표 (#89 후속) — 봄학기 시간표가 가을학기에 그대로 적용되면 안 된다
# ---------------------------------------------------------------------------


class TestTerms:
    def test_lists_regular_and_seasonal_terms(self, client, student):
        res = client.get("/api/academic/terms")
        assert res.status_code == 200
        body = res.json()
        keys = [t["key"] for t in body["terms"]]
        # 학사일정 기준 정규 2학기 + 계절학기 2회
        assert keys == ["2026-1", "2026-summer", "2026-2", "2026-winter"]
        assert body["default_term"] in keys
        spring = body["terms"][0]
        assert (spring["start"], spring["end"]) == ("2026-03-03", "2026-06-22")

    def test_terms_do_not_overlap_and_run_forward(self, client, student):
        terms = client.get("/api/academic/terms").json()["terms"]
        for term in terms:
            assert term["start"] < term["end"]
        for earlier, later in zip(terms, terms[1:]):
            assert earlier["end"] < later["start"]

    def test_saving_one_term_leaves_others_alone(self, client, student):
        client.put("/api/class-time/me", json={"term": "2026-1", "slots": ["월-09:00"]})
        client.put("/api/class-time/me", json={"term": "2026-2", "slots": ["화-13:00"]})

        spring = client.get("/api/class-time/me?term=2026-1").json()
        fall = client.get("/api/class-time/me?term=2026-2").json()
        assert spring["slots"] == ["월-09:00"]
        assert fall["slots"] == ["화-13:00"]

    def test_resaving_a_term_replaces_only_that_term(self, client, student, db_session):
        client.put("/api/class-time/me", json={"term": "2026-1", "slots": ["월-09:00"]})
        client.put("/api/class-time/me", json={"term": "2026-2", "slots": ["화-13:00"]})
        client.put("/api/class-time/me", json={"term": "2026-2", "slots": ["수-10:00"]})

        assert client.get("/api/class-time/me?term=2026-1").json()["slots"] == ["월-09:00"]
        assert client.get("/api/class-time/me?term=2026-2").json()["slots"] == ["수-10:00"]
        assert db_session.query(models.ClassTime).count() == 2

    def test_term_is_omitted_falls_back_to_default(self, client, student):
        default_term = client.get("/api/academic/terms").json()["default_term"]
        saved = client.put("/api/class-time/me", json={"slots": ["목-15:00"]}).json()
        assert saved["term"] == default_term
        assert client.get(f"/api/class-time/me?term={default_term}").json()["slots"] == ["목-15:00"]

    def test_unknown_term_is_its_own_empty_timetable(self, client, student):
        client.put("/api/class-time/me", json={"term": "2026-1", "slots": ["월-09:00"]})
        # 없는 학기 키로 조회해도 다른 학기 것이 새어 나오면 안 된다
        assert client.get("/api/class-time/me?term=2030-1").json()["slots"] == []


def test_department_list_is_scoped_to_one_term(db_session):
    """담당자 수합도 학기 단위 — 근무표를 짜는 학기의 시간표만 봐야 한다."""
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(models.Staff(staff_id="STF001", name="박정보", department_id=1, password_hash="x"))
    db_session.add(models.Student(student_id="20220001", name="김서강", password_hash="x"))
    db_session.add(models.JobPosting(posting_id=10, department_id=1, title="공고"))
    db_session.add(models.Application(student_id="20220001", posting_id=10, status="합격"))
    db_session.commit()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
        id="STF001", role="staff"
    )
    try:
        client = TestClient(app)
        db_session.add_all([
            models.ClassTime(
                student_id="20220001", term="2026-1",
                day_of_week=1, start_time=time(9, 0), end_time=time(10, 0),
            ),
            models.ClassTime(
                student_id="20220001", term="2026-2",
                day_of_week=2, start_time=time(13, 0), end_time=time(14, 0),
            ),
        ])
        db_session.commit()

        fall = client.get("/api/class-time/department/1?term=2026-2").json()
        assert [row["day_of_week"] for row in fall] == [2]
        assert fall[0]["term"] == "2026-2"

        spring = client.get("/api/class-time/department/1?term=2026-1").json()
        assert [row["day_of_week"] for row in spring] == [1]
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 날짜별 조회 — GET /api/class-time/department/{id}/dates
#
# 주간 패턴(day_of_week) 응답은 학기 하나밖에 못 담는다. 개강 주(2026-08-31 방학 ·
# 09-01부터 학기)처럼 한 주가 학기 경계를 넘으면 화면이 한쪽 학기 시간표만 겹쳐
# 보게 되므로, 가능 시간과 같이 날짜로 전개한 응답이 따로 필요하다.
# ---------------------------------------------------------------------------


@pytest.fixture
def dept_client(db_session):
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(models.Staff(staff_id="STF001", name="박정보", department_id=1, password_hash="x"))
    db_session.add(models.Staff(staff_id="STF002", name="타부서", department_id=2, password_hash="x"))
    db_session.add(models.Student(student_id="20220001", name="김서강", password_hash="x"))
    db_session.add(models.JobPosting(posting_id=10, department_id=1, title="공고"))
    db_session.add(models.Application(student_id="20220001", posting_id=10, status="합격"))
    db_session.add_all([
        # 방학: 월 13:00-15:00 / 가을학기: 화 10:00-11:00
        models.ClassTime(
            student_id="20220001", term="2026-summer",
            day_of_week=1, start_time=time(13, 0), end_time=time(15, 0),
        ),
        models.ClassTime(
            student_id="20220001", term="2026-2",
            day_of_week=2, start_time=time(10, 0), end_time=time(11, 0),
        ),
    ])
    db_session.commit()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
        id="STF001", role="staff"
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _dates(client, from_date, to_date):
    return client.get(
        "/api/class-time/department/1/dates",
        params={"from_date": from_date, "to_date": to_date},
    )


class TestDepartmentClassTimeByDate:
    def test_each_date_uses_its_own_term_timetable(self, dept_client):
        """개강 주는 날짜마다 그날의 학기 시간표가 실린다."""
        body = _dates(dept_client, "2026-08-31", "2026-09-06").json()
        assert [(r["date"], r["start_time"], r["end_time"]) for r in body] == [
            ("2026-08-31", "13:00:00", "15:00:00"),  # 월 · 방학(2026-summer)
            ("2026-09-01", "10:00:00", "11:00:00"),  # 화 · 가을학기(2026-2)
        ]
        assert body[0]["student_id"] == "20220001"
        assert body[0]["student_name"] == "김서강"

    def test_single_term_range_expands_weekly_pattern(self, dept_client):
        """한 학기 안에 들어오는 기간은 그 학기 패턴만 요일에 맞춰 펼친다."""
        body = _dates(dept_client, "2026-09-07", "2026-09-13").json()
        assert [(r["date"], r["start_time"]) for r in body] == [
            ("2026-09-08", "10:00:00")  # 화요일 하루
        ]

    def test_no_class_returns_empty(self, dept_client):
        """수업이 없는 기간은 빈 목록 — 날짜 칸을 억지로 채우지 않는다."""
        assert _dates(dept_client, "2026-09-05", "2026-09-06").json() == []

    def test_range_validation(self, dept_client):
        assert _dates(dept_client, "2026-09-13", "2026-09-07").status_code == 400
        assert _dates(dept_client, "2026-09-07", "2026-12-31").status_code == 400

    def test_other_department_staff_is_forbidden(self, dept_client, db_session):
        app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
            id="STF002", role="staff"
        )
        assert _dates(dept_client, "2026-09-07", "2026-09-13").status_code == 403
