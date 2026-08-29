"""정보서비스팀-test(부서 6) 시드 수합 데이터 검증.

운영 스프레드시트를 손으로 옮긴 데이터라 조용히 틀리기 쉽다. 두 가지를 고정한다:

1. **전사 정확도** — 시트가 스스로 계산해 둔 '근무 가능 시간' 행과 대조한다.
   전사 CSV(test_dept_availability.csv)의 날짜별 합이 시트 합계와 다르면 실패.
2. **인코딩 정확도** — DB 구조(학기별 주간 패턴 + 날짜 예외)로 나눠 담은 값을
   실제 로더로 다시 펼쳤을 때 원본 시트와 한 칸도 다르지 않아야 한다.
   1주차는 주간 패턴과 내용이 달라 예외로 덮는데, 그 조합이 어긋나면
   "화면엔 냈는데 배정이 안 되는 시간"이 조용히 생긴다.
"""

import csv
import datetime
import importlib.util
from pathlib import Path

import pytest

from app.scheduler.loader.availability import (
    AvailabilityExceptionRow,
    AvailableTimeRow,
    materialize_availability,
)

SEED_DATA_DIR = Path(__file__).resolve().parents[1] / "scripts" / "seed_data"
PERIOD_START = datetime.date(2026, 8, 31)
PERIOD_END = datetime.date(2026, 9, 13)


def _read_csv(name):
    with open(SEED_DATA_DIR / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def seed():
    """seed_mock_data.py를 모듈로 불러온다 (패키지가 아니라 경로로 직접)."""
    path = Path(__file__).resolve().parents[1] / "scripts" / "seed_mock_data.py"
    spec = importlib.util.spec_from_file_location("seed_mock_data", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _minutes(t):
    return t.hour * 60 + t.minute


def test_transcription_matches_the_sheets_own_daily_totals():
    """시트의 '근무 가능 시간' 행이 곧 전사 체크섬이다."""
    transcribed = {}
    for row in _read_csv("test_dept_availability.csv"):
        if row["kind"] not in ("가능", "희망"):
            continue
        key = (row["student_name"], row["date"])
        hours = (_minutes(_t(row["end_time"])) - _minutes(_t(row["start_time"]))) / 60
        transcribed[key] = transcribed.get(key, 0.0) + hours

    checksums = _read_csv("test_dept_daily_hours.csv")
    assert checksums, "체크섬 CSV가 비어 있다"
    mismatches = [
        (r["student_name"], r["date"], float(r["available_hours"]),
         transcribed.get((r["student_name"], r["date"]), 0.0))
        for r in checksums
        if abs(float(r["available_hours"]) - transcribed.get((r["student_name"], r["date"]), 0.0)) > 1e-9
    ]
    assert not mismatches, f"시트 합계와 다른 날: {mismatches}"

    # 체크섬이 없는 날짜에 값이 들어가 있으면(오타 등) 위 대조를 빠져나간다
    checked = {(r["student_name"], r["date"]) for r in checksums}
    assert not [k for k in transcribed if k not in checked]


def _t(hhmm):
    hh, mm = hhmm.split(":")
    return datetime.time(int(hh), int(mm))


def test_weekly_pattern_plus_exceptions_reproduce_the_sheet(seed):
    """주간 패턴 + 날짜 예외를 다시 펼치면 원본 시트와 같아야 한다."""
    grid = seed._test_dept_grid()
    student_ids = {s["name"]: s["student_id"] for s in seed.TEST_DEPT_STUDENTS}
    assert len(student_ids) == 10

    by_student_weekly = {}
    for term, student_id, day, start, end, preference in seed.TEST_DEPT_AVAILABLE_TIMES:
        by_student_weekly.setdefault(student_id, []).append(
            (term, AvailableTimeRow(day_of_week=day, start_time=start, end_time=end,
                                    preference=preference))
        )
    by_student_exceptions = {}
    for student_id, day, kind, start, end, preference in seed.TEST_DEPT_EXCEPTIONS:
        by_student_exceptions.setdefault(student_id, []).append(
            AvailabilityExceptionRow(exception_date=day, exception_type=kind,
                                     start_time=start, end_time=end, preference=preference)
        )

    for name, student_id in student_ids.items():
        expected = {}
        for (grid_name, day), entries in grid.items():
            if grid_name != name:
                continue
            intervals = sorted(
                (_minutes(s), _minutes(e), seed._TEST_DEPT_PREFERENCE[k])
                for s, e, k in entries
                if k != "수업"
            )
            if intervals:
                expected[day] = _merge(intervals)

        # 로더는 학기별로 따로 읽는다 — 08/31은 여름학기, 09/01~은 가을학기
        actual = {}
        for term, seg_start, seg_end in (
            ("2026-summer", PERIOD_START, PERIOD_START),
            ("2026-2", datetime.date(2026, 9, 1), PERIOD_END),
        ):
            weekly = [row for t, row in by_student_weekly.get(student_id, []) if t == term]
            materialized = materialize_availability(
                weekly_patterns=weekly,
                exceptions=by_student_exceptions.get(student_id, []),
                availability_mode="weekly_with_exceptions",
                period_start=seg_start,
                period_end=seg_end,
            )
            for day, intervals in materialized.items():
                if intervals:
                    actual[day] = _merge(
                        sorted((_minutes(s), _minutes(e), p) for s, e, p in intervals)
                    )

        assert actual == expected, f"{name}({student_id}) 수합이 시트와 다르다"


def _merge(intervals):
    """맞닿은 같은 선호도 구간을 합친다 — 표현만 다르고 내용은 같은 경우를 흡수."""
    merged = []
    for start, end, pref in intervals:
        if merged and merged[-1][1] == start and merged[-1][2] == pref:
            merged[-1] = (merged[-1][0], end, pref)
        else:
            merged.append((start, end, pref))
    return [tuple(m) for m in merged]


def test_national_and_school_funding_split(seed):
    """재원 구분은 HC-TIME 상한을 가르므로 틀리면 조용히 잘못된 근무표가 나온다."""
    by_name = {s["name"]: s for s in seed.TEST_DEPT_STUDENTS}
    gukga = {n for n, s in by_name.items() if s["funding_type"] == "gukga"}
    assert gukga == {"박정민", "이화정", "유강훈"}
    assert all(s["funding_type"] in ("gukga", "gyobi") for s in by_name.values())


def test_team_lead_is_marked(seed):
    leads = [s["name"] for s in seed.TEST_DEPT_STUDENTS if s["is_team_lead"]]
    assert leads == ["김찬우"]
