"""ScheduleSolver Edge Case 테스트 (#83).

멘토 피드백(P0) 반영 — 극단적인 입력에서 Solver가 의도대로 동작하는지 검증한다.

1. 인원 부족: 가용 학생이 필요 인원보다 적을 때
   - 완화 ON(기본): 부족 슬롯이 shortage 리포트 + understaffing 페널티로 처리
   - 완화 OFF: 진짜 INFEASIBLE
   - Hard끼리 충돌(최소 인원 vs 주간 시간 상한): INFEASIBLE
2. 특정 학생 편중: 한 학생만 대부분 시간대 가용일 때 fair_hours가
   배정 독점을 막는지
3. 조건 하나 변경: 가능시간 하나만 바꿔 재생성했을 때 시간표 전체가
   과도하게 바뀌지 않는지 (변경 안정성)

시나리오를 정밀 제어하기 위해 config JSON 대신 코드로 최소 정책·캘린더를
구성한다. 슬롯은 60분 단위, 기간은 전부 방학(수업 시간 규칙 배제)이다.
"""

from datetime import date, timedelta

import pytest

from app.scheduler.domain import (
    AcademicCalendar,
    DepartmentPolicy,
    FundingType,
    PeriodType,
    ScheduleResult,
    Student,
    Weekday,
    WeeklyTimeMap,
)
from app.scheduler.domain.policy import HourLimitPolicy, StaffingPolicy
from app.scheduler.engine.solver import ScheduleSolver

# 2026-08-03(월)부터 1주. 캘린더에 학기 구간이 없으므로 전 기간 방학으로 판정된다.
MONDAY = date(2026, 8, 3)
WEEKDAYS = [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI]
OPEN_START, OPEN_END = 9 * 60, 13 * 60  # 09:00-13:00, 60분 슬롯 4개


def make_calendar() -> AcademicCalendar:
    return AcademicCalendar(
        semesters=[],
        exam_periods=[],
        public_holidays=set(),
        school_only_holidays=set(),
        closures=set(),
    )


def make_policy(
    *,
    min_per_slot: int = 1,
    max_per_slot: int = 2,
    allow_understaffing: bool = True,
    gyobi_weekly_max_hours: float = 14,
) -> DepartmentPolicy:
    return DepartmentPolicy(
        department_id="test_dept",
        department_name="테스트부서",
        slot_minutes=60,
        staffing=StaffingPolicy(
            min_per_slot=min_per_slot,
            max_per_slot=max_per_slot,
            allow_understaffing_with_penalty=allow_understaffing,
        ),
        hour_limits=HourLimitPolicy(
            gyobi_weekly_max_hours=gyobi_weekly_max_hours,
            gukga_weekly_max_hours={PeriodType.SEMESTER: 20, PeriodType.VACATION: 40},
            gukga_monthly_max_hours=46,
            gyobi_biweekly_dept_total_max_hours=190,
        ),
        opening_hours={
            PeriodType.SEMESTER: {d: [(OPEN_START, OPEN_END)] for d in WEEKDAYS},
            PeriodType.VACATION: {d: [(OPEN_START, OPEN_END)] for d in WEEKDAYS},
        },
        semester_public_holiday_hours=(OPEN_START, OPEN_END),
        exam_weekend_hours=(OPEN_START, OPEN_END),
        preferred_staffing_bands=[],
        meal_windows=[],
        vacation_long_shift_meal_hours=6,
        morning_end_min=OPEN_START,  # 개관 이전이므로 아침 규칙은 사실상 비활성
        exam_buffer_minutes=180,
        soft_weights={
            # 프로덕션(library_info_service.json)과 동일 가중치
            "understaffing": 1000,
            "preferred_slot_miss": 3,
            "block_start": 4,
            "fair_hours_shortfall": 6,
        },
    )


def make_student(
    sid: str,
    available: dict[Weekday, list[tuple[int, int]]],
    funding: FundingType = FundingType.GYOBI,
) -> Student:
    """가능시간만 지정하는 최소 학생. 희망시간 = 가능시간(선호 페널티 배제)."""
    return Student(
        student_id=sid,
        name=sid,
        funding_type=funding,
        available=WeeklyTimeMap(ranges=dict(available)),
        preferred=WeeklyTimeMap(ranges=dict(available)),
        class_times=WeeklyTimeMap(),
    )


def solve(policy: DepartmentPolicy, students: list[Student], num_days: int = 7):
    solver = ScheduleSolver(policy, make_calendar(), students, MONDAY, num_days)
    return solver.solve()


def assigned_pairs(result: ScheduleResult) -> set[tuple[str, date, int]]:
    return {
        (sid, day, minute)
        for day, by_slot in result.assignments.items()
        for minute, sids in by_slot.items()
        for sid in sids
    }


def count_of(result: ScheduleResult, sid: str) -> int:
    return sum(len(slots) for slots in result.slots_of_student(sid).values())


ALL_OPEN = {d: [(OPEN_START, OPEN_END)] for d in WEEKDAYS}


# ---------------------------------------------------------------------------
# 1. 인원 부족
# ---------------------------------------------------------------------------


class TestUnderstaffing:
    def test_shortage_reported_with_penalty(self):
        """가용 학생이 없는 슬롯은 INFEASIBLE 대신 부족 리포트로 남는다 (완화 ON)."""
        # 학생 1명이 월·화만 가용 → 수·목·금 4슬롯 × 3일 = 12슬롯 인원 0
        student = make_student(
            "s1",
            {Weekday.MON: [(OPEN_START, OPEN_END)], Weekday.TUE: [(OPEN_START, OPEN_END)]},
        )
        result, ctx = solve(make_policy(), [student])

        assert result.status == "OPTIMAL"
        assert result.is_feasible

        shortages = {(s.day, s.slot_min) for s in result.shortages}
        expected = {
            (MONDAY + timedelta(days=offset), OPEN_START + h * 60)
            for offset in (2, 3, 4)  # 수·목·금
            for h in range(4)
        }
        assert shortages == expected
        assert all(s.required == 1 and s.assigned == 0 for s in result.shortages)
        # 부족 12슬롯 × 가중치 1000
        assert result.penalty_breakdown["understaffing"] == 12 * 1000
        # 가용한 월·화 8슬롯은 전부 배정된다
        assert count_of(result, "s1") == 8

    def test_understaffing_disallowed_is_infeasible(self):
        """완화를 끄면 같은 입력이 진짜 INFEASIBLE이 된다."""
        student = make_student("s1", {Weekday.MON: [(OPEN_START, OPEN_END)]})
        result, ctx = solve(make_policy(allow_understaffing=False), [student])

        assert result.status == "INFEASIBLE"
        assert not result.is_feasible
        assert result.assignments == {}
        assert result.objective_value is None

    def test_hard_conflict_min_staffing_vs_weekly_cap(self):
        """Hard끼리 충돌: 최소 인원(주 20슬롯 필요) vs 주간 상한(4시간) → INFEASIBLE."""
        student = make_student("s1", ALL_OPEN)
        policy = make_policy(allow_understaffing=False, gyobi_weekly_max_hours=4)
        result, ctx = solve(policy, [student])

        assert result.status == "INFEASIBLE"
        assert not result.is_feasible


# ---------------------------------------------------------------------------
# 2. 특정 학생 편중
# ---------------------------------------------------------------------------


class TestFairHours:
    def test_available_everywhere_student_does_not_monopolize(self):
        """전 시간대 가용 학생이 있어도 다른 학생의 가용 슬롯을 뺏지 않는다.

        heavy: 20슬롯 가용 (주간 상한 14슬롯 → fair 목표 14)
        b/c: 각 4슬롯 가용 (fair 목표 4) — max_per_slot=2라 heavy와 공존 가능
        최적해는 전원 목표 달성(shortfall 0)이므로 배정량이 유일하게 결정된다.
        """
        heavy = make_student("heavy", ALL_OPEN)
        b = make_student("b", {Weekday.MON: [(OPEN_START, OPEN_END)]})
        c = make_student("c", {Weekday.TUE: [(OPEN_START, OPEN_END)]})
        result, ctx = solve(make_policy(), [heavy, b, c])

        assert result.status == "OPTIMAL"
        assert result.shortages == []
        # heavy는 주간 상한(14시간=14슬롯)까지만 — 가용 20슬롯 독점 불가
        assert count_of(result, "heavy") == 14
        # 가용시간이 적은 학생도 본인 가용 슬롯을 전부 배정받는다
        assert count_of(result, "b") == 4
        assert count_of(result, "c") == 4
        assert "fair_hours" not in result.penalty_breakdown

    def test_alternatives_share_objective_and_differ(self):
        """solve_alternatives: 동률 해는 목적값이 같고 서로 다른 배정이어야 한다."""
        heavy = make_student("heavy", ALL_OPEN)
        b = make_student("b", {Weekday.MON: [(OPEN_START, OPEN_END)]})
        solver = ScheduleSolver(make_policy(), make_calendar(), [heavy, b], MONDAY, 7)
        results, ctx = solver.solve_alternatives(num_solutions=2, min_difference_slots=2)

        assert len(results) >= 1
        assert results[0].is_feasible
        if len(results) == 2:
            assert results[1].objective_value <= results[0].objective_value
            diff = assigned_pairs(results[0]) ^ assigned_pairs(results[1])
            assert len(diff) >= 2


# ---------------------------------------------------------------------------
# 3. 조건 하나 변경 (변경 안정성)
# ---------------------------------------------------------------------------


def _stability_students(b_tue_start: int = OPEN_START) -> list[Student]:
    """안정성 시나리오: heavy(전 시간대) + b(월-수) + c(목-금).

    b_tue_start로 b의 화요일 가용 시작 시각만 바꿔 '가능시간 하나 변경'을
    재현한다.
    """
    heavy = make_student("heavy", ALL_OPEN)
    b = make_student(
        "b",
        {
            Weekday.MON: [(OPEN_START, OPEN_END)],
            Weekday.TUE: [(b_tue_start, OPEN_END)],
            Weekday.WED: [(OPEN_START, OPEN_END)],
        },
    )
    c = make_student(
        "c",
        {
            Weekday.THU: [(OPEN_START, OPEN_END)],
            Weekday.FRI: [(OPEN_START, OPEN_END)],
        },
    )
    return [heavy, b, c]


class TestRegenerationStability:
    def test_single_availability_change_is_local(self):
        """학생 한 명의 가용 슬롯 1개 변경 시 시간표가 통째로 뒤집히지 않는다."""
        baseline, _ = solve(make_policy(), _stability_students())
        assert baseline.is_feasible

        # b가 화요일 09:00-10:00 한 슬롯만 가용 시간에서 제외
        changed, _ = solve(make_policy(), _stability_students(b_tue_start=OPEN_START + 60))
        assert changed.is_feasible

        before = assigned_pairs(baseline)
        after = assigned_pairs(changed)
        diff = before ^ after
        # 이상적 최소 변화는 1~2건. 재배치 여유를 두더라도 전체의 25%를
        # 넘으면 '재생성마다 시간표가 뒤집히는' 상태로 본다.
        assert len(diff) <= max(2, len(before) // 4), (
            f"배정 {len(before)}건 중 {len(diff)}건 변경 — 재생성 안정성 부족"
        )
