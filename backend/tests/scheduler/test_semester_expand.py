"""학기 고정 시간표 — 주간 패턴 서버 전개 단위 테스트.

expand_weekly_pattern: 대표 기간 배정을 repeat_until까지 주 단위 복제하되,
복제된 날짜의 실제 개관 시간(공휴일 단축·폐관·시험 연장)과 교집합을 취한다.
semester_containing: 학기 종료일 기본값용 조회.
_tighten_for_semester_pattern: 국가 주간 상한 9시간 조임 (월 46h 구조 보장).
"""

from datetime import date

from app.scheduler.domain import AcademicCalendar, OpeningHoursResolver, PeriodType, Weekday
from app.scheduler.domain.calendar import DateRange
from app.scheduler.domain.policy import DepartmentPolicy, HourLimitPolicy, StaffingPolicy
from app.scheduler.service import _tighten_for_semester_pattern, expand_weekly_pattern

WEEKDAYS = [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI]
OPEN = (9 * 60, 17 * 60)  # 평일 09:00-17:00

# 2026-09-01~12-21 학기, 공휴일 금 10/9, 폐관 9/24(목)
SEMESTER = DateRange(date(2026, 9, 1), date(2026, 12, 21))
MONDAY = date(2026, 9, 7)


def make_policy(holiday_hours=(10 * 60, 12 * 60)) -> DepartmentPolicy:
    return DepartmentPolicy(
        department_id="test",
        department_name="테스트",
        slot_minutes=30,
        staffing=StaffingPolicy(1, 2, True),
        hour_limits=HourLimitPolicy(
            gyobi_weekly_max_hours=14,
            gukga_weekly_max_hours={PeriodType.SEMESTER: 20, PeriodType.VACATION: 40},
            gukga_monthly_max_hours=46,
            gyobi_biweekly_dept_total_max_hours=190,
        ),
        opening_hours={
            PeriodType.SEMESTER: {d: [OPEN] for d in WEEKDAYS},
            PeriodType.VACATION: {d: [OPEN] for d in WEEKDAYS},
        },
        semester_public_holiday_hours=holiday_hours,
        exam_weekend_hours=(8 * 60, 22 * 60),
        preferred_staffing_bands=[],
        meal_windows=[],
        vacation_long_shift_meal_hours=6,
        morning_end_min=0,
        exam_buffer_minutes=180,
        soft_weights={},
    )


def make_resolver(
    *, public_holidays: set | None = None, closures: set | None = None,
    exam_periods: list | None = None, holiday_hours=(10 * 60, 12 * 60),
) -> OpeningHoursResolver:
    calendar = AcademicCalendar(
        semesters=[SEMESTER],
        exam_periods=exam_periods or [],
        public_holidays=public_holidays or set(),
        school_only_holidays=set(),
        closures=closures or set(),
    )
    return OpeningHoursResolver(make_policy(holiday_hours), calendar)


class TestExpandWeeklyPattern:
    def test_stride_preserves_weekday_and_stops_at_repeat_until(self):
        """2주 기간 → stride 14, 요일 보존, repeat_until 초과 복제 없음."""
        items = [
            ("A", MONDAY, 540, 720),                # 월 09-12
            ("B", date(2026, 9, 15), 600, 780),     # 둘째 주 화 10-13
        ]
        expanded, adjusted = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 20), date(2026, 10, 18), make_resolver()
        )
        dates_a = sorted(d for sid, d, *_ in expanded if sid == "A")
        dates_b = sorted(d for sid, d, *_ in expanded if sid == "B")
        # 오프셋 0·14·28 — +42(10/19)는 repeat_until(10/18) 초과
        assert dates_a == [MONDAY, date(2026, 9, 21), date(2026, 10, 5)]
        assert dates_b == [date(2026, 9, 15), date(2026, 9, 29), date(2026, 10, 13)]
        assert all(d.weekday() == 0 for d in dates_a)
        assert adjusted == []

    def test_one_week_period_uses_stride_seven(self):
        """8일 기간도 7의 배수(14일)로 올림해 요일이 밀리지 않는다."""
        items = [("A", MONDAY, 540, 720)]
        expanded, _ = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 14), date(2026, 10, 5), make_resolver()
        )
        assert sorted(d for _, d, *_ in expanded) == [MONDAY, date(2026, 9, 21), date(2026, 10, 5)]

    def test_closure_drops_rows_with_reason(self):
        """폐관일에 떨어진 복제 행은 제거되고 '폐관 제외'로 보고된다."""
        closure = date(2026, 9, 21)  # 복제 첫 오프셋의 월요일
        items = [("A", MONDAY, 540, 720)]
        expanded, adjusted = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 20), date(2026, 9, 28),
            make_resolver(closures={closure}),
        )
        assert all(d != closure for _, d, *_ in expanded)
        assert adjusted == [{"date": closure, "reason": "폐관 제외"}]

    def test_holiday_clips_to_shortened_hours(self):
        """공휴일 단축(10-12)에 걸친 배정은 잘리고 '조정'으로 보고된다."""
        holiday = date(2026, 9, 21)
        items = [("A", MONDAY, 540, 660)]  # 09:00-11:00 → 공휴일엔 10:00-11:00
        expanded, adjusted = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 20), date(2026, 9, 22),
            make_resolver(public_holidays={holiday}),
        )
        holiday_rows = [(s, e) for _, d, s, e in expanded if d == holiday]
        assert holiday_rows == [(600, 660)]
        assert adjusted == [{"date": holiday, "reason": "개관 시간에 맞춰 조정"}]

    def test_holiday_fully_outside_removes_row(self):
        """단축 개관과 전혀 겹치지 않는 배정은 그 날짜에서 사라진다."""
        holiday = date(2026, 9, 21)
        items = [("A", MONDAY, 540, 600)]  # 09:00-10:00 — 단축(10-12) 밖
        expanded, adjusted = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 20), date(2026, 9, 22),
            make_resolver(public_holidays={holiday}),
        )
        assert all(d != holiday for _, d, *_ in expanded)
        assert adjusted == [{"date": holiday, "reason": "개관 시간에 맞춰 조정"}]

    def test_exam_extended_weekend_unchanged(self):
        """시험 연장(08-22)은 개관이 넓어질 뿐이라 평일 복제엔 조정이 없다."""
        # 시험이 수요일(10/7) 시작 → 다음 주말(10/10-11) 연장. 평일 배정만 복제.
        items = [("A", MONDAY, 540, 720)]
        expanded, adjusted = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 20), date(2026, 10, 12),
            make_resolver(exam_periods=[DateRange(date(2026, 10, 7), date(2026, 10, 13))]),
        )
        assert adjusted == []
        assert len(expanded) == 3  # 0·14·28 오프셋

    def test_original_period_untouched(self):
        """원본 기간(오프셋 0)은 개관이 좁아도 손대지 않는다 — 솔버가 이미 반영."""
        holiday = date(2026, 9, 14)  # 원본 기간 안의 공휴일
        items = [("A", holiday, 540, 720)]
        expanded, adjusted = expand_weekly_pattern(
            items, MONDAY, date(2026, 9, 20), date(2026, 9, 20),
            make_resolver(public_holidays={holiday}),
        )
        assert expanded == items
        assert adjusted == []


class TestSemesterContaining:
    def test_inside_and_outside(self):
        calendar = AcademicCalendar(
            semesters=[SEMESTER], exam_periods=[], public_holidays=set(),
            school_only_holidays=set(), closures=set(),
        )
        assert calendar.semester_containing(date(2026, 9, 7)) == SEMESTER
        assert calendar.semester_containing(date(2026, 12, 21)) == SEMESTER
        assert calendar.semester_containing(date(2026, 8, 1)) is None


class TestTightenForSemesterPattern:
    def test_gukga_weekly_capped_at_nine_hours(self):
        """국가 주간 상한이 9h로 조여져 월 46h(9×5=45)가 구조적으로 지켜진다."""
        policy = _tighten_for_semester_pattern(make_policy())
        assert policy.hour_limits.gukga_weekly(PeriodType.SEMESTER) == 9
        assert policy.hour_limits.gukga_weekly(PeriodType.VACATION) == 9
        # 교비·월 상한 등 다른 값은 그대로
        assert policy.hour_limits.gyobi_weekly_max_hours == 14
        assert policy.hour_limits.gukga_monthly_max_hours == 46
