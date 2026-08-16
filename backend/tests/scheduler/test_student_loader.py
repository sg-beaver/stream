"""DB 수합 데이터 → 스케줄러 Student 변환 (service._load_students_from_db).

재원 구분(funding_type)과 활동 기간(active_from/until)이 DB 값에서 제대로
넘어오는지를 확인한다 — 각각 HC-TIME-1/2와 HC-CLASS-6의 입력이라, 여기서
잘못 채워지면 솔버는 조용히 틀린 상한으로 배정한다.
"""

from datetime import date, time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.scheduler.config import load_academic_calendar
from app.scheduler.domain import FundingType
from app.scheduler.service import _load_students_from_db

DEPARTMENT_ID = 2
PERIOD_START = date(2026, 6, 1)  # 월요일
PERIOD_END = date(2026, 6, 14)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(models.Department(department_id=DEPARTMENT_ID, name="정보서비스팀"))
    session.add(
        models.DepartmentPolicy(
            department_id=DEPARTMENT_ID, availability_mode="weekly_with_exceptions"
        )
    )
    yield session
    session.close()


def add_posting(db, posting_id, period_start=None, period_end=None):
    db.add(
        models.JobPosting(
            posting_id=posting_id,
            department_id=DEPARTMENT_ID,
            title=f"공고 {posting_id}",
            period_start=period_start,
            period_end=period_end,
        )
    )


def add_hired_student(db, student_id, funding_type, posting_id=1, name="테스트"):
    db.add(
        models.Student(
            student_id=student_id,
            name=name,
            password_hash="x",
            funding_type=funding_type,
        )
    )
    db.add(
        models.Application(student_id=student_id, posting_id=posting_id, status="합격")
    )
    # 가능시간이 없으면 date_schedule이 비어 can_work가 항상 False가 되므로,
    # 활동 기간 검증을 위해 월~금 09:00~18:00을 깔아둔다.
    for day_of_week in range(1, 6):
        db.add(
            models.AvailableTime(
                student_id=student_id,
                day_of_week=day_of_week,
                start_time=time(9, 0),
                end_time=time(18, 0),
                preference=1,
            )
        )


def load(db):
    return {
        s.student_id: s
        for s in _load_students_from_db(db, DEPARTMENT_ID, PERIOD_START, PERIOD_END)
    }


@pytest.mark.parametrize(
    "stored, expected",
    [
        ("gyobi", FundingType.GYOBI),
        ("gukga", FundingType.GUKGA),
        (None, FundingType.GYOBI),  # 미입력 → 상한이 더 낮은 교비로 폴백
        ("교비", FundingType.GYOBI),  # 알 수 없는 값도 동일하게 폴백
    ],
)
def test_funding_type_is_read_from_student_row(db, stored, expected):
    add_posting(db, 1)
    add_hired_student(db, "2022001", stored)
    db.commit()

    assert load(db)["2022001"].funding_type is expected


def test_gukga_and_gyobi_students_keep_their_own_funding_type(db):
    """전원 교비로 고정되면 국가 학생의 주 20/40h 상한이 14h로 깎인다."""
    add_posting(db, 1)
    add_hired_student(db, "2022001", "gyobi")
    add_hired_student(db, "2022002", "gukga")
    db.commit()

    students = load(db)
    assert students["2022001"].funding_type is FundingType.GYOBI
    assert students["2022002"].funding_type is FundingType.GUKGA


def test_active_period_comes_from_hired_posting(db):
    add_posting(db, 1, period_start=date(2026, 6, 8), period_end=date(2026, 8, 31))
    add_hired_student(db, "2022001", "gyobi")
    db.commit()

    student = load(db)["2022001"]
    assert student.active_from == date(2026, 6, 8)
    assert student.active_until == date(2026, 8, 31)


def test_assignment_is_blocked_before_active_from(db):
    """중도 합류: 근로 시작 전 날짜에는 배정 변수가 생기지 않아야 한다 (HC-CLASS-6)."""
    add_posting(db, 1, period_start=date(2026, 6, 8), period_end=date(2026, 8, 31))
    add_hired_student(db, "2022001", "gyobi")
    db.commit()

    student = load(db)["2022001"]
    calendar = load_academic_calendar(2026)
    ten_am = 10 * 60

    assert not student.can_work(date(2026, 6, 1), ten_am, calendar)  # 시작 전
    assert student.can_work(date(2026, 6, 8), ten_am, calendar)  # 시작일


def test_missing_posting_period_means_no_bound(db):
    add_posting(db, 1, period_start=None, period_end=None)
    add_hired_student(db, "2022001", "gyobi")
    db.commit()

    student = load(db)["2022001"]
    assert student.active_from is None
    assert student.active_until is None


def test_multiple_hired_postings_widen_the_active_period(db):
    add_posting(db, 1, period_start=date(2026, 3, 2), period_end=date(2026, 6, 30))
    add_posting(db, 2, period_start=date(2026, 7, 1), period_end=date(2026, 8, 31))
    add_hired_student(db, "2022001", "gyobi", posting_id=1)
    db.add(models.Application(student_id="2022001", posting_id=2, status="합격"))
    db.commit()

    student = load(db)["2022001"]
    assert student.active_from == date(2026, 3, 2)
    assert student.active_until == date(2026, 8, 31)


def test_rejected_applicants_are_not_loaded(db):
    add_posting(db, 1)
    add_hired_student(db, "2022001", "gyobi")
    db.add(
        models.Student(
            student_id="2022999", name="불합격", password_hash="x", funding_type="gyobi"
        )
    )
    db.add(models.Application(student_id="2022999", posting_id=1, status="불합격"))
    db.commit()

    assert set(load(db)) == {"2022001"}
