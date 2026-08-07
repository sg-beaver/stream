"""부서별 스케줄링 정책.

MVP 기준(로욜라도서관 정보서비스팀)을 포함한 모든 수치·시간대 기준은
config/departments/*.json 에서 로드한다. 추후 부서 담당자가 직접 입력하거나
DB 테이블(department_policy)로 이관하는 것을 전제로, 코드에는 기준값을
하드코딩하지 않는다.
"""

from dataclasses import dataclass
from datetime import date

from .enums import PeriodType, Weekday
from .timegrid import str_to_minutes


@dataclass(frozen=True)
class StaffingPolicy:
    """시간대별 배정 인원 정책."""

    min_per_slot: int
    max_per_slot: int
    # True면 최소 인원 미달을 '해 없음' 대신 큰 페널티 + 부족 리포트로 처리
    allow_understaffing_with_penalty: bool


@dataclass(frozen=True)
class HourLimitPolicy:
    """근로 시간 상한 (Hard Constraint)."""

    gyobi_weekly_max_hours: float
    gukga_weekly_max_hours: dict[PeriodType, float]
    gukga_monthly_max_hours: float
    gyobi_biweekly_dept_total_max_hours: float

    def gukga_weekly(self, period: PeriodType) -> float:
        return self.gukga_weekly_max_hours[period]


@dataclass(frozen=True)
class PreferredStaffingBand:
    """특정 기간·요일·시간대의 선호 배정 인원 (Soft Constraint)."""

    period: PeriodType
    weekdays: frozenset[Weekday]
    start_min: int
    end_min: int
    preferred_count: int
    weight: int

    def covers(self, period: PeriodType, weekday: Weekday, minute: int) -> bool:
        return (
            period == self.period
            and weekday in self.weekdays
            and self.start_min <= minute < self.end_min
        )


@dataclass(frozen=True)
class MealWindow:
    """식사 시간 보장 대상 시간대."""

    period: PeriodType
    start_min: int
    end_min: int


@dataclass
class DepartmentPolicy:
    """부서 스케줄링 정책 전체."""

    department_id: str
    department_name: str
    slot_minutes: int
    staffing: StaffingPolicy
    hour_limits: HourLimitPolicy
    # opening_hours[기간][요일] = [(개관 분, 폐관 분), ...] — 빈 목록이면 폐관.
    # 목록인 이유: 점심 휴관처럼 하루가 여러 구간으로 끊길 수 있다
    # (부서 담당자가 30분 단위로 직접 설정할 수 있게 되면서 생긴 요구).
    opening_hours: dict[PeriodType, dict[Weekday, list[tuple[int, int]]]]
    semester_public_holiday_hours: tuple[int, int]
    exam_weekend_hours: tuple[int, int]
    preferred_staffing_bands: list[PreferredStaffingBand]
    meal_windows: list[MealWindow]
    vacation_long_shift_meal_hours: float  # 방학 중 이 시간 이상 배정 시 식사 시간 고려
    morning_end_min: int  # 이 시각 이전 슬롯을 '아침 근무'로 간주
    exam_buffer_minutes: int  # 시험 시작 전 이 시간 내 배정 회피
    soft_weights: dict[str, int]

    def weight(self, key: str) -> int:
        return self.soft_weights.get(key, 0)

    def default_open_ranges(self, period: PeriodType, day: date) -> list[tuple[int, int]]:
        return self.opening_hours[period].get(Weekday(day.weekday()), [])

    @classmethod
    def from_dict(cls, raw: dict) -> "DepartmentPolicy":
        limits = raw["hour_limits"]
        opening: dict[PeriodType, dict[Weekday, list[tuple[int, int]]]] = {}
        for period_key, by_day in raw["opening_hours"]["default"].items():
            period = PeriodType(period_key)
            opening[period] = {}
            for day_key, rng in by_day.items():
                opening[period][Weekday.from_key(day_key)] = _parse_range(rng)

        bands = [
            PreferredStaffingBand(
                period=PeriodType(b["period"]),
                weekdays=frozenset(Weekday.from_key(d) for d in b["days"]),
                start_min=str_to_minutes(b["start"]),
                end_min=str_to_minutes(b["end"]),
                preferred_count=b["preferred_count"],
                weight=b["weight"],
            )
            for b in raw["preferred_staffing_bands"]
        ]
        meals = [
            MealWindow(
                period=PeriodType(m["period"]),
                start_min=str_to_minutes(m["start"]),
                end_min=str_to_minutes(m["end"]),
            )
            for m in raw["meal_windows"]
        ]
        return cls(
            department_id=raw["department_id"],
            department_name=raw["department_name"],
            slot_minutes=raw["slot_minutes"],
            staffing=StaffingPolicy(**raw["staffing"]),
            hour_limits=HourLimitPolicy(
                gyobi_weekly_max_hours=limits["gyobi_weekly_max_hours"],
                gukga_weekly_max_hours={
                    PeriodType(k): v for k, v in limits["gukga_weekly_max_hours"].items()
                },
                gukga_monthly_max_hours=limits["gukga_monthly_max_hours"],
                gyobi_biweekly_dept_total_max_hours=limits[
                    "gyobi_biweekly_dept_total_max_hours"
                ],
            ),
            opening_hours=opening,
            semester_public_holiday_hours=_parse_single_range(
                raw["opening_hours"]["semester_public_holiday"]
            ),
            exam_weekend_hours=_parse_single_range(raw["opening_hours"]["exam_weekend"]),
            preferred_staffing_bands=bands,
            meal_windows=meals,
            vacation_long_shift_meal_hours=raw["vacation_long_shift_meal_hours"],
            morning_end_min=str_to_minutes(raw["morning_end"]),
            exam_buffer_minutes=raw["exam_buffer_minutes"],
            soft_weights=raw["soft_weights"],
        )


def _parse_range(rng: list[str] | None) -> list[tuple[int, int]]:
    """요일별 개관: 정책 파일의 [시작, 종료] 또는 null(폐관)을 구간 목록으로 변환."""
    if rng is None:
        return []
    return [_parse_single_range(rng)]


def _parse_single_range(rng: list[str]) -> tuple[int, int]:
    """공휴일·시험 연장처럼 하루 전체를 대체하는 단일 구간."""
    return (str_to_minutes(rng[0]), str_to_minutes(rng[1]))
