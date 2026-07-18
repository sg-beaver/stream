"""학사 캘린더와 날짜별 개관 시간 결정.

학기/방학 구간, 공휴일, 교내 휴강일(부활절 등), 폐관일, 시험 기간은
config/academic_calendar_*.json 에서 로드한다. 공휴일 정보는 매년 변동이
있으므로, 추후 한국천문연구원 특일 정보 OpenAPI 연동으로 갱신하는 것을
전제로 한다 (config 파일이 그 캐시 역할).
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from .enums import PeriodType, Weekday
from .policy import DepartmentPolicy


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date  # inclusive

    def __contains__(self, day: date) -> bool:
        return self.start <= day <= self.end


@dataclass
class AcademicCalendar:
    """학사 일정 데이터."""

    semesters: list[DateRange]
    exam_periods: list[DateRange]
    public_holidays: set[date]  # 법정 공휴일 (선거일, 대체공휴일 포함)
    school_only_holidays: set[date]  # 우리 학교만 휴강 (부활절 등)
    closures: set[date]  # 도서관 폐관일 (하계 집중 휴무 등)
    _exam_weekends: set[date] = field(default_factory=set, init=False)

    def __post_init__(self) -> None:
        self._exam_weekends = {
            day for period in self.exam_periods for day in _extended_weekend(period.start)
        }

    def period_type(self, day: date) -> PeriodType:
        if any(day in s for s in self.semesters):
            return PeriodType.SEMESTER
        return PeriodType.VACATION

    def is_public_holiday(self, day: date) -> bool:
        return day in self.public_holidays

    def is_school_only_holiday(self, day: date) -> bool:
        return day in self.school_only_holidays

    def is_closed(self, day: date) -> bool:
        return day in self.closures

    def is_exam_period(self, day: date) -> bool:
        return any(day in p for p in self.exam_periods)

    def is_exam_extended_weekend(self, day: date) -> bool:
        return day in self._exam_weekends

    def classes_run(self, day: date) -> bool:
        """해당 날짜에 수업이 정상 진행되는지 (수업 시간 근로 차단 여부 판단용)."""
        return not (self.is_public_holiday(day) or self.is_school_only_holiday(day))

    @classmethod
    def from_dict(cls, raw: dict) -> "AcademicCalendar":
        return cls(
            semesters=[_parse_range(r) for r in raw["semesters"]],
            exam_periods=[_parse_range(r) for r in raw["exam_periods"]],
            public_holidays={date.fromisoformat(d) for d in raw["public_holidays"]},
            school_only_holidays={
                date.fromisoformat(d) for d in raw["school_only_holidays"]
            },
            closures={date.fromisoformat(d) for d in raw["closures"]},
        )


def _extended_weekend(exam_start: date) -> tuple[date, date]:
    """시험 기간 개관 연장 대상 주말 계산.

    - 시험이 월/화요일에 시작: 시험 직전 주말 연장
    - 시험이 수/목/금요일에 시작: 시험 기간 사이에 낀 주말(시작 후 첫 주말) 연장
    """
    weekday = Weekday(exam_start.weekday())
    if weekday in (Weekday.MON, Weekday.TUE):
        # 직전 일요일과 그 전날 토요일
        sunday = exam_start - timedelta(days=weekday.value + 1)
    else:
        # 시작일 이후 첫 토요일의 다음 날
        sunday = exam_start + timedelta(days=(Weekday.SUN.value - weekday.value))
    return (sunday - timedelta(days=1), sunday)


def _parse_range(raw: dict) -> DateRange:
    return DateRange(date.fromisoformat(raw["start"]), date.fromisoformat(raw["end"]))


class OpeningHoursResolver:
    """부서 정책 + 학사 캘린더로 날짜별 개관 시간을 결정."""

    def __init__(self, policy: DepartmentPolicy, calendar: AcademicCalendar):
        self._policy = policy
        self._calendar = calendar

    def resolve(self, day: date) -> tuple[int, int] | None:
        """(개관 분, 폐관 분) 또는 None(폐관)."""
        cal, policy = self._calendar, self._policy
        if cal.is_closed(day):
            return None

        period = cal.period_type(day)
        if cal.is_public_holiday(day):
            if period == PeriodType.VACATION:
                return None  # 방학 중 공휴일 폐관
            return policy.semester_public_holiday_hours  # 학기 중 공휴일 단축 개관

        if period == PeriodType.SEMESTER and cal.is_exam_extended_weekend(day):
            return policy.exam_weekend_hours

        return policy.default_open_range(period, day)
