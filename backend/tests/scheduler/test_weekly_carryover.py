"""주 상한의 기근무 이월 차감 (HC-TIME-2).

주 상한은 **ISO 주(월~일) 전체** 기준인데, 제약은 이번 생성 그리드 안의 슬롯만 셌다.
그래서 한 ISO 주가 생성 회차마다 상한을 새로 받았다 — 2026-09-01\\~09-07과 09-08\\~09-14를
잇달아 생성하니 경계 주(ISO 37)에 박민진 19.5h·윤영민 16.5h가 잡혔다 (상한 14h).
두 회차 모두 솔버는 OPTIMAL로 통과시킨다.

확정 검증(`work_hours.weekly_assigned_hours`)은 부서·배치를 가리지 않고 ISO 주 전체를
합산하므로, 이 상태의 초안은 확정에서 400으로 막힌다 — **생성은 되고 확정은 안 되는**
상태다. 그래서 여기 테스트는 로더가 세는 범위를 확정 검증과 같게 맞추는 데 초점을 둔다.

월 상한이 같은 문제를 `prior_monthly_hours`로 푼 것과 같은 해법이다
(`test_monthly_carryover.py`).
"""

from datetime import date, time, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.scheduler.service import _load_students_from_db, _prior_weekly_hours

DEPARTMENT_ID = 2
OTHER_DEPARTMENT_ID = 3
# 2026-09-07(월) ~ 09-16(수) — 월요일에 시작하지만 10일이라 마지막 ISO 주가 잘린다.
#   ISO 37주 = 09-07(월) ~ 09-13(일)  → 기간이 통째로 덮는다
#   ISO 38주 = 09-14(월) ~ 09-20(일)  → 09-14~16만 기간 안, 09-17~20은 기간 밖
PERIOD_START = date(2026, 9, 7)
PERIOD_END = date(2026, 9, 16)
ISO37 = (2026, 37)
ISO38 = (2026, 38)
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
            student_id=STUDENT, name="교비학생", password_hash="x", funding_type="gyobi"
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
    return _prior_weekly_hours(db, PERIOD_START, PERIOD_END).get(STUDENT, {})


def test_work_later_in_a_half_covered_week_counts(db):
    """기간이 주 중간에 끝나면, 그 주의 남은 날에 이미 잡힌 근무를 빼야 한다.

    이게 빠져 있어서 잘린 주가 상한을 통째로 새로 받았다.
    """
    _add_shifts(db, status="confirmed", start=date(2026, 9, 17), count=2)  # 10시간
    assert _prior(db) == {ISO38: 10.0}


def test_a_fully_covered_week_has_no_carryover(db):
    """ISO 37주는 기간이 통째로 덮으므로 뺄 것이 없다 — 이번 결과가 그 주 전부다."""
    _add_shifts(db, status="confirmed", start=PERIOD_START, count=5)
    assert ISO37 not in _prior(db)


def test_work_inside_the_period_is_not_counted(db):
    """이번에 다시 짜는 구간이라 이번 결과로 대체된다 — 이중 집계를 막는다."""
    _add_shifts(db, status="draft", start=PERIOD_START, count=3)           # 기간 안 15시간
    _add_shifts(db, status="confirmed", start=date(2026, 9, 18), count=1)  # 기간 밖 5시간
    assert _prior(db) == {ISO38: 5.0}


def test_draft_and_manual_batches_count_too(db):
    """아직 확정 전이어도 곧 확정될 배정이다 — 확정 검증도 draft를 센다."""
    _add_shifts(db, status="draft", start=date(2026, 9, 17), count=1)   # 5시간
    _add_shifts(db, status="manual", start=date(2026, 9, 18), count=1)  # 5시간
    assert _prior(db) == {ISO38: 10.0}


def test_superseded_batches_do_not_count(db):
    """재확정으로 내려간 배치는 실제 근무가 아니다."""
    _add_shifts(db, status="superseded", start=date(2026, 9, 17), count=3)
    assert _prior(db) == {}


def test_other_departments_count(db):
    """주 상한은 학생 개인에게 걸린다.

    확정 검증(`work_hours.weekly_assigned_hours`)이 부서를 가리지 않으므로 여기서도
    가리면 안 된다 — 두 곳이 다른 것을 세면 솔버는 통과시키고 확정이 400으로 막는다.
    """
    _add_shifts(db, status="confirmed", department_id=OTHER_DEPARTMENT_ID,
                start=date(2026, 9, 19), count=2)  # 10시간
    assert _prior(db) == {ISO38: 10.0}


def test_weeks_outside_the_period_are_ignored(db):
    """기간이 건드리지 않는 주의 근무는 이번 생성과 무관하다."""
    _add_shifts(db, status="confirmed", start=date(2026, 9, 24), count=2)  # ISO 39
    assert _prior(db) == {}


def test_weeks_are_kept_separate(db):
    """기간이 여러 ISO 주에 걸치면 주마다 따로 센다."""
    # 기간을 09-02(수)~09-16(수)로 잡으면 ISO 36·37·38에 걸치고 36·38이 잘린다
    _add_shifts(db, status="confirmed", start=date(2026, 8, 31), count=1)   # ISO 36, 5시간
    _add_shifts(db, status="confirmed", start=date(2026, 9, 17), count=1)   # ISO 38, 5시간
    prior = _prior_weekly_hours(db, date(2026, 9, 2), PERIOD_END).get(STUDENT, {})
    assert prior == {(2026, 36): 5.0, ISO38: 5.0}


def test_loader_hands_the_carryover_to_the_solver(db):
    """로더가 채워야 제약이 쓸 수 있다 — 여기가 끊기면 조용히 예전 동작으로 돌아간다."""
    _add_shifts(db, status="confirmed", start=date(2026, 9, 17), count=2)  # 10시간
    db.add(models.AvailableTime(
        student_id=STUDENT, day_of_week=1, start_time=time(9, 0), end_time=time(18, 0),
        preference=2,
    ))
    db.commit()

    students = _load_students_from_db(db, DEPARTMENT_ID, PERIOD_START, PERIOD_END)
    student = next(s for s in students if s.student_id == STUDENT)
    assert student.prior_weekly_hours == {ISO38: 10.0}


# ---- 제약이 실제로 차감을 쓰는지 (HC-TIME-2) ----
#
# 로더가 값을 채워도 제약이 안 읽으면 아무것도 안 바뀐다. 솔버를 직접 돌려
# "그 주에 이미 잡힌 만큼 덜 배정되는지"를 본다.
#
# 학생 1명 · 슬롯당 1명으로 둔다. 미충원 페널티(1000)가 개관 20슬롯을 다 채우도록
# 밀어붙이므로 **주 상한만이** 배정량을 정하는 유일한 이유가 된다 — 여러 명을 두면
# fair_hours가 먼저 갈라서 상한이 구속 조건이 아니게 되고, 수치가 이월과 무관해진다.

from app.scheduler.domain import FundingType  # noqa: E402
from tests.scheduler.test_solver_edge_cases import (  # noqa: E402
    ALL_OPEN,
    MONDAY,
    make_policy,
    make_student,
    solve,
)

# test_solver_edge_cases의 격자: 2026-08-03(월)부터 1주, 09:00~13:00 60분 슬롯 × 평일 5일
_ISO = MONDAY.isocalendar()
SOLVER_WEEK = (_ISO.year, _ISO.week)
ANOTHER_WEEK = (_ISO.year, _ISO.week + 5)
CAP = 14


def _solo_result(prior=None):
    policy = make_policy(min_per_slot=1, max_per_slot=1, gyobi_weekly_max_hours=CAP)
    student = make_student("s0", ALL_OPEN, FundingType.GYOBI)
    if prior:
        student.prior_weekly_hours = prior
    result, _ = solve(policy, [student])
    assert result.status == "OPTIMAL"
    # 60분 슬롯이라 슬롯 수 = 시간
    return sum(len(slots) for slots in result.slots_of_student("s0").values())


def test_without_carryover_the_solver_uses_the_whole_cap():
    """대조군 — 아래 수치들이 이월 때문에 줄어든 것임을 보이는 기준선이다."""
    assert _solo_result() == CAP


@pytest.mark.parametrize("prior, expected", [(6.0, 8), (9.0, 5)])
def test_carryover_shrinks_what_the_solver_may_add(prior, expected):
    """그 주에 이미 잡힌 만큼만 상한에서 빠진다."""
    assert _solo_result({SOLVER_WEEK: prior}) == expected


@pytest.mark.parametrize("prior", [14.0, 20.0])
def test_carryover_at_or_over_the_cap_blocks_the_week(prior):
    """이미 상한을 채웠으면 더 배정하지 않는다 — 넘겼어도 음수 상한이 되지 않는다."""
    assert _solo_result({SOLVER_WEEK: prior}) == 0


def test_carryover_for_another_week_does_not_leak():
    """다른 주의 이월은 이 주 상한을 건드리지 않는다."""
    assert _solo_result({ANOTHER_WEEK: 12.0}) == CAP
