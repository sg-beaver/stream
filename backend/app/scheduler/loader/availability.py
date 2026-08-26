"""요일 반복(AvailableTime) + 날짜 예외(AvailabilityException) → 날짜별 구간 전개.

DB 세션이나 SQLAlchemy에 의존하지 않는 순수 함수. 라우터/서비스 레이어가
이미 조회한 행을 아래 Row 타입으로 변환해서 넘기면 된다.

day_of_week 값은 1(월)~7(일)이며 `date.isoweekday()`와 동일한 규칙이라
별도 변환 없이 그대로 비교할 수 있다.
"""

from dataclasses import dataclass
from datetime import date, time, timedelta

_KNOWN_MODES = {"weekly_only", "weekly_with_unavailable", "weekly_with_exceptions"}

# (구간 시작 분, 구간 끝 분, preference)
_Interval = tuple[int, int, int | None]


@dataclass(frozen=True)
class AvailableTimeRow:
    """AvailableTime 테이블 한 행에 대응."""

    day_of_week: int  # 1(월)~7(일)
    start_time: time
    end_time: time
    preference: int | None


@dataclass(frozen=True)
class AvailabilityExceptionRow:
    """AvailabilityException 테이블 한 행에 대응."""

    exception_date: date
    exception_type: str  # "UNAVAILABLE" | "AVAILABLE"
    start_time: time | None
    end_time: time | None
    preference: int | None


def materialize_availability(
    weekly_patterns: list[AvailableTimeRow],
    exceptions: list[AvailabilityExceptionRow],
    availability_mode: str,
    period_start: date,
    period_end: date,
) -> dict[date, list[tuple[time, time, int | None]]]:
    """기간 내 모든 날짜에 대해 요일 패턴 + 예외를 반영한 가능 구간을 만든다.

    적용 순서(같은 날짜에 여러 예외가 있을 때):
    1. 종일 UNAVAILABLE(start/end 둘 다 None) → 그날 구간을 통째로 비움
    2. 부분 UNAVAILABLE → 남은 구간에서 시간대 차감(필요 시 분할)
    3. AVAILABLE → 겹치거나 맞닿은 구간과 병합, preference는 새 구간 값 우선

    정책이 없거나(None) 알 수 없는 값이면 "weekly_only"로 fail-closed 처리한다.
    """
    mode = availability_mode if availability_mode in _KNOWN_MODES else "weekly_only"

    exceptions_by_date: dict[date, list[AvailabilityExceptionRow]] = {}
    if mode != "weekly_only":
        for exc in exceptions:
            exceptions_by_date.setdefault(exc.exception_date, []).append(exc)

    result: dict[date, list[tuple[time, time, int | None]]] = {}
    day = period_start
    while day <= period_end:
        weekday = day.isoweekday()
        intervals: list[_Interval] = [
            (_to_minutes(p.start_time), _to_minutes(p.end_time), p.preference)
            for p in weekly_patterns
            if p.day_of_week == weekday
        ]

        for exc in exceptions_by_date.get(day, []):
            if exc.exception_type == "UNAVAILABLE":
                if mode not in ("weekly_with_unavailable", "weekly_with_exceptions"):
                    continue
                if exc.start_time is None and exc.end_time is None:
                    intervals = []
                else:
                    intervals = _subtract(
                        intervals, _to_minutes(exc.start_time), _to_minutes(exc.end_time)
                    )
            elif exc.exception_type == "AVAILABLE":
                if mode != "weekly_with_exceptions":
                    continue
                intervals = _add(
                    intervals,
                    _to_minutes(exc.start_time),
                    _to_minutes(exc.end_time),
                    exc.preference,
                )

        result[day] = [
            (_to_time(s), _to_time(e), pref) for s, e, pref in sorted(intervals)
        ]
        day += timedelta(days=1)

    return result


def _subtract(intervals: list[_Interval], cut_start: int, cut_end: int) -> list[_Interval]:
    updated: list[_Interval] = []
    for start, end, pref in intervals:
        overlap_start = max(start, cut_start)
        overlap_end = min(end, cut_end)
        if overlap_start >= overlap_end:
            updated.append((start, end, pref))
            continue
        if overlap_start > start:
            updated.append((start, overlap_start, pref))
        if overlap_end < end:
            updated.append((overlap_end, end, pref))
    return updated


def _add(
    intervals: list[_Interval], new_start: int, new_end: int, new_pref: int | None
) -> list[_Interval]:
    overlapping = [
        (s, e, p) for s, e, p in intervals if not (new_end < s or e < new_start)
    ]
    remaining = [iv for iv in intervals if iv not in overlapping]
    merged_start = min([new_start] + [s for s, _, _ in overlapping])
    merged_end = max([new_end] + [e for _, e, _ in overlapping])
    remaining.append((merged_start, merged_end, new_pref))
    return remaining


def _to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _to_time(minute: int) -> time:
    return time(hour=minute // 60, minute=minute % 60)
