"""부서별 스케줄링 정책.

MVP 기준(로욜라도서관 정보서비스팀)을 포함한 모든 수치·시간대 기준은
config/departments/*.json 에서 로드한다. 추후 부서 담당자가 직접 입력하거나
DB 테이블(department_policy)로 이관하는 것을 전제로, 코드에는 기준값을
하드코딩하지 않는다.
"""

from dataclasses import dataclass, field
from datetime import date

from .enums import PeriodType, Weekday
from .timegrid import minutes_to_str, str_to_minutes


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
    # None이면 그 부서는 학기 중 공휴일·교내 휴강일에 **폐관**한다 (#172).
    # 도서관처럼 공휴일에도 단축 운영하는 부서만 구간을 갖는다
    semester_public_holiday_hours: tuple[int, int] | None
    # None이면 시험 주말 연장이 없다 — 평소 요일 규칙을 그대로 따른다 (#172).
    # 주말이 폐관인 부서(학과 사무실·행정팀)가 시험 주말에만 열리는 일을 막는다
    exam_weekend_hours: tuple[int, int] | None
    preferred_staffing_bands: list[PreferredStaffingBand]
    meal_windows: list[MealWindow]
    vacation_long_shift_meal_hours: float  # 방학 중 이 시간 이상 배정 시 식사 시간 고려
    morning_end_min: int  # 이 시각 이전 슬롯을 '아침 근무'로 간주
    exam_buffer_minutes: int  # 시험 시작 전 이 시간 내 배정 회피
    soft_weights: dict[str, int]
    # 페널티 카테고리별 중요도 배율 (부서 담당자 설정). 키가 없으면 1.0
    soft_weight_scales: dict[str, float] = field(default_factory=dict)
    # work_slots[기간][요일] = [(블록 시작 분, 블록 종료 분), ...] — 부서 정의 근무 슬롯(#89).
    # (기간, 요일) 단위 opt-in: 키가 없으면 그 요일은 기존 자유 30분 그리드.
    # 정의된 요일의 블록들은 opening_hours 구간을 정확히 타일링해야 한다
    # (validate_work_slots_tiling). 배정은 블록 전체 or 전무 (WorkSlotBlockConstraint).
    work_slots: dict[PeriodType, dict[Weekday, list[tuple[int, int]]]] = field(
        default_factory=dict
    )

    def penalty_scale(self, category: str) -> float:
        return self.soft_weight_scales.get(category, 1.0)

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

        slot_minutes = raw["slot_minutes"]
        work_slots: dict[PeriodType, dict[Weekday, list[tuple[int, int]]]] = {}
        for period_key, by_day in raw.get("work_slots", {}).get("default", {}).items():
            period = PeriodType(period_key)
            work_slots[period] = {}
            for day_key, blocks in by_day.items():
                weekday = Weekday.from_key(day_key)
                parsed = [_parse_single_range(b) for b in blocks]
                error = validate_work_slots_tiling(
                    opening.get(period, {}).get(weekday, []), parsed, slot_minutes
                )
                if error is not None:
                    raise ValueError(
                        f"work_slots {period_key}.{day_key}: {error}"
                    )
                work_slots[period][weekday] = parsed

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
            semester_public_holiday_hours=_parse_optional_single_range(
                raw["opening_hours"]["semester_public_holiday"]
            ),
            exam_weekend_hours=_parse_optional_single_range(
                raw["opening_hours"]["exam_weekend"]
            ),
            preferred_staffing_bands=bands,
            meal_windows=meals,
            vacation_long_shift_meal_hours=raw["vacation_long_shift_meal_hours"],
            morning_end_min=str_to_minutes(raw["morning_end"]),
            exam_buffer_minutes=raw["exam_buffer_minutes"],
            soft_weights=raw["soft_weights"],
            work_slots=work_slots,
        )


def validate_work_slots_tiling(
    opening: list[tuple[int, int]],
    blocks: list[tuple[int, int]],
    slot_minutes: int,
) -> str | None:
    """블록 목록이 개관 구간을 정확히 타일링하는지 검사. 위반 시 사유 문자열.

    규칙: 경계는 slot_minutes 배수, 시작 < 종료, 블록 간 겹침 없음,
    각 개관 구간을 빈틈·초과 없이 연속 분할해야 한다.
    """
    for start, end in blocks:
        if start % slot_minutes or end % slot_minutes:
            return (
                f"{minutes_to_str(start)}~{minutes_to_str(end)} 블록 경계가 "
                f"{slot_minutes}분 단위가 아닙니다"
            )
        if start >= end:
            return f"{minutes_to_str(start)}~{minutes_to_str(end)} 블록의 시작이 종료보다 늦습니다"

    ordered = sorted(blocks)
    for (_, prev_end), (next_start, next_end) in zip(ordered, ordered[1:]):
        if next_start < prev_end:
            return (
                f"{minutes_to_str(next_start)}~{minutes_to_str(next_end)} 블록이 "
                f"앞 블록과 겹칩니다"
            )

    if not opening:
        if ordered:
            return "폐관 요일에는 근무 슬롯을 정의할 수 없습니다"
        return None

    idx = 0
    for open_min, close_min in sorted(opening):
        cursor = open_min
        while cursor < close_min:
            if idx >= len(ordered) or ordered[idx][0] != cursor:
                return f"{minutes_to_str(cursor)}부터 블록이 비어 있습니다"
            if ordered[idx][1] > close_min:
                return (
                    f"{minutes_to_str(ordered[idx][0])}~{minutes_to_str(ordered[idx][1])} "
                    f"블록이 개관 구간({minutes_to_str(open_min)}~{minutes_to_str(close_min)})을 "
                    f"벗어납니다"
                )
            cursor = ordered[idx][1]
            idx += 1
    if idx != len(ordered):
        return (
            f"{minutes_to_str(ordered[idx][0])}~{minutes_to_str(ordered[idx][1])} "
            f"블록이 개관 시간 밖에 있습니다"
        )
    return None


def _parse_range(rng: list[str] | None) -> list[tuple[int, int]]:
    """요일별 개관: 정책 파일의 [시작, 종료] 또는 null(폐관)을 구간 목록으로 변환."""
    if rng is None:
        return []
    return [_parse_single_range(rng)]


def _parse_single_range(rng: list[str]) -> tuple[int, int]:
    """공휴일·시험 연장처럼 하루 전체를 대체하는 단일 구간."""
    return (str_to_minutes(rng[0]), str_to_minutes(rng[1]))


def _parse_optional_single_range(rng: list[str] | None) -> tuple[int, int] | None:
    """null = 그 특별일 규칙이 없다 (공휴일 폐관 / 시험 주말 연장 없음, #172)."""
    return None if rng is None else _parse_single_range(rng)
