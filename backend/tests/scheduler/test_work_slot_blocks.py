"""부서 정의 근무 슬롯(블록) all-or-none 테스트 (#89).

솔버는 30분 그리드를 유지하고, 직원 정의 슬롯을 연속 30분 슬롯 묶음(블록)으로
취급해 (학생, 날짜, 블록)마다 전부 배정 or 전부 비움 Hard 제약을 건다.

1. 기본 all-or-none: 블록별 배정 슬롯 수는 0 또는 블록 길이
2. 수업 부분 겹침: 블록 안 한 슬롯이라도 수업이면 그 학생은 블록 전체 배정 불가
3. 특별일 클리핑: 공휴일 단축 개관 구간과의 교집합으로 블록이 잘리거나 소멸
4. 시험 주말 연장: 블록 밖 연장 개관 슬롯은 자유 그리드로 배정 가능
5. opt-in 회귀: work_slots 미정의면 기존 배정과 완전히 동일
6. 점심 휴관 다구간 + 블록: 휴관을 사이에 둔 블록 병합 없음 (감사 관찰 ① 회귀)
7. 블록 탓 커버 불가 슬롯은 INFEASIBLE이 아니라 shortage로 보고
8. validate_work_slots_tiling·resolve_work_blocks 단위 검증
9. 블록별 배정 인원(#171): 설정한 블록만 부서 기본값을 덮어쓴다

시나리오 정밀 제어를 위해 config JSON 대신 코드로 최소 정책·캘린더를 구성한다.
슬롯은 프로덕션과 같은 30분 단위다.
"""

from datetime import date

from app.scheduler.domain import (
    AcademicCalendar,
    DepartmentPolicy,
    FundingType,
    OpeningHoursResolver,
    PeriodType,
    ScheduleResult,
    Student,
    StudentPreferences,
    Weekday,
    WeeklyTimeMap,
    WorkSlotBlock,
    validate_work_slots_tiling,
)
from app.scheduler.domain.calendar import DateRange
from app.scheduler.domain.policy import HourLimitPolicy, StaffingPolicy
from app.scheduler.engine.solver import ScheduleSolver

# 2026-08-03(월)부터. 캘린더에 학기 구간이 없으면 전 기간 방학으로 판정된다.
MONDAY = date(2026, 8, 3)
WEEKDAYS = [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI]
OPEN_START, OPEN_END = 9 * 60, 13 * 60  # 09:00-13:00, 30분 슬롯 8개

# 09:00-13:00을 정확히 타일링하는 블록 3개 (1.5h + 1.5h + 1h)
BLOCKS = [(540, 630), (630, 720), (720, 780)]


def spans(blocks: list[WorkSlotBlock]) -> list[tuple[int, int]]:
    """시간 경계만 비교할 때 쓰는 축약 — 블록별 인원(#171)은 따로 검사한다."""
    return [(b.start_min, b.end_min) for b in blocks]


def tiling(opening, blocks, slot_minutes: int = 30) -> str | None:
    """(시작, 종료) 튜플로 쓴 블록을 WorkSlotBlock으로 바꿔 타일링 검증에 넘긴다."""
    return validate_work_slots_tiling(
        opening, [WorkSlotBlock(*b) for b in blocks], slot_minutes
    )


def make_calendar(
    *,
    semesters: list[DateRange] | None = None,
    exam_periods: list[DateRange] | None = None,
    public_holidays: set[date] | None = None,
) -> AcademicCalendar:
    return AcademicCalendar(
        semesters=semesters or [],
        exam_periods=exam_periods or [],
        public_holidays=public_holidays or set(),
        school_only_holidays=set(),
        closures=set(),
    )


def make_policy(
    *,
    opening: dict[Weekday, list[tuple[int, int]]] | None = None,
    # 블록은 (시작, 종료) 또는 (시작, 종료, 최소 인원, 최대 인원) — 뒤 두 값은 #171
    work_slots: dict[Weekday, list[tuple[int, ...]]] | None = None,
    min_per_slot: int = 1,
    max_per_slot: int = 2,
    holiday_hours: tuple[int, int] = (OPEN_START, OPEN_END),
    exam_weekend_hours: tuple[int, int] = (OPEN_START, OPEN_END),
) -> DepartmentPolicy:
    """양 기간(학기·방학)에 같은 opening·work_slots를 쓰는 최소 정책."""
    opening = opening if opening is not None else {d: [(OPEN_START, OPEN_END)] for d in WEEKDAYS}
    slots = {
        day: [WorkSlotBlock(*block) for block in blocks]
        for day, blocks in (work_slots or {}).items()
    }
    return DepartmentPolicy(
        department_id="test_dept",
        department_name="테스트부서",
        slot_minutes=30,
        staffing=StaffingPolicy(
            min_per_slot=min_per_slot,
            max_per_slot=max_per_slot,
            allow_understaffing_with_penalty=True,
        ),
        hour_limits=HourLimitPolicy(
            gyobi_weekly_max_hours=14,
            gukga_weekly_max_hours={PeriodType.SEMESTER: 20, PeriodType.VACATION: 40},
            gukga_monthly_max_hours=46,
            gyobi_biweekly_dept_total_max_hours=190,
        ),
        opening_hours={
            PeriodType.SEMESTER: dict(opening),
            PeriodType.VACATION: dict(opening),
        },
        semester_public_holiday_hours=holiday_hours,
        exam_weekend_hours=exam_weekend_hours,
        preferred_staffing_bands=[],
        meal_windows=[],
        vacation_long_shift_meal_hours=6,
        morning_end_min=0,
        exam_buffer_minutes=180,
        soft_weights={
            "understaffing": 1000,
            "preferred_slot_miss": 3,
            "block_start": 4,
            "fair_hours_shortfall": 6,
        },
        work_slots={
            PeriodType.SEMESTER: dict(slots),
            PeriodType.VACATION: dict(slots),
        },
    )


def make_student(
    sid: str,
    available: dict[Weekday, list[tuple[int, int]]],
    class_times: dict[Weekday, list[tuple[int, int]]] | None = None,
) -> Student:
    return Student(
        student_id=sid,
        name=sid,
        funding_type=FundingType.GYOBI,
        available=WeeklyTimeMap(ranges=dict(available)),
        preferred=WeeklyTimeMap(ranges=dict(available)),
        class_times=WeeklyTimeMap(ranges=dict(class_times or {})),
        preferences=StudentPreferences(),
    )


def solve(
    policy: DepartmentPolicy,
    students: list[Student],
    num_days: int = 5,
    calendar: AcademicCalendar | None = None,
    start_date: date = MONDAY,
):
    solver = ScheduleSolver(
        policy, calendar or make_calendar(), students, start_date, num_days
    )
    return solver.solve()


def assigned_pairs(result: ScheduleResult) -> set[tuple[str, date, int]]:
    return {
        (sid, day, minute)
        for day, by_slot in result.assignments.items()
        for minute, sids in by_slot.items()
        for sid in sids
    }


def block_fill(pairs, sid: str, day: date, start: int, end: int) -> int:
    """블록 안에서 실제 배정된 30분 슬롯 수."""
    return sum(1 for m in range(start, end, 30) if (sid, day, m) in pairs)


ALL_OPEN = {d: [(OPEN_START, OPEN_END)] for d in WEEKDAYS}
ALL_BLOCKS = {d: list(BLOCKS) for d in WEEKDAYS}


def assert_all_or_none(result: ScheduleResult, students, days, blocks=BLOCKS):
    pairs = assigned_pairs(result)
    for student in students:
        for day in days:
            for start, end in blocks:
                fill = block_fill(pairs, student.student_id, day, start, end)
                assert fill in (0, (end - start) // 30), (
                    f"{student.student_id} {day} 블록 {start}~{end}가 부분 배정됨: {fill}"
                )


# ---------------------------------------------------------------------------
# 1. 기본 all-or-none
# ---------------------------------------------------------------------------


class TestAllOrNone:
    def test_blocks_fully_assigned_or_empty(self):
        """블록별 배정 슬롯 수는 0 또는 블록 길이 — 부분 배정 없음."""
        policy = make_policy(work_slots=ALL_BLOCKS)
        students = [
            make_student("A", dict(ALL_OPEN)),
            make_student("B", dict(ALL_OPEN)),
        ]
        result, _ = solve(policy, students)
        assert result.is_feasible
        days = [date(2026, 8, 3 + i) for i in range(5)]
        assert_all_or_none(result, students, days)

    def test_free_grid_without_work_slots_is_identical(self):
        """opt-in 회귀: work_slots 미정의면 제약이 아무것도 추가하지 않는다."""
        students = [make_student("A", dict(ALL_OPEN)), make_student("B", dict(ALL_OPEN))]
        result_plain, _ = solve(make_policy(), students)
        result_empty, _ = solve(make_policy(work_slots={}), students)
        assert assigned_pairs(result_plain) == assigned_pairs(result_empty)
        assert result_plain.objective_value == result_empty.objective_value

    def test_blocks_only_on_defined_weekday(self):
        """월요일만 블록 정의: 화요일은 자유 그리드라 부분 배정이 허용된다."""
        policy = make_policy(work_slots={Weekday.MON: list(BLOCKS)})
        # 화요일에 한 슬롯(09:00-09:30)만 가능한 학생 — 자유 그리드면 30분 배정 가능
        students = [
            make_student("A", dict(ALL_OPEN)),
            make_student("B", {Weekday.TUE: [(540, 570)]}),
        ]
        result, _ = solve(policy, students)
        assert result.is_feasible
        pairs = assigned_pairs(result)
        assert_all_or_none(result, students, [MONDAY])
        tuesday = date(2026, 8, 4)
        assert ("B", tuesday, 540) in pairs  # 자유 그리드 부분 배정


# ---------------------------------------------------------------------------
# 2. 수업 부분 겹침 → 블록 전체 배정 불가
# ---------------------------------------------------------------------------


class TestPartialOverlap:
    def test_class_overlap_excludes_whole_block(self):
        """블록 안 한 슬롯이라도 수업이면 그 학생은 블록 전체 배정 불가 (의도된 정책)."""
        policy = make_policy(work_slots=ALL_BLOCKS, min_per_slot=1, max_per_slot=1)
        # A는 매일 10:00-10:30 수업 → 09:00-10:30 블록 전체 배정 불가
        student_a = make_student(
            "A", dict(ALL_OPEN), class_times={d: [(600, 630)] for d in WEEKDAYS}
        )
        student_b = make_student("B", dict(ALL_OPEN))
        result, _ = solve(policy, [student_a, student_b])
        assert result.is_feasible
        pairs = assigned_pairs(result)
        days = [date(2026, 8, 3 + i) for i in range(5)]
        for day in days:
            assert block_fill(pairs, "A", day, 540, 630) == 0
            # 커버는 B가 한다 (B는 제약이 없으므로 min_per_slot=1 충족)
            assert block_fill(pairs, "B", day, 540, 630) == 3
        assert_all_or_none(result, [student_a, student_b], days)


# ---------------------------------------------------------------------------
# 3·4. 특별일 클리핑
# ---------------------------------------------------------------------------

# 학기(2026-08-01~31) 안에서 진행되는 한 주
SEMESTER = [DateRange(date(2026, 8, 1), date(2026, 8, 31))]


class TestSpecialDayClipping:
    def test_holiday_clips_blocks_to_shortened_hours(self):
        """공휴일 단축 개관(10-12): 밖 블록 소멸, 경계 걸친 블록은 잘려 생존."""
        holiday = date(2026, 8, 5)  # 수요일
        calendar = make_calendar(semesters=SEMESTER, public_holidays={holiday})
        policy = make_policy(work_slots=ALL_BLOCKS, holiday_hours=(600, 720))
        resolver = OpeningHoursResolver(policy, calendar)
        # (540,630)∩(600,720)=(600,630) / (630,720) 그대로 / (720,780)은 소멸
        assert spans(resolver.resolve_work_blocks(holiday)) == [(600, 630), (630, 720)]
        # 평일은 클리핑 없음
        assert spans(resolver.resolve_work_blocks(date(2026, 8, 4))) == BLOCKS

    def test_exam_weekend_uncovered_slots_are_free_grid(self):
        """시험 주말 연장 개관: 블록 밖 연장 슬롯은 자유 그리드로 배정 가능."""
        # 시험이 수요일(8/12) 시작 → 다음 주말(8/15 토)이 연장 대상
        saturday = date(2026, 8, 15)
        calendar = make_calendar(
            semesters=SEMESTER,
            exam_periods=[DateRange(date(2026, 8, 12), date(2026, 8, 14))],
        )
        opening = {**ALL_OPEN, Weekday.SAT: [(540, 780)]}
        work_slots = {**ALL_BLOCKS, Weekday.SAT: list(BLOCKS)}
        policy = make_policy(
            opening=opening, work_slots=work_slots, exam_weekend_hours=(480, 840)
        )
        resolver = OpeningHoursResolver(policy, calendar)
        # 블록은 연장 개관(08-14)과의 교집합 = 원래 블록 그대로
        assert spans(resolver.resolve_work_blocks(saturday)) == BLOCKS

        # 블록 밖 연장 슬롯(08:00-09:00, 13:00-14:00)은 자유 그리드로 배정된다
        student = make_student("A", {Weekday.SAT: [(480, 840)]})
        result, _ = solve(
            policy, [student], num_days=1, calendar=calendar, start_date=saturday
        )
        assert result.is_feasible
        pairs = assigned_pairs(result)
        assert ("A", saturday, 480) in pairs  # 블록 밖 자유 슬롯
        assert_all_or_none(result, [student], [saturday])


# ---------------------------------------------------------------------------
# 6. 점심 휴관 다구간 (감사 관찰 ① 회귀)
# ---------------------------------------------------------------------------


class TestMultiIntervalDay:
    LUNCH_OPEN = {d: [(540, 720), (780, 900)] for d in WEEKDAYS}  # 09-12, 13-15
    LUNCH_BLOCKS = {d: [(540, 630), (630, 720), (780, 900)] for d in WEEKDAYS}

    def test_blocks_do_not_merge_across_closure(self):
        """휴관(12-13)을 사이에 둔 블록들이 개별 블록으로 유지된다."""
        policy = make_policy(
            opening=self.LUNCH_OPEN, work_slots=self.LUNCH_BLOCKS
        )
        resolver = OpeningHoursResolver(policy, make_calendar())
        assert spans(resolver.resolve_work_blocks(MONDAY)) == [
            (540, 630),
            (630, 720),
            (780, 900),
        ]

        students = [make_student("A", dict(self.LUNCH_OPEN))]
        result, _ = solve(policy, students, num_days=1)
        assert result.is_feasible
        assert_all_or_none(
            result, students, [MONDAY], blocks=[(540, 630), (630, 720), (780, 900)]
        )


# ---------------------------------------------------------------------------
# 7. 블록 탓 커버 불가 슬롯 → shortage
# ---------------------------------------------------------------------------


class TestShortage:
    def test_uncoverable_block_reports_shortage_not_infeasible(self):
        """유일한 학생이 블록 일부에 수업 → 블록 전체가 미충원으로 보고된다."""
        policy = make_policy(work_slots=ALL_BLOCKS, min_per_slot=1, max_per_slot=1)
        student = make_student(
            "A", dict(ALL_OPEN), class_times={d: [(600, 630)] for d in WEEKDAYS}
        )
        result, _ = solve(policy, [student], num_days=1)
        assert result.is_feasible  # INFEASIBLE이 아니라 shortage로 처리
        short_slots = {s.slot_min for s in result.shortages if s.day == MONDAY}
        # 09:00-10:30 블록 전체(540·570)와 수업 슬롯(600)이 미충원
        assert {540, 570, 600} <= short_slots


# ---------------------------------------------------------------------------
# 8. 단위 검증
# ---------------------------------------------------------------------------


class TestValidateTiling:
    OPENING = [(540, 780)]

    def test_exact_tiling_passes(self):
        assert tiling(self.OPENING, BLOCKS, 30) is None

    def test_multi_interval_tiling_passes(self):
        opening = [(540, 720), (780, 900)]
        blocks = [(540, 630), (630, 720), (780, 900)]
        assert tiling(opening, blocks, 30) is None

    def test_gap_rejected(self):
        error = tiling(self.OPENING, [(540, 630), (720, 780)], 30)
        assert error is not None and "비어" in error

    def test_overlap_rejected(self):
        error = tiling(self.OPENING, [(540, 660), (630, 780)], 30)
        assert error is not None and "겹칩" in error

    def test_block_outside_opening_rejected(self):
        error = tiling(
            self.OPENING, [(540, 630), (630, 720), (720, 810)], 30
        )
        assert error is not None and "벗어" in error

    def test_non_slot_boundary_rejected(self):
        error = tiling(self.OPENING, [(540, 555), (555, 780)], 30)
        assert error is not None and "30분" in error

    def test_reversed_block_rejected(self):
        error = tiling(self.OPENING, [(630, 630)], 30)
        assert error is not None and "늦습니다" in error

    def test_closed_day_with_blocks_rejected(self):
        error = tiling([], [(540, 630)], 30)
        assert error is not None and "폐관" in error

    def test_closed_day_without_blocks_passes(self):
        assert tiling([], [], 30) is None

    def test_block_crossing_closure_rejected(self):
        """휴관 위를 가로지르는 블록은 타일링 위반이다."""
        opening = [(540, 720), (780, 900)]
        blocks = [(540, 720), (720, 900)]  # 두 번째 블록이 휴관(720-780)을 덮음
        error = tiling(opening, blocks, 30)
        assert error is not None


# ---------------------------------------------------------------------------
# 9. 블록별 배정 인원 (#171)
# ---------------------------------------------------------------------------


class TestPerBlockStaffing:
    """블록에 인원을 걸면 그 블록만 부서 기본값 대신 그 값으로 배정된다.

    수업 시간대마다 필요한 조교 수가 다른 부서(학과 출석체크 등)가 쓰는 설정이다.
    """

    # 09:00-10:30만 2명 고정, 나머지 두 블록은 부서 기본값
    STAFFED = {d: [(540, 630, 2, 2), (630, 720), (720, 780)] for d in WEEKDAYS}
    # 10:30-12:00만 최대 1명으로 조여 부서 최대 인원보다 낮게
    CAPPED = {d: [(540, 630), (630, 720, None, 1), (720, 780)] for d in WEEKDAYS}

    def test_block_minimum_overrides_department_default(self):
        """부서 기본 1명인데 첫 블록만 2명 — 블록 경계에서 인원이 갈린다."""
        policy = make_policy(work_slots=self.STAFFED, min_per_slot=1, max_per_slot=1)
        students = [make_student(sid, dict(ALL_OPEN)) for sid in ("A", "B", "C")]
        result, _ = solve(policy, students, num_days=1)

        assert result.is_feasible
        assert not result.shortages
        assert len(result.assignments[MONDAY][540]) == 2  # 09:00 — 블록 설정
        assert len(result.assignments[MONDAY][600]) == 2  # 10:00 — 같은 블록
        assert len(result.assignments[MONDAY][630]) == 1  # 10:30 — 부서 기본값
        assert len(result.assignments[MONDAY][720]) == 1  # 12:00 — 부서 기본값
        assert_all_or_none(result, students, [MONDAY])

    def test_block_maximum_caps_below_department_default(self):
        """부서 최대 3명이어도 최대 1명으로 조인 블록은 1명을 넘지 않는다."""
        policy = make_policy(work_slots=self.CAPPED, min_per_slot=1, max_per_slot=3)
        students = [make_student(sid, dict(ALL_OPEN)) for sid in ("A", "B", "C")]
        result, _ = solve(policy, students, num_days=1)

        assert result.is_feasible
        assert len(result.assignments[MONDAY][630]) == 1
        assert len(result.assignments[MONDAY][660]) == 1

    def test_shortage_reports_block_minimum(self):
        """미충원 보고의 기준 인원도 블록 값이다 (부서 기본값이 아니라)."""
        policy = make_policy(work_slots=self.STAFFED, min_per_slot=1, max_per_slot=2)
        student = make_student("A", {Weekday.MON: [(540, 630)]})
        result, _ = solve(policy, [student], num_days=1)

        assert result.is_feasible  # INFEASIBLE이 아니라 shortage로 처리
        by_slot = {s.slot_min: s for s in result.shortages if s.day == MONDAY}
        assert (by_slot[540].required, by_slot[540].assigned) == (2, 1)
        assert by_slot[630].required == 1  # 인원을 안 정한 블록은 부서 기본값

    def test_free_grid_day_keeps_department_default(self):
        """블록을 정의하지 않은 요일은 블록 인원과 무관하게 부서 기본값을 쓴다."""
        work_slots = {Weekday.MON: [(540, 630, 2, 2), (630, 720), (720, 780)]}
        policy = make_policy(work_slots=work_slots, min_per_slot=1, max_per_slot=1)
        students = [make_student(sid, dict(ALL_OPEN)) for sid in ("A", "B", "C")]
        result, _ = solve(policy, students, num_days=2)

        assert result.is_feasible
        assert len(result.assignments[MONDAY][540]) == 2
        # 화요일은 블록 미정의 — 자유 그리드에 부서 기본값(최대 1명)만 걸린다
        tuesday = date(2026, 8, 4)
        assert len(result.assignments[tuesday][540]) == 1
