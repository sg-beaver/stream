"""날짜별 가능 시간 조회 API 테스트.

GET /api/availability/department/{id}/dates — 주간 패턴에 날짜 예외를 반영해
기간 내 날짜별 실제 가능 시간을 전개한다 (학생 관리 주차별 시간표용).
"""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1
MONDAY = "2026-09-07"
SUNDAY = "2026-09-13"


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
        )
    )
    db_session.add(models.Student(student_id="20220001", name="김학생", password_hash="x"))
    db_session.add(models.JobPosting(posting_id=10, department_id=DEPT_ID, title="공고"))
    db_session.add(models.Application(student_id="20220001", posting_id=10, status="합격"))
    # 예외 반영을 확인해야 하므로 예외 허용 모드로 설정
    db_session.add(
        models.DepartmentPolicy(
            department_id=DEPT_ID, availability_mode="weekly_with_exceptions"
        )
    )
    # 주간 패턴: 월 09-12
    db_session.add(
        models.AvailableTime(
            student_id="20220001", day_of_week=1,
            start_time=time(9, 0), end_time=time(12, 0), preference=2,
        )
    )
    db_session.commit()

    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id="STF001", role="staff")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def fetch(client, from_date=MONDAY, to_date=SUNDAY):
    return client.get(
        f"/api/availability/department/{DEPT_ID}/dates",
        params={"from_date": from_date, "to_date": to_date},
    )


class TestAvailabilityDates:
    def test_weekly_pattern_expanded_to_dates(self, staff_client):
        res = fetch(staff_client)
        assert res.status_code == 200
        body = res.json()
        # 월요일(9/7) 하루만 09-12
        assert [(r["date"], r["start_time"], r["end_time"]) for r in body] == [
            ("2026-09-07", "09:00:00", "12:00:00")
        ]
        assert body[0]["student_name"] == "김학생"

    def test_unavailable_exception_removes_date(self, staff_client, db_session):
        """그날 종일 불가 예외가 등록된 주에는 그 날짜가 비어야 한다."""
        db_session.add(
            models.AvailabilityException(
                student_id="20220001", exception_date=date(2026, 9, 7),
                exception_type="UNAVAILABLE",
            )
        )
        db_session.commit()

        body = fetch(staff_client).json()
        assert body == []

    def test_available_exception_adds_interval(self, staff_client, db_session):
        """추가 가능 예외는 그 날짜에만 구간을 더한다."""
        db_session.add(
            models.AvailabilityException(
                student_id="20220001", exception_date=date(2026, 9, 9),
                exception_type="AVAILABLE",
                start_time=time(14, 0), end_time=time(16, 0), preference=2,
            )
        )
        db_session.commit()

        body = fetch(staff_client).json()
        dates = {(r["date"], r["start_time"]) for r in body}
        assert ("2026-09-07", "09:00:00") in dates  # 주간 패턴 유지
        assert ("2026-09-09", "14:00:00") in dates  # 예외로 추가된 수요일

    def test_range_validation(self, staff_client):
        assert fetch(staff_client, "2026-09-13", "2026-09-07").status_code == 400
        assert fetch(staff_client, "2026-09-07", "2026-12-31").status_code == 400


class TestTermBoundary:
    """조회 기간이 학기 경계를 넘으면 날짜마다 그날의 학기 패턴을 써야 한다.

    2026-summer는 8/31까지, 2026-2는 9/1부터다. 시작일 학기 하나로 기간 전체를
    덮으면 9/1 이후 날짜에 방학 패턴이 붙어, 가을학기 가능 시간을 낸 학생이
    개강 주에 근무 불가로 보인다. 근무표 생성(_load_students_from_db)은 이미
    term_segments로 구간을 쪼개므로 화면도 같은 규칙이어야 한다.
    """

    @staticmethod
    def _seed_terms(db_session):
        # 기본 fixture의 학기 미지정(NULL) 행은 어느 학기에서든 적용되므로 지운다
        db_session.query(models.AvailableTime).delete()
        db_session.add_all(
            [
                models.AvailableTime(
                    student_id="20220001", term="2026-summer", day_of_week=1,
                    start_time=time(13, 0), end_time=time(15, 0), preference=2,
                ),
                models.AvailableTime(
                    student_id="20220001", term="2026-2", day_of_week=2,
                    start_time=time(10, 0), end_time=time(11, 0), preference=2,
                ),
            ]
        )
        db_session.commit()

    def test_each_date_uses_its_own_term_pattern(self, staff_client, db_session):
        """개강 주(8/31 방학 · 9/1~ 학기)는 날짜마다 다른 학기 패턴이 붙는다."""
        self._seed_terms(db_session)
        body = fetch(staff_client, "2026-08-31", "2026-09-06").json()
        assert [(r["date"], r["start_time"], r["end_time"]) for r in body] == [
            ("2026-08-31", "13:00:00", "15:00:00"),  # 월 · 방학(2026-summer) 패턴
            ("2026-09-01", "10:00:00", "11:00:00"),  # 화 · 가을학기(2026-2) 패턴
        ]

    def test_single_term_range_unchanged(self, staff_client, db_session):
        """한 학기 안에 들어오는 기간은 구간이 1개라 기존 동작과 같다."""
        self._seed_terms(db_session)
        body = fetch(staff_client, "2026-09-07", "2026-09-13").json()
        assert [(r["date"], r["start_time"], r["end_time"]) for r in body] == [
            ("2026-09-08", "10:00:00", "11:00:00"),  # 화 · 가을학기 패턴만
        ]

    def test_exception_applies_across_the_boundary(self, staff_client, db_session):
        """날짜 예외는 학기와 무관하게 그 날짜에 그대로 적용된다."""
        self._seed_terms(db_session)
        db_session.add(
            models.AvailabilityException(
                student_id="20220001", exception_date=date(2026, 9, 1),
                exception_type="UNAVAILABLE",
            )
        )
        db_session.commit()

        body = fetch(staff_client, "2026-08-31", "2026-09-06").json()
        assert [(r["date"], r["start_time"]) for r in body] == [
            ("2026-08-31", "13:00:00")
        ]
