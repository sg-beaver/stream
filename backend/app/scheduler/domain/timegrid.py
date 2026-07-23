"""날짜 × 시간 슬롯 그리드.

시간은 하루 기준 '자정으로부터의 분(minute-of-day)' 정수로 다루고,
슬롯은 슬롯 시작 시각(분)으로 식별한다. 슬롯 길이는 부서 정책의
slot_minutes를 따른다 (기본 30분 — 페이 지급 최소 단위).
"""

from dataclasses import dataclass, field
from datetime import date, timedelta


def str_to_minutes(text: str) -> int:
    """"HH:MM" → 분."""
    hh, mm = text.split(":")
    return int(hh) * 60 + int(mm)


def minutes_to_str(minute: int) -> str:
    """분 → "HH:MM"."""
    return f"{minute // 60:02d}:{minute % 60:02d}"


@dataclass
class TimeGrid:
    """스케줄링 대상 기간의 날짜별 개관 슬롯 집합.

    open_slots[날짜] = 그 날짜에 배정 가능한 슬롯 시작 시각(분) 목록 (정렬됨).
    폐관일은 빈 목록.
    """

    start_date: date
    num_days: int
    slot_minutes: int
    open_slots: dict[date, list[int]] = field(default_factory=dict)

    @property
    def dates(self) -> list[date]:
        return [self.start_date + timedelta(days=i) for i in range(self.num_days)]

    def set_open_range(self, day: date, open_min: int | None, close_min: int | None) -> None:
        if open_min is None or close_min is None:
            self.open_slots[day] = []
            return
        self.open_slots[day] = list(range(open_min, close_min, self.slot_minutes))

    def slots_of(self, day: date) -> list[int]:
        return self.open_slots.get(day, [])

    def is_open(self, day: date, minute: int) -> bool:
        return minute in self.open_slots.get(day, [])

    def slots_to_hours(self, num_slots: int) -> float:
        return num_slots * self.slot_minutes / 60

    def hours_to_slots(self, hours: float) -> int:
        return int(hours * 60 / self.slot_minutes)
