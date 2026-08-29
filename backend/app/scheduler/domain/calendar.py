"""학사 캘린더와 날짜별 개관 시간 결정.

학기/방학 구간, 공휴일, 교내 휴강일(부활절 등), 폐관일, 시험 기간은
config/academic_calendar_*.json 에서 로드한다. 공휴일 정보는 매년 변동이
있으므로, 추후 한국천문연구원 특일 정보 OpenAPI 연동으로 갱신하는 것을
전제로 한다 (config 파일이 그 캐시 역할).
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from .enums import PeriodType, Weekday
from .policy import DepartmentPolicy, WorkSlotBlock


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date  # inclusive

    def __contains__(self, day: date) -> bool:
        return self.start <= day <= self.end


@dataclass(frozen=True)
class Term:
    """학기 — 수업 시간표와 근무 가능 시간을 묶는 단위 (#89 후속).

    정규학기는 개강일~학기말시험 종료일(학사일정 그대로), 여름·겨울은 계절수업을
    포함한 방학 전체다. 방학에도 근무가 있어 **1년을 빈틈없이 덮어야** 하므로
    개관 시간을 가르는 semesters(학기/방학)와 달리 사이가 비지 않는다.
    """

    key: str  # "2026-1" | "2026-summer" | "2026-2" | "2026-winter"
    label: str
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
    terms: list[Term] = field(default_factory=list)
    _exam_weekends: set[date] = field(default_factory=set, init=False)

    def __post_init__(self) -> None:
        self._exam_weekends = {
            day for period in self.exam_periods for day in _extended_weekend(period.start)
        }

    def semester_containing(self, day: date) -> DateRange | None:
        """day가 속한 학기 구간. 방학이면 None (학기 고정 시간표의 종료일 기본값용)."""
        for semester in self.semesters:
            if day in semester:
                return semester
        return None

    def term_containing(self, day: date) -> Term | None:
        """day가 속한 학기. 학기 사이 방학이면 None."""
        for term in self.terms:
            if day in term:
                return term
        return None

    def term_for(self, day: date) -> Term | None:
        """그 날짜의 시간표를 붙일 학기. 학기가 1년을 덮으므로 보통 그날의 학기다.

        캘린더 범위 밖(다음 해 등)이면 다가오는 학기, 그마저 없으면 마지막 학기를 쓴다.
        """
        if not self.terms:
            return None
        current = self.term_containing(day)
        if current is not None:
            return current
        upcoming = [t for t in self.terms if t.start > day]
        return min(upcoming, key=lambda t: t.start) if upcoming else max(
            self.terms, key=lambda t: t.end
        )

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
            terms=[
                Term(
                    key=t["key"],
                    label=t["label"],
                    start=date.fromisoformat(t["start"]),
                    end=date.fromisoformat(t["end"]),
                )
                for t in raw.get("terms", [])
            ],
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

    def resolve(self, day: date) -> list[tuple[int, int]]:
        """그 날짜의 개관 구간 목록. 빈 목록이면 폐관.

        평소 개관은 요일별 설정(여러 구간 가능)을 따르지만, 공휴일·휴강일·시험
        연장 주말은 하루 전체를 단일 단축/연장 구간으로 대체한다.
        """
        cal, policy = self._calendar, self._policy
        if cal.is_closed(day):
            return []

        period = cal.period_type(day)
        default = policy.default_open_ranges(period, day)

        if cal.is_public_holiday(day):
            if period == PeriodType.VACATION:
                return []  # 방학 중 공휴일 폐관
            # 학기 중 공휴일 단축 개관 — 원래 폐관 요일(일요일)은 그대로 폐관.
            # 단축 구간이 없는 부서(학과 사무실·행정팀)는 공휴일에 통째로 쉰다 (#172)
            if policy.semester_public_holiday_hours is None:
                return []
            return [policy.semester_public_holiday_hours] if default else []

        if period == PeriodType.SEMESTER and cal.is_school_only_holiday(day):
            # 교내 휴강일(부활절 등) 단축 개관 — 위와 같은 규칙
            if policy.semester_public_holiday_hours is None:
                return []
            return [policy.semester_public_holiday_hours] if default else []

        if (
            period == PeriodType.SEMESTER
            and cal.is_exam_extended_weekend(day)
            and policy.exam_weekend_hours is not None
        ):
            # 연장 구간이 없는 부서는 시험 주말에도 평소 요일 규칙 그대로다 —
            # 주말이 폐관인 부서가 시험 주말에만 열리는 일을 막는다 (#172)
            return [policy.exam_weekend_hours]

        return default

    def resolve_work_blocks(self, day: date) -> list[WorkSlotBlock]:
        """그 날짜의 부서 정의 근무 블록 목록 (#89). 빈 목록이면 자유 그리드.

        블록은 개관 구간과의 교집합으로 클리핑되므로 공휴일 단축·시험 연장
        같은 특별일 규칙(resolve)이 그대로 반영된다. 클리핑 후 블록이 커버하지
        않는 개관 슬롯(예: 시험 주말 연장 구간)은 자유 그리드로 남는다.
        블록별 배정 인원(#171)은 잘려도 그대로 따라간다 — 개관이 단축돼 블록이
        짧아졌다고 그 시간대에 필요한 인원이 달라지지는 않는다.
        """
        blocks = self._policy.work_slots.get(
            self._calendar.period_type(day), {}
        ).get(Weekday(day.weekday()), [])
        if not blocks:
            return []
        open_ranges = self.resolve(day)
        clipped = [
            piece
            for block in blocks
            for open_min, close_min in open_ranges
            if (piece := block.clipped_to(open_min, close_min)) is not None
        ]
        return sorted(clipped, key=lambda b: (b.start_min, b.end_min))
