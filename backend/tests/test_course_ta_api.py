"""과목 TA 배정 API 테스트 (#173).

수업 조교 부서는 근무 단위가 과목이라, 막아야 할 조합을 서버가 막지 못하면
"화면에서는 배정됐는데 실제로는 그 시간에 수업이 있는" 근무표가 만들어진다.
고정하는 것은 네 가지다: 본인 수강 시간 겹침 · 이미 맡은 과목과의 겹침 ·
과목 수 상한 · 부서 소속. 후보 조회(GET)와 배정(POST)이 같은 판정을 쓰는지도
함께 본다 — 둘이 어긋나면 화면이 거짓말을 한다.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app
from app.routers.course_ta import MAX_COURSES_PER_TA

DEPT_ID = 7
OTHER_DEPT_ID = 8
TERM = "2026-2"


def _time(text):
    hour, minute = text.split(":")
    return datetime.time(int(hour), int(minute))


def _course(db, code, section, meetings, title=None, department_name="아트&테크놀로지학과"):
    course = models.Course(
        term=TERM, course_code=code, section=section,
        title=title or f"{code} 과목", department_name=department_name,
        credits="3.0", professor="담당교수", enrolled_count=30,
    )
    db.add(course)
    db.flush()
    for day, start, end in meetings:
        db.add(models.CourseMeeting(
            course_id=course.course_id, day_of_week=day,
            start_time=_time(start), end_time=_time(end), room="X513",
        ))
    return course


@pytest.fixture
def staff_client(db_session):
    """부서 7에 학생 3명이 합격해 있는 최소 환경."""
    for dept_id, name in ((DEPT_ID, "아트&테크놀로지학과-test"), (OTHER_DEPT_ID, "교육대학원 행정팀-test")):
        db_session.add(models.Department(department_id=dept_id, name=name))
    db_session.add(models.Staff(
        staff_id="STF011", name="윤아텍", department_id=DEPT_ID, password_hash="x"
    ))
    db_session.add(models.JobPosting(
        posting_id=8, department_id=DEPT_ID, created_by="STF011", title="수업 조교 모집",
        description="", deadline=datetime.date(2026, 8, 21), status="마감",
        period_start=datetime.date(2026, 9, 1), period_end=datetime.date(2026, 12, 18),
    ))
    db_session.add(models.JobPosting(
        posting_id=9, department_id=OTHER_DEPT_ID, created_by="STF012", title="행정 근로",
        description="", deadline=datetime.date(2026, 8, 21), status="마감",
    ))
    for i, name in enumerate(["강도현", "고예린", "권시우"], start=1):
        sid = f"2026200{i}"
        db_session.add(models.Student(
            student_id=sid, name=name, funding_type="gyobi", password_hash="x"
        ))
        db_session.add(models.Application(
            application_id=i, student_id=sid, posting_id=8, status="합격",
        ))
    # 다른 부서 학생 — 배정 대상이 아니어야 한다
    db_session.add(models.Student(
        student_id="20262021", name="구본영", funding_type="gyobi", password_hash="x"
    ))
    db_session.add(models.Application(
        application_id=9, student_id="20262021", posting_id=9, status="합격",
    ))
    db_session.commit()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
        id="STF011", role="staff"
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def assign(client, course_id, student_id, department_id=DEPT_ID):
    return client.post(
        f"/api/course-ta/{department_id}/courses/{course_id}/tas",
        json={"student_id": student_id},
    )


class TestList:
    def test_lists_courses_with_meetings_and_department_names(self, staff_client, db_session):
        _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15"), (3, "12:00", "13:15")])
        _course(db_session, "MAS1001", "01", [(3, "15:00", "16:15")],
                department_name="지식융합미디어대학")
        db_session.commit()

        body = staff_client.get(f"/api/course-ta/{DEPT_ID}/courses?term={TERM}").json()
        assert body["term"] == TERM
        assert body["department_names"] == ["아트&테크놀로지학과", "지식융합미디어대학"]
        assert [c["course_code"] for c in body["courses"]] == ["AAT3005", "MAS1001"]
        first = body["courses"][0]
        assert [m["day_of_week"] for m in first["meetings"]] == [1, 3]
        assert first["meetings"][0]["start_time"] == "12:00"
        # 주당 근무 시간 = 수업 시간 합계 (1시간 15분 × 2)
        assert first["weekly_hours"] == 2.5

    def test_filters_by_offering_department(self, staff_client, db_session):
        _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        _course(db_session, "MAS1001", "01", [(3, "15:00", "16:15")],
                department_name="지식융합미디어대학")
        db_session.commit()

        body = staff_client.get(
            f"/api/course-ta/{DEPT_ID}/courses",
            params={"term": TERM, "department_name": "아트&테크놀로지학과"},
        ).json()
        assert [c["course_code"] for c in body["courses"]] == ["AAT3005"]
        # 학과 목록은 걸러도 그대로 — 드롭다운이 비어 버리면 되돌아갈 수 없다
        assert len(body["department_names"]) == 2


class TestAssign:
    def test_assigns_and_returns_the_course(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.commit()

        res = assign(staff_client, course.course_id, "20262001")
        assert res.status_code == 200, res.json()
        assert [ta["student_id"] for ta in res.json()["tas"]] == ["20262001"]
        assert res.json()["tas"][0]["name"] == "강도현"

    def test_rejects_when_it_clashes_with_the_students_own_class(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.add(models.ClassTime(
            term=TERM, student_id="20262001", day_of_week=1,
            start_time=_time("12:00"), end_time=_time("13:15"),
        ))
        db_session.commit()

        res = assign(staff_client, course.course_id, "20262001")
        assert res.status_code == 400
        assert "본인 수강 시간과 겹칩니다" in res.json()["error"]

    def test_rejects_when_it_clashes_with_an_already_assigned_course(self, staff_client, db_session):
        first = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        second = _course(db_session, "AAT3007", "01", [(1, "12:00", "13:15")])
        db_session.commit()

        assert assign(staff_client, first.course_id, "20262001").status_code == 200
        res = assign(staff_client, second.course_id, "20262001")
        assert res.status_code == 400
        assert "AAT3005-01" in res.json()["error"]

    def test_rejects_beyond_the_course_count_cap(self, staff_client, db_session):
        courses = [
            _course(db_session, f"AAT300{i}", "01", [(i, "12:00", "13:15")])
            for i in range(1, MAX_COURSES_PER_TA + 2)
        ]
        db_session.commit()

        for course in courses[:MAX_COURSES_PER_TA]:
            assert assign(staff_client, course.course_id, "20262001").status_code == 200
        res = assign(staff_client, courses[MAX_COURSES_PER_TA].course_id, "20262001")
        assert res.status_code == 400
        assert f"최대 {MAX_COURSES_PER_TA}과목" in res.json()["error"]

    def test_rejects_a_student_from_another_department(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.commit()

        res = assign(staff_client, course.course_id, "20262021")
        assert res.status_code == 400
        assert "이 부서 근로 학생이 아닙니다" in res.json()["error"]

    def test_rejects_a_duplicate_assignment(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.commit()

        assert assign(staff_client, course.course_id, "20262001").status_code == 200
        res = assign(staff_client, course.course_id, "20262001")
        assert res.status_code == 400
        assert "이미 이 과목에 배정" in res.json()["error"]

    def test_rejects_another_departments_scope(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.commit()

        res = assign(staff_client, course.course_id, "20262001", department_id=OTHER_DEPT_ID)
        assert res.status_code == 403


class TestUnassign:
    def test_removes_the_assignment(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.commit()
        assign(staff_client, course.course_id, "20262001")

        res = staff_client.delete(
            f"/api/course-ta/{DEPT_ID}/courses/{course.course_id}/tas/20262001"
        )
        assert res.status_code == 200
        assert res.json()["tas"] == []

    def test_missing_assignment_is_404(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.commit()

        res = staff_client.delete(
            f"/api/course-ta/{DEPT_ID}/courses/{course.course_id}/tas/20262001"
        )
        assert res.status_code == 404


class TestCandidates:
    def test_marks_who_can_be_assigned_and_why_not(self, staff_client, db_session):
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        clash = _course(db_session, "AAT3007", "01", [(1, "12:00", "13:15")])
        db_session.add(models.ClassTime(
            term=TERM, student_id="20262002", day_of_week=1,
            start_time=_time("12:00"), end_time=_time("13:15"),
        ))
        db_session.commit()
        assign(staff_client, clash.course_id, "20262003")

        rows = staff_client.get(
            f"/api/course-ta/{DEPT_ID}/courses/{course.course_id}/candidates"
        ).json()
        by_id = {r["student_id"]: r for r in rows}
        # 부서 학생만 후보다 — 다른 부서 학생(20262021)은 목록에 없다
        assert set(by_id) == {"20262001", "20262002", "20262003"}
        assert by_id["20262001"]["assignable"] is True
        assert by_id["20262002"]["assignable"] is False
        assert "본인 수강 시간" in by_id["20262002"]["reason"]
        assert by_id["20262003"]["assignable"] is False
        assert by_id["20262003"]["assigned_course_count"] == 1
        assert by_id["20262003"]["assigned_weekly_hours"] == 1.2  # 1시간 15분

    def test_candidate_verdict_matches_the_assign_endpoint(self, staff_client, db_session):
        """화면이 회색으로 그린 학생은 실제로도 배정되지 않아야 한다."""
        course = _course(db_session, "AAT3005", "01", [(1, "12:00", "13:15")])
        db_session.add(models.ClassTime(
            term=TERM, student_id="20262002", day_of_week=1,
            start_time=_time("12:30"), end_time=_time("14:00"),
        ))
        db_session.commit()

        rows = staff_client.get(
            f"/api/course-ta/{DEPT_ID}/courses/{course.course_id}/candidates"
        ).json()
        for row in rows:
            res = assign(staff_client, course.course_id, row["student_id"])
            assert (res.status_code == 200) is row["assignable"], (row, res.json())
            if res.status_code == 200:
                staff_client.delete(
                    f"/api/course-ta/{DEPT_ID}/courses/{course.course_id}"
                    f"/tas/{row['student_id']}"
                )
