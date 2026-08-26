"""부서 학생 정보 조회 API 테스트.

GET /api/students/department/{id} — 합격 학생의 학과·연락처·재원 구분과
활동 기간(합격 공고 period_start/period_end 파생)을 한 번에 돌려준다.
여러 공고 합격은 기간 합집합, 기간 미지정 공고가 섞이면 무제한(null).
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(models.Department(department_id=2, name="다른부서"))
    db_session.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
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


def add_student(db, sid, name, **kwargs):
    db.add(models.Student(student_id=sid, name=name, password_hash="x", **kwargs))


def add_hire(db, sid, posting_id, dept=DEPT_ID, start=None, end=None, status="합격"):
    if not db.query(models.JobPosting).filter(models.JobPosting.posting_id == posting_id).first():
        db.add(
            models.JobPosting(
                posting_id=posting_id, department_id=dept, title=f"공고{posting_id}",
                period_start=start, period_end=end,
            )
        )
    db.add(models.Application(student_id=sid, posting_id=posting_id, status=status))


class TestDepartmentStudents:
    def test_returns_hired_students_with_info(self, staff_client, db_session):
        add_student(db_session, "20220001", "김학생",
                    department_name="국어국문학과", phone="010-1111-2222", funding_type="gukga")
        add_student(db_session, "20220002", "이불합격")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 12, 21))
        add_hire(db_session, "20220002", 10, status="불합격")
        db_session.commit()

        res = staff_client.get(f"/api/students/department/{DEPT_ID}")
        assert res.status_code == 200
        body = res.json()
        assert len(body) == 1  # 합격자만
        s = body[0]
        assert s["student_id"] == "20220001"
        assert s["department_name"] == "국어국문학과"
        assert s["phone"] == "010-1111-2222"
        assert s["funding_type"] == "gukga"
        assert s["active_from"] == "2026-09-01"
        assert s["active_until"] == "2026-12-21"

    def test_multiple_postings_union_period(self, staff_client, db_session):
        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 10, 31))
        add_hire(db_session, "20220001", 11, start=date(2026, 3, 2), end=date(2026, 6, 22))
        db_session.commit()

        body = staff_client.get(f"/api/students/department/{DEPT_ID}").json()
        assert len(body) == 1
        assert body[0]["active_from"] == "2026-03-02"  # 가장 이른 시작
        assert body[0]["active_until"] == "2026-10-31"  # 가장 늦은 종료

    def test_null_period_means_unlimited(self, staff_client, db_session):
        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 12, 21))
        add_hire(db_session, "20220001", 11)  # 기간 미지정 공고 → 무제한
        db_session.commit()

        body = staff_client.get(f"/api/students/department/{DEPT_ID}").json()
        assert body[0]["active_from"] is None
        assert body[0]["active_until"] is None

    def test_other_department_forbidden(self, staff_client):
        res = staff_client.get("/api/students/department/2")
        assert res.status_code == 403

    def test_empty_when_no_hires(self, staff_client):
        res = staff_client.get(f"/api/students/department/{DEPT_ID}")
        assert res.status_code == 200
        assert res.json() == []

    def test_stored_period_overrides_posting(self, staff_client, db_session):
        """담당자가 저장한 활동 기간이 있으면 공고 파생 대신 그 값을 쓴다."""
        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 12, 21))
        student = db_session.query(models.Student).one()
        student.active_from = date(2026, 10, 1)
        student.active_until = date(2026, 11, 30)
        db_session.commit()

        body = staff_client.get(f"/api/students/department/{DEPT_ID}").json()
        assert body[0]["active_from"] == "2026-10-01"
        assert body[0]["active_until"] == "2026-11-30"
        assert body[0]["active_source"] == "student"


class TestActivePeriodUpdate:
    def test_patch_saves_and_overrides(self, staff_client, db_session):
        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 12, 21))
        db_session.commit()

        res = staff_client.patch(
            "/api/students/20220001/active-period",
            json={"active_from": "2026-10-01", "active_until": "2026-11-30"},
        )
        assert res.status_code == 200, res.json()
        assert res.json()["active_source"] == "student"

        body = staff_client.get(f"/api/students/department/{DEPT_ID}").json()
        assert body[0]["active_from"] == "2026-10-01"

    def test_patch_null_means_unlimited(self, staff_client, db_session):
        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 12, 21))
        db_session.commit()

        res = staff_client.patch(
            "/api/students/20220001/active-period",
            json={"active_from": "2026-10-01", "active_until": None},
        )
        assert res.status_code == 200
        assert res.json()["active_until"] is None

    def test_patch_reversed_period_rejected(self, staff_client, db_session):
        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10)
        db_session.commit()

        res = staff_client.patch(
            "/api/students/20220001/active-period",
            json={"active_from": "2026-12-01", "active_until": "2026-10-01"},
        )
        assert res.status_code == 400

    def test_patch_other_department_student_forbidden(self, staff_client, db_session):
        add_student(db_session, "20229999", "타부서학생")
        add_hire(db_session, "20229999", 20, dept=2)
        db_session.commit()

        res = staff_client.patch(
            "/api/students/20229999/active-period",
            json={"active_from": "2026-10-01", "active_until": None},
        )
        assert res.status_code == 403

    def test_scheduler_engagement_uses_stored_period(self, staff_client, db_session):
        """스케줄러 활동 기간 판정도 저장값을 우선한다 (배정 가능 날짜에 반영)."""
        from app.scheduler.service import _load_engagements

        add_student(db_session, "20220001", "김학생")
        add_hire(db_session, "20220001", 10, start=date(2026, 9, 1), end=date(2026, 12, 21))
        student = db_session.query(models.Student).one()
        student.active_from = date(2026, 10, 1)
        student.active_until = date(2026, 11, 30)
        db_session.commit()

        engagement = _load_engagements(db_session, DEPT_ID)["20220001"]
        assert engagement.active_from == date(2026, 10, 1)
        assert engagement.active_until == date(2026, 11, 30)
