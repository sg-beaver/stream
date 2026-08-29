"""부서 운영 상한이 솔버 제약에도 반영되는지 (#161).

`department.weekly_hour_limit`은 부서가 정한 주간 상한이고, 정책 파일의
`gyobi/gukga_weekly_max_hours`는 법정 상한이다. 확정(`_check_weekly_hour_limits`)은
**둘 다** 보는데 솔버는 법정 상한만 봤다 — 부서 상한이 법정보다 낮으면 솔버가
그걸 넘는 근무표를 내고 확정이 거부하는, **생성은 되고 확정은 안 되는** 상태가 됐다.

정보서비스팀이 그 경우였다: 부서 상한 15h인데 국가 근로 법정 상한이 학기 20h.
"""

from datetime import date, time, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.scheduler.config import load_department_policy
from app.scheduler.domain import FundingType, PeriodType
from app.routers.schedule import (
    _check_weekly_hour_limits,
    _funding_weekly_cap_hours,
    _weekly_assigned_hours,
)
from app.scheduler.service import apply_department_overrides

DEPARTMENT_ID = 2
MONDAY = date(2026, 9, 7)  # 2026-2학기 평일


def _to_funding(raw):
    return FundingType(raw)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _policy(db):
    return apply_department_overrides(
        db, DEPARTMENT_ID, load_department_policy("library_info_service")
    )


def test_department_limit_tightens_the_solver_caps(db):
    """부서 상한이 법정 상한보다 낮으면 솔버가 쓰는 상한도 그만큼 좁아진다."""
    db.add(models.Department(
        department_id=DEPARTMENT_ID, name="정보서비스팀", weekly_hour_limit=15
    ))
    db.commit()

    limits = _policy(db).hour_limits
    # 국가 법정 상한은 학기 20h·방학 40h인데 부서가 15h로 정했다
    assert limits.gukga_weekly(PeriodType.SEMESTER) == 15
    assert limits.gukga_weekly(PeriodType.VACATION) == 15
    # 교비는 법정 14h가 더 낮아 부서 상한이 걸리지 않는다
    assert limits.gyobi_weekly_max_hours == 14


def test_department_limit_never_loosens_the_legal_cap(db):
    """부서 상한이 법정보다 높으면 법정이 그대로 남는다 — 완화는 없다."""
    db.add(models.Department(
        department_id=DEPARTMENT_ID, name="정보서비스팀", weekly_hour_limit=30
    ))
    db.commit()

    limits = _policy(db).hour_limits
    assert limits.gyobi_weekly_max_hours == 14
    assert limits.gukga_weekly(PeriodType.SEMESTER) == 20


def test_missing_department_limit_leaves_policy_untouched(db):
    db.add(models.Department(
        department_id=DEPARTMENT_ID, name="정보서비스팀", weekly_hour_limit=None
    ))
    db.commit()

    limits = _policy(db).hour_limits
    assert limits.gyobi_weekly_max_hours == 14
    assert limits.gukga_weekly(PeriodType.SEMESTER) == 20


@pytest.mark.parametrize("funding, expected", [("gyobi", 14), ("gukga", 15)])
def test_solver_and_confirm_agree_on_the_cap(db, funding, expected):
    """#161의 핵심 불변식 — 솔버가 쓰는 상한과 확정이 검사하는 상한이 같아야 한다.

    두 값이 어긋나면 생성된 근무표를 확정할 수 없다. 어느 한쪽만 고치면
    다시 벌어지므로 둘을 나란히 두고 고정한다.
    """
    db.add(models.Department(
        department_id=DEPARTMENT_ID, name="정보서비스팀", weekly_hour_limit=15
    ))
    student = models.Student(
        student_id="20221111", name="학생", password_hash="x", funding_type=funding
    )
    db.add(student)
    db.commit()

    limits = _policy(db).hour_limits
    solver_cap = (
        limits.gyobi_weekly_max_hours
        if funding == "gyobi"
        else min(limits.gukga_weekly(p) for p in (PeriodType.SEMESTER, PeriodType.VACATION))
    )
    # 확정 검사와 같은 계산 — 부서 운영 상한과 법정 상한 중 낮은 쪽
    department = db.query(models.Department).filter(
        models.Department.department_id == DEPARTMENT_ID
    ).first()
    confirm_cap = min(
        float(department.weekly_hour_limit),
        _funding_weekly_cap_hours(DEPARTMENT_ID, db, _to_funding(funding), MONDAY),
    )

    assert solver_cap == confirm_cap == expected


def test_a_week_at_the_solver_cap_passes_the_confirm_check(db):
    """솔버 상한까지 꽉 채운 주가 확정 검사를 통과해야 한다 (경계값)."""
    db.add(models.Department(
        department_id=DEPARTMENT_ID, name="정보서비스팀", weekly_hour_limit=15
    ))
    student = models.Student(
        student_id="20221111", name="국가학생", password_hash="x", funding_type="gukga"
    )
    db.add(student)
    db.flush()
    batch = models.ScheduleBatch(
        department_id=DEPARTMENT_ID, status="confirmed",
        period_start=MONDAY, period_end=MONDAY + timedelta(days=6),
    )
    db.add(batch)
    db.flush()
    # 솔버 상한(15h)만큼 배정 — 5시간씩 3일
    for offset in range(3):
        db.add(models.WorkSchedule(
            batch_id=batch.batch_id, student_id=student.student_id,
            department_id=DEPARTMENT_ID, work_date=MONDAY + timedelta(days=offset),
            start_time=time(9, 0), end_time=time(14, 0),
        ))
    db.commit()

    assigned = _weekly_assigned_hours(db, student.student_id, MONDAY)
    assert assigned == 15
    # 여기서 400이 나면 솔버 결과를 확정할 수 없다는 뜻
    _check_weekly_hour_limits(db, DEPARTMENT_ID, student, MONDAY, assigned, 0)
