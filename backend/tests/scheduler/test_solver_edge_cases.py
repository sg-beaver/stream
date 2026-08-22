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

추가 Edge Case (#83 코멘트의 7종):
4. Hard Constraint 전수 검증: 현실 샘플의 해를 순회하며 인원·시간 상한·
   개관·can_work 위반 0건 확인 (안전망)
5. date_schedule(날짜 단위 수합) 경로: 프로덕션 경로로 인원 부족·편중 재검증
6. 시간 제한 조기 종료: UNKNOWN이 INFEASIBLE과 구분되는지
7. 부분 부족: required 대비 assigned가 일부만 채워진 슬롯 리포트
8. 빈 입력 견고성: 학생 0명·전 기간 폐관
9. 아침 근무 불가(Hard 인코딩): 최소 인원 압력에도 아침 슬롯 배정 금지
10. 국가근로 특수 규칙: 교내 휴강일 배정 불가, 학기·방학 혼합 주 보수적 상한

시나리오를 정밀 제어하기 위해 config JSON 대신 코드로 최소 정책·캘린더를
구성한다 (전수 검증·시간 제한 테스트만 프로덕션 config·샘플 사용).
슬롯은 60분 단위, 기간은 기본 전부 방학(수업 시간 규칙 배제)이다.
"""

from datetime import date, timedelta

import pytest

from app.scheduler.config import (
    load_academic_calendar,
    load_department_policy,
    load_sample_students,
)
from app.scheduler.constraints.hard import _group_by_week

from app.scheduler.domain import (
    AcademicCalendar,
    DaySchedule,
    DepartmentPolicy,
    FundingType,
    PeriodType,
    ScheduleResult,
    Student,
    StudentPreferences,
    Weekday,
    WeeklyTimeMap,
)
from app.scheduler.domain.calendar import DateRange
from app.scheduler.domain.policy import HourLimitPolicy, StaffingPolicy
from app.scheduler.engine.solver import ScheduleSolver

# 2026-08-03(월)부터 1주. 캘린더에 학기 구간이 없으므로 전 기간 방학으로 판정된다.
MONDAY = date(2026, 8, 3)
WEEKDAYS = [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI]
OPEN_START, OPEN_END = 9 * 60, 13 * 60  # 09:00-13:00, 60분 슬롯 4개


def make_calendar(
    *,
    semesters: list[DateRange] | None = None,
    school_only_holidays: set[date] | None = None,
    closures: set[date] | None = None,
) -> AcademicCalendar:
    return AcademicCalendar(
        semesters=semesters or [],
        exam_periods=[],
        public_holidays=set(),
        school_only_holidays=school_only_holidays or set(),
        closures=closures or set(),
    )


def make_policy(
    *,
    min_per_slot: int = 1,
    max_per_slot: int = 2,
    allow_understaffing: bool = True,
    gyobi_weekly_max_hours: float = 14,
    gukga_weekly_max_hours: dict[PeriodType, float] | None = None,
    open_start: int = OPEN_START,
    open_end: int = OPEN_END,
    morning_end: int | None = None,
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
            gukga_weekly_max_hours=(
                gukga_weekly_max_hours
                or {PeriodType.SEMESTER: 20, PeriodType.VACATION: 40}
            ),
            gukga_monthly_max_hours=46,
            gyobi_biweekly_dept_total_max_hours=190,
        ),
        opening_hours={
            PeriodType.SEMESTER: {d: [(open_start, open_end)] for d in WEEKDAYS},
            PeriodType.VACATION: {d: [(open_start, open_end)] for d in WEEKDAYS},
        },
        semester_public_holiday_hours=(open_start, open_end),
        exam_weekend_hours=(open_start, open_end),
        preferred_staffing_bands=[],
        meal_windows=[],
        vacation_long_shift_meal_hours=6,
        # 기본값은 개관 시각과 같아 아침 규칙이 사실상 비활성. 아침 규칙 테스트에서만 지정.
        morning_end_min=morning_end if morning_end is not None else open_start,
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
    preferences: StudentPreferences | None = None,
) -> Student:
    """가능시간만 지정하는 최소 학생. 희망시간 = 가능시간(선호 페널티 배제)."""
    return Student(
        student_id=sid,
        name=sid,
        funding_type=funding,
        available=WeeklyTimeMap(ranges=dict(available)),
        preferred=WeeklyTimeMap(ranges=dict(available)),
        class_times=WeeklyTimeMap(),
        preferences=preferences or StudentPreferences(),
    )


def solve(
    policy: DepartmentPolicy,
    students: list[Student],
    num_days: int = 7,
    calendar: AcademicCalendar | None = None,
):
    solver = ScheduleSolver(
        policy, calendar or make_calendar(), students, MONDAY, num_days
    )
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

    def test_partial_shortage_reports_assigned_count(self):
        """부분 부족: 2명 필요 슬롯에 1명만 배정되면 required=2·assigned=1로 리포트."""
        # 학생 1명(주간 상한 14슬롯)이 20슬롯 × 최소 2명을 채울 수 없다.
        # 최적해: 14슬롯은 1명 배정(부족 1), 나머지 6슬롯은 0명(부족 2).
        student = make_student("s1", ALL_OPEN)
        result, ctx = solve(make_policy(min_per_slot=2), [student])

        assert result.status == "OPTIMAL"
        assert len(result.shortages) == 20
        assert all(s.required == 2 for s in result.shortages)
        partial = [s for s in result.shortages if s.assigned == 1]
        empty = [s for s in result.shortages if s.assigned == 0]
        assert len(partial) == 14
        assert len(empty) == 6
        # 부족 인원 합 = 14×1 + 6×2 = 26명 × 가중치 1000
        assert result.penalty_breakdown["understaffing"] == 26 * 1000


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


# ---------------------------------------------------------------------------
# 4. Hard Constraint 위반 0건 전수 검증 (현실 샘플)
# ---------------------------------------------------------------------------


class TestHardConstraintSweep:
    """어떤 해가 나와도 Hard Constraint는 깨지지 않는다 — 결과 전수 순회 안전망.

    시나리오 검증(위 클래스들)과 달리, 프로덕션 config·샘플(9명·2주)로 풀고
    나온 해 자체를 규칙별로 재검산한다.
    """

    def test_no_hard_violation_on_realistic_sample(self):
        policy = load_department_policy("library_info_service")
        calendar = load_academic_calendar(2026)
        students, start, num_days = load_sample_students()
        solver = ScheduleSolver(policy, calendar, students, start, num_days)
        result, ctx = solver.solve(time_limit_seconds=10.0)

        assert result.status in ("OPTIMAL", "FEASIBLE")
        grid = ctx.grid
        by_id = {s.student_id: s for s in students}

        # 슬롯 단위: 최대 인원, 개관 슬롯, can_work (가능시간·수업·특정일 불가)
        for day, by_slot in result.assignments.items():
            for minute, sids in by_slot.items():
                assert len(sids) <= policy.staffing.max_per_slot, (day, minute)
                assert len(sids) == len(set(sids)), (day, minute)  # 중복 배정 없음
                assert grid.is_open(day, minute), (day, minute)
                for sid in sids:
                    assert by_id[sid].can_work(day, minute, calendar), (sid, day, minute)

        # 학생·주 단위: 재원별 주간 상한 (ISO 주, 학기·방학 혼합 주는 보수적 min)
        limits = policy.hour_limits
        weeks = _group_by_week(grid.dates)
        for student in students:
            slots_by_day = result.slots_of_student(student.student_id)
            for week_dates in weeks.values():
                worked = sum(len(slots_by_day.get(d, [])) for d in week_dates)
                if student.funding_type == FundingType.GYOBI:
                    cap_hours = limits.gyobi_weekly_max_hours
                else:
                    cap_hours = min(
                        limits.gukga_weekly(calendar.period_type(d)) for d in week_dates
                    )
                assert worked <= grid.hours_to_slots(cap_hours), (
                    student.student_id, week_dates[0], worked,
                )

            # 국가 근로 월 상한
            if student.funding_type == FundingType.GUKGA:
                monthly: dict[tuple[int, int], int] = {}
                for d, slots in slots_by_day.items():
                    key = (d.year, d.month)
                    monthly[key] = monthly.get(key, 0) + len(slots)
                cap = grid.hours_to_slots(limits.gukga_monthly_max_hours)
                assert all(v <= cap for v in monthly.values()), student.student_id

        # 부서 단위: 2주 창별 교비 총합 상한
        gyobi_slots_by_day: dict[date, int] = {}
        for student in students:
            if student.funding_type != FundingType.GYOBI:
                continue
            for d, slots in result.slots_of_student(student.student_id).items():
                gyobi_slots_by_day[d] = gyobi_slots_by_day.get(d, 0) + len(slots)
        biweekly_cap = grid.hours_to_slots(limits.gyobi_biweekly_dept_total_max_hours)
        dates = grid.dates
        for i in range(0, len(dates), 14):
            window_total = sum(gyobi_slots_by_day.get(d, 0) for d in dates[i : i + 14])
            assert window_total <= biweekly_cap


# ---------------------------------------------------------------------------
# 5. date_schedule(날짜 단위 수합) 경로 — 프로덕션(DB → materializer) 경로 재검증
# ---------------------------------------------------------------------------


def date_student(sid: str, by_day: dict[date, list[tuple[int, int]]]) -> Student:
    """주간 반복 대신 날짜 단위(date_schedule)로 가용시간을 갖는 학생."""
    return Student(
        student_id=sid,
        name=sid,
        funding_type=FundingType.GYOBI,
        available=WeeklyTimeMap(),
        preferred=WeeklyTimeMap(),
        class_times=WeeklyTimeMap(),
        date_schedule={
            d: DaySchedule(available=list(ranges), preferred=list(ranges))
            for d, ranges in by_day.items()
        },
    )


class TestDateSchedulePath:
    def test_understaffing_with_date_schedule(self):
        """날짜 단위 가용 학생도 weekly 경로와 동일하게 부족 슬롯이 리포트된다."""
        student = date_student(
            "d1",
            {
                MONDAY: [(OPEN_START, OPEN_END)],
                MONDAY + timedelta(days=1): [(OPEN_START, OPEN_END)],
            },
        )
        result, ctx = solve(make_policy(), [student])

        assert result.status == "OPTIMAL"
        assert len(result.shortages) == 12  # 수·목·금 4슬롯 × 3일
        assert count_of(result, "d1") == 8

    def test_fair_hours_with_date_schedule(self):
        """편중 방지도 date_schedule 경로에서 동일하게 동작한다."""
        week = [MONDAY + timedelta(days=i) for i in range(5)]
        heavy = date_student("heavy", {d: [(OPEN_START, OPEN_END)] for d in week})
        b = date_student("b", {week[0]: [(OPEN_START, OPEN_END)]})
        c = date_student("c", {week[1]: [(OPEN_START, OPEN_END)]})
        result, ctx = solve(make_policy(), [heavy, b, c])

        assert result.status == "OPTIMAL"
        assert count_of(result, "heavy") == 14  # 주간 상한에서 정지
        assert count_of(result, "b") == 4
        assert count_of(result, "c") == 4


# ---------------------------------------------------------------------------
# 6. 시간 제한 조기 종료 — UNKNOWN ≠ INFEASIBLE
# ---------------------------------------------------------------------------


class TestTimeLimitStatus:
    def test_unknown_status_is_distinct_from_infeasible(self):
        """시간 부족으로 해를 못 찾으면 UNKNOWN — '해 없음(INFEASIBLE)'과 다르다.

        호출부가 status를 구분하지 않으면 담당자에게 '배정 불가능한 조건'이라는
        잘못된 안내가 나갈 수 있다 (#84 status 기록과 연계).
        """
        policy = load_department_policy("library_info_service")
        calendar = load_academic_calendar(2026)
        students, start, num_days = load_sample_students()
        solver = ScheduleSolver(policy, calendar, students, start, num_days)
        result, ctx = solver.solve(time_limit_seconds=0.001)

        assert result.status == "UNKNOWN"
        assert result.status != "INFEASIBLE"
        assert not result.is_feasible
        assert result.assignments == {}
        assert result.objective_value is None


# ---------------------------------------------------------------------------
# 7. 빈 입력 견고성
# ---------------------------------------------------------------------------


class TestDegenerateInputs:
    def test_no_students_reports_every_slot_short(self):
        """학생 0명: 크래시 없이 전 슬롯이 부족 리포트로 남는다."""
        result, ctx = solve(make_policy(), [])

        assert result.status == "OPTIMAL"
        assert result.assignments == {}
        assert len(result.shortages) == 20  # 평일 5일 × 4슬롯
        assert all(s.assigned == 0 for s in result.shortages)

    def test_no_students_without_relaxation_is_infeasible(self):
        result, ctx = solve(make_policy(allow_understaffing=False), [])

        assert result.status == "INFEASIBLE"

    def test_all_days_closed_solves_to_empty_schedule(self):
        """전 기간 폐관(개관 슬롯 0개): 빈 시간표로 정상 종료, 부족도 없음."""
        closed = make_calendar(closures={MONDAY + timedelta(days=i) for i in range(7)})
        result, ctx = solve(make_policy(), [make_student("s1", ALL_OPEN)], calendar=closed)

        assert result.is_feasible
        assert result.assignments == {}
        assert result.shortages == []


# ---------------------------------------------------------------------------
# 8. 아침 근무 불가 — Soft 모듈 안의 Hard 인코딩
# ---------------------------------------------------------------------------


class TestMorningForbidden:
    def test_morning_zero_is_hard_even_under_staffing_pressure(self):
        """max_morning_days_per_week=0이면 최소 인원 압력에도 아침 배정 금지.

        아침(08-09시) 슬롯은 이 학생뿐이어도 배정 대신 부족으로 리포트돼야 한다.
        """
        policy = make_policy(open_start=8 * 60, morning_end=9 * 60)
        student = make_student(
            "s1",
            {d: [(8 * 60, OPEN_END)] for d in WEEKDAYS},
            preferences=StudentPreferences(max_morning_days_per_week=0),
        )
        result, ctx = solve(policy, [student])

        assert result.status == "OPTIMAL"
        morning_assigned = [
            (day, minute) for (_, day, minute) in assigned_pairs(result) if minute < 9 * 60
        ]
        assert morning_assigned == []
        # 평일 아침 5슬롯은 전부 부족으로 리포트
        shortage_slots = {(s.day, s.slot_min) for s in result.shortages}
        assert shortage_slots >= {
            (MONDAY + timedelta(days=i), 8 * 60) for i in range(5)
        }


# ---------------------------------------------------------------------------
# 9. 국가근로 특수 규칙
# ---------------------------------------------------------------------------


class TestGukgaRules:
    def test_school_only_holiday_blocks_gukga_but_not_gyobi(self):
        """교내 휴강일: 국가근로는 그날 근로 불가, 교비는 근무 가능."""
        tuesday = MONDAY + timedelta(days=1)
        calendar = make_calendar(school_only_holidays={tuesday})
        both_days = {
            Weekday.MON: [(OPEN_START, OPEN_END)],
            Weekday.TUE: [(OPEN_START, OPEN_END)],
        }
        gukga = make_student("g", both_days, funding=FundingType.GUKGA)
        gyobi = make_student("k", both_days)
        result, ctx = solve(make_policy(), [gukga, gyobi], num_days=2, calendar=calendar)

        assert result.is_feasible
        assert tuesday not in result.slots_of_student("g")  # 국가는 휴강일 배정 0
        assert len(result.slots_of_student("k").get(tuesday, [])) == 4  # 교비가 채움
        assert result.shortages == []

    def test_mixed_week_applies_conservative_gukga_cap(self):
        """학기·방학이 섞인 주는 더 낮은 상한(min)을 주 전체에 적용한다.

        월-수 학기(상한 3시간)·목-금 방학(상한 40시간) → 주 전체 3슬롯까지만.
        """
        calendar = make_calendar(
            semesters=[DateRange(MONDAY, MONDAY + timedelta(days=2))]
        )
        policy = make_policy(
            gukga_weekly_max_hours={PeriodType.SEMESTER: 3, PeriodType.VACATION: 40}
        )
        student = make_student("g", ALL_OPEN, funding=FundingType.GUKGA)
        result, ctx = solve(policy, [student], calendar=calendar)

        assert result.status == "OPTIMAL"
        # understaffing 페널티(1000)가 상한까지 최대 배정을 강제 → 정확히 3슬롯
        assert count_of(result, "g") == 3
        assert len(result.shortages) == 17  # 20슬롯 중 나머지
