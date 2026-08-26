"""학생이 소속 부서 슬롯 단위로 가능 시간을 내는 화면이 쓰는 API (#89).

GET    /api/schedule/policy/me           내 소속 부서 정책 (블록·개관 시간·편집 허용 범위)
DELETE /api/availability/exceptions/{id} 내가 낸 날짜별 예외 되돌리기
PATCH  /api/schedule/policy/{id}         담당자의 availability_mode 설정
"""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1
STUDENT_ID = "20220001"
OTHER_STUDENT_ID = "20220002"


class ActingClient:
    """요청 직전에 현재 사용자를 바꿔 주는 TestClient 래퍼.

    한 테스트에서 학생과 담당자를 번갈아 호출해야 하는데(담당자가 모드를 바꾸면
    학생 화면이 어떻게 되는지), dependency_overrides는 앱 전역이라 클라이언트마다
    고정해 두면 나중에 만들어진 쪽이 이긴다.
    """

    def __init__(self, client, holder, user):
        self._client, self._holder, self._user = client, holder, user

    def _act(self, method, *args, **kwargs):
        self._holder["user"] = self._user
        return getattr(self._client, method)(*args, **kwargs)

    def get(self, *a, **k):
        return self._act("get", *a, **k)

    def post(self, *a, **k):
        return self._act("post", *a, **k)

    def patch(self, *a, **k):
        return self._act("patch", *a, **k)

    def delete(self, *a, **k):
        return self._act("delete", *a, **k)


@pytest.fixture
def acting(db_session):
    """앱 전역 오버라이드를 한 번만 걸고, 호출자마다 사용자만 갈아 끼운다."""
    holder = {"user": None}

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: holder["user"]
    try:
        yield holder
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def db_with_department(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(models.Student(student_id=STUDENT_ID, name="김서강", password_hash="x"))
    db_session.add(
        models.Student(student_id=OTHER_STUDENT_ID, name="이서강", password_hash="x")
    )
    db_session.add(models.JobPosting(posting_id=10, department_id=DEPT_ID, title="공고"))
    db_session.add(
        models.DepartmentPolicy(
            department_id=DEPT_ID, availability_mode="weekly_with_exceptions"
        )
    )
    db_session.commit()
    return db_session


@pytest.fixture
def hired(db_with_department):
    """합격해 부서가 배정된 상태 — 소속 부서 판정의 유일한 근거다."""
    db_with_department.add(
        models.Application(student_id=STUDENT_ID, posting_id=10, status="합격")
    )
    db_with_department.commit()
    return db_with_department


@pytest.fixture
def student_client(db_with_department, acting):
    return ActingClient(
        TestClient(app), acting, auth.CurrentUser(id=STUDENT_ID, role="student")
    )


@pytest.fixture
def staff_client(db_with_department, acting):
    db_with_department.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
        )
    )
    db_with_department.commit()
    return ActingClient(
        TestClient(app), acting, auth.CurrentUser(id="STF001", role="staff")
    )


class TestMyPolicy:
    def test_returns_blocks_and_mode_for_hired_student(self, student_client, hired):
        res = student_client.get("/api/schedule/policy/me")
        assert res.status_code == 200, res.json()
        body = res.json()
        assert body["department_id"] == DEPT_ID
        assert body["availability_mode"] == "weekly_with_exceptions"
        # 화면이 격자를 그리는 데 필요한 값
        assert set(body["work_slots"]) == {"semester", "vacation"}
        assert set(body["opening_hours"]) == {"semester", "vacation"}
        assert body["grid_start_time"] < body["grid_end_time"]

    def test_semester_ranges_let_the_screen_pick_the_period(self, student_client, hired):
        body = student_client.get("/api/schedule/policy/me").json()
        # 한 주가 방학과 학기에 걸칠 수 있어 화면이 날짜별로 판정한다
        assert body["semesters"], "학기 구간이 있어야 화면이 기간을 가려 쓴다"
        first = body["semesters"][0]
        assert first["start"] < first["end"]

    def test_404_before_being_hired(self, student_client, db_with_department):
        res = student_client.get("/api/schedule/policy/me")
        assert res.status_code == 404

    def test_staff_cannot_use_student_route(self, staff_client, hired):
        assert staff_client.get("/api/schedule/policy/me").status_code == 403

    def test_no_staffing_or_budget_leaks_to_students(self, student_client, hired):
        body = student_client.get("/api/schedule/policy/me").json()
        for staff_only in ("min_per_slot", "max_per_slot", "biweekly_max_hours", "custom_rules"):
            assert staff_only not in body


class TestMyDepartmentDays:
    """날짜별 개관 시간 — 근무표 생성과 같은 특별일 규칙(HC-OPEN)을 화면도 보게 한다."""

    def days(self, client, from_date, to_date):
        res = client.get(
            f"/api/schedule/policy/me/days?from_date={from_date}&to_date={to_date}"
        )
        assert res.status_code == 200, res.json()
        return {row["date"]: row for row in res.json()}

    def test_exam_weekend_is_extended(self, student_client, hired):
        # 2026-2 중간고사는 10/20(화) 시작 → 직전 주말(10/17 토·10/18 일) 연장 개관
        rows = self.days(student_client, "2026-10-16", "2026-10-18")
        assert rows["2026-10-17"]["note"] == "연장"
        assert rows["2026-10-18"]["note"] == "연장"
        assert rows["2026-10-18"]["ranges"] == [
            {"start_time": "08:00", "end_time": "22:00"}
        ]
        # 평상시 일요일은 폐관이라 대비가 드러난다
        assert rows["2026-10-16"]["note"] is None

    def test_closure_has_no_ranges(self, student_client, hired):
        rows = self.days(student_client, "2026-09-24", "2026-09-24")
        assert rows["2026-09-24"]["note"] == "휴관"
        assert rows["2026-09-24"]["ranges"] == []
        assert rows["2026-09-24"]["blocks"] == []

    def test_semester_holiday_is_shortened(self, student_client, hired):
        rows = self.days(student_client, "2026-10-09", "2026-10-09")  # 한글날(학기 중)
        assert rows["2026-10-09"]["note"] == "단축"
        assert rows["2026-10-09"]["ranges"] == [
            {"start_time": "09:00", "end_time": "17:00"}
        ]

    def test_blocks_are_clipped_to_opening_hours(self, student_client, hired):
        rows = self.days(student_client, "2026-10-09", "2026-10-09")
        blocks = rows["2026-10-09"]["blocks"]
        # 단축 개관(09-17) 밖으로 나가는 블록은 잘리거나 사라진다
        assert blocks, "단축 개관 안에 남는 블록이 있어야 한다"
        assert all("09:00" <= b["start_time"] and b["end_time"] <= "17:00" for b in blocks)

    def test_range_is_capped(self, student_client, hired):
        res = student_client.get(
            "/api/schedule/policy/me/days?from_date=2026-09-01&to_date=2026-12-01"
        )
        assert res.status_code == 422

    def test_reversed_range_is_422(self, student_client, hired):
        res = student_client.get(
            "/api/schedule/policy/me/days?from_date=2026-09-10&to_date=2026-09-01"
        )
        assert res.status_code == 422

    def test_404_before_being_hired(self, student_client, db_with_department):
        res = student_client.get(
            "/api/schedule/policy/me/days?from_date=2026-09-01&to_date=2026-09-07"
        )
        assert res.status_code == 404


class TestDeleteException:
    def _create(self, client):
        res = client.post(
            "/api/availability/exceptions",
            json={
                "exception_date": "2026-09-07",
                "exception_type": "UNAVAILABLE",
                "start_time": "09:00",
                "end_time": "12:00",
            },
        )
        assert res.status_code == 201, res.json()
        return res.json()["exception_id"]

    def test_deletes_own_exception(self, student_client, hired):
        exception_id = self._create(student_client)
        res = student_client.delete(f"/api/availability/exceptions/{exception_id}")
        assert res.status_code == 204
        assert student_client.get("/api/availability/exceptions/me").json() == []

    def test_cannot_delete_someone_elses(self, student_client, hired, db_with_department):
        db_with_department.add(
            models.AvailabilityException(
                student_id=OTHER_STUDENT_ID,
                exception_date=date(2026, 9, 7),
                exception_type="UNAVAILABLE",
                start_time=time(9, 0),
                end_time=time(12, 0),
            )
        )
        db_with_department.commit()
        other_id = (
            db_with_department.query(models.AvailabilityException)
            .filter(models.AvailabilityException.student_id == OTHER_STUDENT_ID)
            .first()
            .exception_id
        )

        assert student_client.delete(f"/api/availability/exceptions/{other_id}").status_code == 404
        assert db_with_department.query(models.AvailabilityException).count() == 1

    def test_missing_exception_is_404(self, student_client, hired):
        assert student_client.delete("/api/availability/exceptions/999").status_code == 404

    def test_staff_cannot_delete(self, staff_client, hired):
        assert staff_client.delete("/api/availability/exceptions/1").status_code == 403

    def test_narrowing_the_mode_does_not_block_cleanup(
        self, student_client, staff_client, hired
    ):
        # 학생이 낸 예외가 있는 상태에서 담당자가 모드를 좁혀도 되돌리기는 가능해야 한다
        exception_id = self._create(student_client)
        patched = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}", json={"availability_mode": "weekly_only"}
        )
        assert patched.status_code == 200, patched.json()

        assert student_client.delete(f"/api/availability/exceptions/{exception_id}").status_code == 204


class TestAvailabilityModePatch:
    def test_staff_can_change_mode(self, staff_client):
        res = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}",
            json={"availability_mode": "weekly_with_unavailable"},
        )
        assert res.status_code == 200, res.json()
        assert res.json()["availability_mode"] == "weekly_with_unavailable"

        body = staff_client.get(f"/api/schedule/policy/{DEPT_ID}").json()
        assert body["availability_mode"] == "weekly_with_unavailable"

    def test_unknown_mode_is_422(self, staff_client):
        res = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}", json={"availability_mode": "everything"}
        )
        assert res.status_code == 422

    def test_mode_reaches_the_student_screen(self, staff_client, student_client, hired):
        staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}",
            json={"availability_mode": "weekly_with_unavailable"},
        )
        body = student_client.get("/api/schedule/policy/me").json()
        assert body["availability_mode"] == "weekly_with_unavailable"

        # 그 모드에서는 '그날만 가능' 추가가 막힌다 (근무 불가 신고만 허용)
        res = student_client.post(
            "/api/availability/exceptions",
            json={
                "exception_date": "2026-09-07",
                "exception_type": "AVAILABLE",
                "start_time": "09:00",
                "end_time": "12:00",
                "preference": 2,
            },
        )
        assert res.status_code == 403
