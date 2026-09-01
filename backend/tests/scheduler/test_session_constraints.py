"""세션 임시 제약이 도메인에 얹히는지 (#254) — DB·솔버 없이 순수 도메인.

여기서 검증하는 것은 하나다: "이 조건이 걸린 슬롯에는 변수가 생기지 않는가."
can_work()가 False면 solver가 그 (학생, 날짜, 슬롯) 변수를 아예 만들지 않으므로
(engine/solver.py), Hard로 동작한다.
"""

import datetime

import pytest

from app.scheduler.domain import DaySchedule, FundingType, Student, WeeklyTimeMap
from app.scheduler.session_constraints import (
    StudentUnavailable,
    apply_to_students,
    parse_constraints,
)

MONDAY = datetime.date(2026, 9, 7)
TUESDAY = MONDAY + datetime.timedelta(days=1)
NEXT_MONDAY = MONDAY + datetime.timedelta(days=7)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


class _Calendar:
    """제약이 학사 캘린더보다 앞서는지 보려고 날짜 성격을 직접 정한다."""

    def __init__(self, school_only=(), public=()):
        self._school_only = set(school_only)
        self._public = set(public)

    def is_school_only_holiday(self, day):
        return day in self._school_only

    def is_public_holiday(self, day):
        return day in self._public

    def classes_run(self, day):
        return True

    def is_exam_period(self, day):
        return False


def _student(student_id="20221111", name="김현서"):
    days = [MONDAY + datetime.timedelta(days=i) for i in range(14)]
    return Student(
        student_id=student_id,
        name=name,
        funding_type=FundingType.GYOBI,
        available=WeeklyTimeMap(),
        preferred=WeeklyTimeMap(),
        class_times=WeeklyTimeMap(),
        date_schedule={
            d: DaySchedule(available=[(9 * 60, 18 * 60)]) for d in days
        },
    )


def _weekday_constraint(**kwargs):
    base = {"student_id": "20221111", "student_name": "김현서", "weekday": 1}
    return StudentUnavailable(**{**base, **kwargs})


class TestApply:
    def test_weekday_blocks_every_matching_date(self):
        [blocked] = apply_to_students(
            [_student()], [_weekday_constraint()], MONDAY, PERIOD_END
        )
        cal = _Calendar()
        assert not blocked.can_work(MONDAY, 10 * 60, cal)
        assert not blocked.can_work(NEXT_MONDAY, 10 * 60, cal)
        assert blocked.can_work(TUESDAY, 10 * 60, cal)

    def test_time_range_blocks_only_that_window(self):
        constraint = _weekday_constraint(start_min=9 * 60, end_min=12 * 60)
        [blocked] = apply_to_students([_student()], [constraint], MONDAY, PERIOD_END)
        cal = _Calendar()
        assert not blocked.can_work(MONDAY, 11 * 60, cal)
        assert blocked.can_work(MONDAY, 12 * 60, cal)  # 끝 시각은 포함하지 않는다

    def test_specific_dates_only(self):
        constraint = StudentUnavailable(
            student_id="20221111", student_name="김현서", dates=(MONDAY,)
        )
        [blocked] = apply_to_students([_student()], [constraint], MONDAY, PERIOD_END)
        cal = _Calendar()
        assert not blocked.can_work(MONDAY, 10 * 60, cal)
        assert blocked.can_work(NEXT_MONDAY, 10 * 60, cal)

    def test_other_students_untouched(self):
        others = [_student(), _student("20229999", "다른학생")]
        result = apply_to_students(others, [_weekday_constraint()], MONDAY, PERIOD_END)
        cal = _Calendar()
        assert not result[0].can_work(MONDAY, 10 * 60, cal)
        assert result[1].can_work(MONDAY, 10 * 60, cal)
        # 원본은 그대로여야 조건을 걷었을 때 원래 문제로 돌아간다
        assert others[0].blocked_ranges == []

    def test_beats_holiday_exception(self):
        """휴강일은 수업 시간까지 근무 가능으로 되살리는 경로가 있다 —
        담당자 조건이 그 경로로 되살아나면 지시가 무너진다."""
        [blocked] = apply_to_students(
            [_student()], [_weekday_constraint()], MONDAY, PERIOD_END
        )
        cal = _Calendar(public=[MONDAY])
        assert not blocked.can_work(MONDAY, 10 * 60, cal)

    def test_dates_outside_period_are_dropped(self):
        outside = StudentUnavailable(
            student_id="20221111",
            student_name="김현서",
            dates=(MONDAY - datetime.timedelta(days=30),),
        )
        [same] = apply_to_students([_student()], [outside], MONDAY, PERIOD_END)
        assert same.blocked_ranges == []

    def test_no_constraints_returns_input(self):
        students = [_student()]
        assert apply_to_students(students, [], MONDAY, PERIOD_END) is students


class TestSerialization:
    def test_roundtrip(self):
        original = _weekday_constraint(start_min=9 * 60, end_min=12 * 60)
        assert parse_constraints([original.to_dict()])[0].key == original.key

    def test_describe_reads_as_korean(self):
        assert _weekday_constraint().describe() == "김현서 학생 월요일 종일 근무 불가"
        assert (
            _weekday_constraint(start_min=9 * 60, end_min=12 * 60).describe()
            == "김현서 학생 월요일 09:00~12:00 근무 불가"
        )

    def test_requires_exactly_one_of_weekday_or_dates(self):
        with pytest.raises(ValueError):
            StudentUnavailable(student_id="1", student_name="A")
        with pytest.raises(ValueError):
            StudentUnavailable(
                student_id="1", student_name="A", weekday=1, dates=(MONDAY,)
            )


# ---------------------------------------------------------------------------
# 실제 CP-SAT 재solve — "지우기"와 "다시 풀기"의 차이가 드러나는 지점 (#254)
# ---------------------------------------------------------------------------


class TestResolveWithRealSolver:
    def test_blocked_slots_are_refilled_by_someone_else(self):
        """조건을 걸고 다시 풀면 그 학생의 월요일 배정은 0건이 되고,
        빈 자리는 다른 학생이 메운다 — 삭제만 하면 비는 자리다."""
        from tests.scheduler.test_solver_edge_cases import (
            ALL_OPEN,
            MONDAY as SOLVER_MONDAY,
            count_of,
            make_policy,
            make_student,
            solve,
        )

        students = [make_student("A", ALL_OPEN), make_student("B", ALL_OPEN)]
        policy = make_policy(min_per_slot=1, max_per_slot=1)

        before, _ = solve(policy, students, num_days=5)
        assert before.is_feasible
        monday_slots_before = len(before.assignments.get(SOLVER_MONDAY, {}))
        assert monday_slots_before > 0
        assert count_of(before, "A") > 0

        constraint = StudentUnavailable(
            student_id="A", student_name="A", weekday=SOLVER_MONDAY.isoweekday()
        )
        period_end = SOLVER_MONDAY + datetime.timedelta(days=4)
        after, _ = solve(
            policy,
            apply_to_students(students, [constraint], SOLVER_MONDAY, period_end),
            num_days=5,
        )
        assert after.is_feasible
        assert SOLVER_MONDAY not in after.slots_of_student("A")
        # 자리가 비지 않았다 — 월요일에 채워진 슬롯 수가 그대로다
        assert len(after.assignments.get(SOLVER_MONDAY, {})) == monday_slots_before
