"""국가 근로 월 상한의 기근무 이월 차감 (HC-TIME-3).

월 상한(46h)은 **한 달 전체** 기준인데 근무표 생성은 보통 2주씩 끊어서 한다.
이번 기간 밖에 이미 잡혀 있는 근무를 빼주지 않으면, 각 회차는 상한 안이어도
월 합계가 넘어간다 — 실제로 9월을 2주씩 두 번 생성하니 학생별 58h·63h가 나왔다.
"""

from datetime import date, time, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.scheduler.service import _load_students_from_db, _prior_monthly_hours

DEPARTMENT_ID = 2
OTHER_DEPARTMENT_ID = 3
# 2026-09-14 ~ 09-27 — 9월 안에서 두 번째 2주 (첫 2주는 이미 확정됐다고 본다)
PERIOD_START = date(2026, 9, 14)
PERIOD_END = date(2026, 9, 27)
STUDENT = "20221111"


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        models.Department(department_id=DEPARTMENT_ID, name="정보서비스팀"),
        models.Department(department_id=OTHER_DEPARTMENT_ID, name="다른 부서"),
        models.DepartmentPolicy(
            department_id=DEPARTMENT_ID, availability_mode="weekly_with_exceptions"
        ),
        models.JobPosting(posting_id=1, department_id=DEPARTMENT_ID, title="공고"),
        models.Student(
            student_id=STUDENT, name="국가학생", password_hash="x", funding_type="gukga"
        ),
        models.Application(student_id=STUDENT, posting_id=1, status="합격"),
    ])
    session.commit()
    yield session
    session.close()


def _add_shifts(db, *, status, department_id=DEPARTMENT_ID, start, count, hours=5):
    """start부터 count일 동안 하루 hours시간씩 근무를 넣는다."""
    batch = models.ScheduleBatch(
        department_id=department_id, status=status,
        period_start=start, period_end=start + timedelta(days=count - 1),
    )
    db.add(batch)
    db.flush()
    for offset in range(count):
        db.add(models.WorkSchedule(
            batch_id=batch.batch_id, student_id=STUDENT, department_id=department_id,
            work_date=start + timedelta(days=offset),
            start_time=time(9, 0), end_time=time(9 + hours, 0),
        ))
    db.commit()
    return batch


def _prior(db):
    return _prior_monthly_hours(db, PERIOD_START, PERIOD_END).get(STUDENT, {})


def test_confirmed_work_earlier_in_the_month_counts(db):
    _add_shifts(db, status="confirmed", start=date(2026, 9, 1), count=4)  # 20시간
    assert _prior(db) == {(2026, 9): 20.0}


def test_work_inside_the_period_is_not_counted(db):
    """이번에 다시 짜는 구간이라 이번 결과로 대체된다 — 이중 집계를 막는다."""
    _add_shifts(db, status="confirmed", start=date(2026, 9, 1), count=2)   # 기간 밖 10시간
    _add_shifts(db, status="draft", start=PERIOD_START, count=3)           # 기간 안 15시간
    assert _prior(db) == {(2026, 9): 10.0}


def test_draft_and_manual_batches_count_too(db):
    """아직 확정 전이어도 곧 확정될 배정이라 빼두지 않으면 상한을 넘는 조합이 나온다."""
    _add_shifts(db, status="draft", start=date(2026, 9, 1), count=2)    # 10시간
    _add_shifts(db, status="manual", start=date(2026, 9, 3), count=1)   # 5시간
    assert _prior(db) == {(2026, 9): 15.0}


def test_superseded_batches_do_not_count(db):
    """재확정으로 내려간 배치는 실제 근무가 아니다."""
    _add_shifts(db, status="superseded", start=date(2026, 9, 1), count=4)
    assert _prior(db) == {}


def test_other_departments_count(db):
    """월 상한은 학생 개인에게 걸린다 — 다른 부서 근무도 같은 달에 합산된다."""
    _add_shifts(db, status="confirmed", department_id=OTHER_DEPARTMENT_ID,
                start=date(2026, 9, 2), count=3)  # 15시간
    assert _prior(db) == {(2026, 9): 15.0}


def test_other_months_are_kept_separate(db):
    """기간이 두 달에 걸치면 달마다 따로 센다."""
    _add_shifts(db, status="confirmed", start=date(2026, 9, 1), count=2)     # 9월 10시간
    _add_shifts(db, status="confirmed", start=date(2026, 10, 20), count=3)  # 10월 15시간
    # 기간을 9/14~10/11로 잡으면 두 달에 걸친다 — 위 근무는 둘 다 기간 밖이다
    prior = _prior_monthly_hours(db, PERIOD_START, date(2026, 10, 11)).get(STUDENT, {})
    assert prior == {(2026, 9): 10.0, (2026, 10): 15.0}


def test_loader_hands_the_carryover_to_the_solver(db):
    """로더가 채워야 제약이 쓸 수 있다 — 여기가 끊기면 조용히 예전 동작으로 돌아간다."""
    _add_shifts(db, status="confirmed", start=date(2026, 9, 1), count=6)  # 30시간
    db.add(models.AvailableTime(
        student_id=STUDENT, day_of_week=1, start_time=time(9, 0), end_time=time(18, 0),
        preference=2,
    ))
    db.commit()

    students = _load_students_from_db(db, DEPARTMENT_ID, PERIOD_START, PERIOD_END)
    student = next(s for s in students if s.student_id == STUDENT)
    assert student.prior_monthly_hours == {(2026, 9): 30.0}
