from datetime import date, time

from app.scheduler.loader.availability import (
    AvailabilityExceptionRow,
    AvailableTimeRow,
    materialize_availability,
)

MON = date(2026, 6, 1)  # 월요일 (isoweekday() == 1)


def weekly(day_of_week=1, start="09:00", end="18:00", preference=2):
    h1, m1 = map(int, start.split(":"))
    h2, m2 = map(int, end.split(":"))
    return AvailableTimeRow(
        day_of_week=day_of_week,
        start_time=time(h1, m1),
        end_time=time(h2, m2),
        preference=preference,
    )


def exception(exc_date, exc_type, start=None, end=None, preference=None):
    def _t(s):
        if s is None:
            return None
        h, m = map(int, s.split(":"))
        return time(h, m)

    return AvailabilityExceptionRow(
        exception_date=exc_date,
        exception_type=exc_type,
        start_time=_t(start),
        end_time=_t(end),
        preference=preference,
    )


def test_partial_unavailable_splits_interval_in_the_middle():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[exception(MON, "UNAVAILABLE", "12:00", "13:00")],
        availability_mode="weekly_with_unavailable",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == [
        (time(9, 0), time(12, 0), 2),
        (time(13, 0), time(18, 0), 2),
    ]


def test_unavailable_fully_covers_interval():
    result = materialize_availability(
        weekly_patterns=[weekly(start="10:00", end="12:00")],
        exceptions=[exception(MON, "UNAVAILABLE", "09:00", "13:00")],
        availability_mode="weekly_with_unavailable",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == []


def test_partial_overlap_at_the_end_of_interval():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[exception(MON, "UNAVAILABLE", "15:00", "20:00")],
        availability_mode="weekly_with_unavailable",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == [(time(9, 0), time(15, 0), 2)]


def test_cut_boundary_exactly_matches_interval_start():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[exception(MON, "UNAVAILABLE", "09:00", "12:00")],
        availability_mode="weekly_with_unavailable",
        period_start=MON,
        period_end=MON,
    )
    # 왼쪽에 길이 0짜리 조각이 남지 않아야 한다
    assert result[MON] == [(time(12, 0), time(18, 0), 2)]


def test_available_exception_on_date_with_no_weekly_pattern():
    tue = date(2026, 6, 2)
    result = materialize_availability(
        weekly_patterns=[weekly(day_of_week=1)],  # 월요일에만 패턴 존재
        exceptions=[exception(tue, "AVAILABLE", "10:00", "14:00", preference=3)],
        availability_mode="weekly_with_exceptions",
        period_start=tue,
        period_end=tue,
    )
    assert result[tue] == [(time(10, 0), time(14, 0), 3)]


def test_overlapping_available_exceptions_merge_and_prefer_latest_preference():
    result = materialize_availability(
        weekly_patterns=[],
        exceptions=[
            exception(MON, "AVAILABLE", "10:00", "12:00", preference=1),
            exception(MON, "AVAILABLE", "11:00", "13:00", preference=3),
        ],
        availability_mode="weekly_with_exceptions",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == [(time(10, 0), time(13, 0), 3)]


def test_weekly_only_mode_ignores_all_exceptions():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[
            exception(MON, "UNAVAILABLE", "12:00", "13:00"),
            exception(MON, "AVAILABLE", "20:00", "22:00", preference=3),
        ],
        availability_mode="weekly_only",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == [(time(9, 0), time(18, 0), 2)]


def test_unknown_or_missing_policy_fails_closed_to_weekly_only():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[
            exception(MON, "UNAVAILABLE", "12:00", "13:00"),
            exception(MON, "AVAILABLE", "20:00", "22:00", preference=3),
        ],
        availability_mode=None,
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == [(time(9, 0), time(18, 0), 2)]


def test_weekly_with_unavailable_mode_ignores_available_exceptions():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[exception(MON, "AVAILABLE", "20:00", "22:00", preference=3)],
        availability_mode="weekly_with_unavailable",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == [(time(9, 0), time(18, 0), 2)]


def test_full_day_unavailable_clears_the_whole_date():
    result = materialize_availability(
        weekly_patterns=[weekly()],
        exceptions=[exception(MON, "UNAVAILABLE")],
        availability_mode="weekly_with_unavailable",
        period_start=MON,
        period_end=MON,
    )
    assert result[MON] == []


def test_period_produces_an_entry_for_every_date_in_range():
    start = MON
    end = date(2026, 6, 3)
    result = materialize_availability(
        weekly_patterns=[],
        exceptions=[],
        availability_mode="weekly_only",
        period_start=start,
        period_end=end,
    )
    assert list(result.keys()) == [date(2026, 6, 1), date(2026, 6, 2), date(2026, 6, 3)]
