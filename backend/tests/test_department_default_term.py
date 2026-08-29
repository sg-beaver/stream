"""부서 기본 학기 (#172).

학기 중에만 운영하는 부서는 오늘 날짜 기준으로 학기를 정하면 방학에 화면이 통째로
빈다 — 조교가 방학에 다음 학기를 준비하는 게 정상 흐름이라, 부서가 볼 학기를 직접
정할 수 있게 했다. 고정하는 것은 세 가지다:

1. 우선순위 — 요청이 지정한 학기 > 부서 기본 학기 > 오늘 날짜 기준
2. 학생 화면도 **소속 부서**의 기본 학기를 따라간다 (담당자가 수합하는 격자와
   학생이 보는 격자가 다른 학기면 "냈는데 안 보인다"가 된다)
3. 학사 캘린더에 없는 학기는 저장할 수 없다 (그 부서 화면이 통째로 비어 버린다)
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app
from app.services import resolve_term_for_department, resolve_term_for_student

DEPT_ID = 7
TERM = "2026-2"
OTHER_TERM = "2026-1"


@pytest.fixture
def env(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="아트&테크놀로지학과-test"))
    db_session.add(models.Staff(
        staff_id="STF011", name="윤아텍", department_id=DEPT_ID, password_hash="x"
    ))
    db_session.add(models.DepartmentPolicy(
        department_id=DEPT_ID, availability_mode="weekly_only", default_term=TERM
    ))
    db_session.add(models.JobPosting(
        posting_id=8, department_id=DEPT_ID, created_by="STF011", title="수업 조교 모집",
        description="", deadline=datetime.date(2026, 8, 21), status="마감",
    ))
    db_session.add(models.Student(
        student_id="20262001", name="강도현", funding_type="gyobi", password_hash="x"
    ))
    db_session.add(models.Application(
        application_id=1, student_id="20262001", posting_id=8, status="합격"
    ))
    # 가을학기 가능 시간 1건 — 학기가 어긋나면 조회에서 사라진다
    db_session.add(models.AvailableTime(
        term=TERM, student_id="20262001", day_of_week=1,
        start_time=datetime.time(9, 0), end_time=datetime.time(12, 0), preference=2,
    ))
    db_session.commit()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield db_session
    finally:
        app.dependency_overrides.clear()


def client_as(user):
    app.dependency_overrides[auth.get_current_user] = lambda: user
    return TestClient(app)


class TestResolution:
    def test_department_default_wins_over_todays_term(self, env):
        # 오늘이 방학이어도 부서가 정한 학기를 쓴다
        assert resolve_term_for_department(env, DEPT_ID, None) == TERM

    def test_an_explicit_term_always_wins(self, env):
        assert resolve_term_for_department(env, DEPT_ID, OTHER_TERM) == OTHER_TERM

    def test_falls_back_to_todays_term_when_unset(self, env):
        row = env.query(models.DepartmentPolicy).filter(
            models.DepartmentPolicy.department_id == DEPT_ID
        ).first()
        row.default_term = None
        env.commit()
        # 학사 캘린더가 오늘로 정하는 학기 — 부서 값이 없으면 기존 동작 그대로
        from app.services import resolve_term
        assert resolve_term_for_department(env, DEPT_ID, None) == resolve_term(None)

    def test_student_follows_their_departments_default(self, env):
        assert resolve_term_for_student(env, "20262001", None) == TERM

    def test_student_without_a_department_uses_todays_term(self, env):
        from app.services import resolve_term
        assert resolve_term_for_student(env, "99999999", None) == resolve_term(None)


class TestEndpoints:
    def test_department_availability_uses_the_default_term(self, env):
        client = client_as(auth.CurrentUser(id="STF011", role="staff"))
        rows = client.get(f"/api/availability/department/{DEPT_ID}").json()
        # 오늘이 방학이어도 부서 기본 학기(가을)의 수합이 나온다
        assert [r["term"] for r in rows] == [TERM]
        assert rows[0]["student_id"] == "20262001"

    def test_an_explicit_term_still_wins_on_the_endpoint(self, env):
        client = client_as(auth.CurrentUser(id="STF011", role="staff"))
        rows = client.get(
            f"/api/availability/department/{DEPT_ID}", params={"term": OTHER_TERM}
        ).json()
        assert rows == [], "봄학기엔 수합이 없다 — 고른 학기가 그대로 적용돼야 한다"

    def test_student_sees_the_same_term_as_the_department(self, env):
        client = client_as(auth.CurrentUser(id="20262001", role="student"))
        body = client.get("/api/availability/me").json()
        assert body["term"] == TERM
        assert body["slots"], "부서와 같은 학기를 보므로 제출한 시간이 보여야 한다"


class TestPolicyApi:
    def test_get_and_patch_round_trip(self, env):
        client = client_as(auth.CurrentUser(id="STF011", role="staff"))
        assert client.get(f"/api/schedule/policy/{DEPT_ID}").json()["default_term"] == TERM

        res = client.patch(f"/api/schedule/policy/{DEPT_ID}", json={"default_term": OTHER_TERM})
        assert res.status_code == 200, res.json()
        assert res.json()["default_term"] == OTHER_TERM

    def test_empty_string_clears_it(self, env):
        client = client_as(auth.CurrentUser(id="STF011", role="staff"))
        res = client.patch(f"/api/schedule/policy/{DEPT_ID}", json={"default_term": ""})
        assert res.status_code == 200
        assert res.json()["default_term"] is None

    def test_unknown_term_is_rejected(self, env):
        client = client_as(auth.CurrentUser(id="STF011", role="staff"))
        res = client.patch(f"/api/schedule/policy/{DEPT_ID}", json={"default_term": "2099-9"})
        assert res.status_code == 400
        assert "학사 캘린더에 없는 학기" in res.json()["error"]
