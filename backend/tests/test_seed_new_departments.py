"""아텍-test(7)·교육대학원 행정팀-test(8) 시드 검증 (#172).

실사용자 테스트용 부서라, 시드가 조용히 어긋나면 "화면은 멀쩡한데 근무표가
비어 나오는" 상태가 된다. 세 가지를 고정한다:

1. **명단** — 부서·직원·학생 수와 학번 대역
2. **개관 커버리지** — 부서 개관 시간을 낼 수 있는 학생이 모든 구간에 있는지.
   아텍(7)은 블록 단위 근무라 블록을 통째로 덮는 학생이 있어야 하고,
   교육대학원(8)은 자유 30분 그리드라 슬롯마다 있으면 된다
3. **수업 ↔ 가능 시간 비겹침** — 근무표 생성은 학생이 수업을 빼고 냈다고 전제한다
   (seed_data/README.md 규칙)
"""

import csv
import datetime
import importlib.util
from collections import defaultdict
from pathlib import Path

import pytest

from app.scheduler.config import load_academic_calendar, load_department_policy
from app.scheduler.domain import OpeningHoursResolver, PeriodType, Weekday

SEED_DATA_DIR = Path(__file__).resolve().parents[1] / "scripts" / "seed_data"
TERM = "2026-2"

AAT = dict(department_id=7, staff_id="STF011", policy="aat_department_office", students=22)
GRAD = dict(department_id=8, staff_id="STF012", policy="grad_edu_admin", students=10)


@pytest.fixture(scope="module")
def seed():
    path = Path(__file__).resolve().parents[1] / "scripts" / "seed_mock_data.py"
    spec = importlib.util.spec_from_file_location("seed_mock_data", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _read_csv(name):
    with open(SEED_DATA_DIR / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _minutes(hhmm):
    hour, minute = hhmm.split(":")[:2]
    return int(hour) * 60 + int(minute)


def _weekly_rows(role):
    """그 부서 학생들의 2026-2 가능 시간을 { 요일: [(시작 분, 종료 분)] }로."""
    ids = {r["student_id"] for r in _read_csv("students.csv") if r["role"] == role}
    by_student = defaultdict(lambda: defaultdict(list))
    for row in _read_csv("available_times.csv"):
        if row["student_id"] in ids and row["term"] == TERM:
            by_student[row["student_id"]][int(row["day_of_week"])].append(
                (_minutes(row["start_time"]), _minutes(row["end_time"]))
            )
    return ids, by_student


def _covers(ranges, start, end):
    """구간 하나가 [start, end)를 통째로 덮는지 (블록 단위 근무 판정과 같은 기준)."""
    return any(r_start <= start and end <= r_end for r_start, r_end in ranges)


class TestRoster:
    def test_departments_and_staff_exist(self, seed):
        names = {d[0]: d[1] for d in seed.DEPARTMENTS}
        assert names[AAT["department_id"]] == "아트&테크놀로지학과-test"
        assert names[GRAD["department_id"]] == "교육대학원 행정팀-test"
        staff = {s[0]: s[2] for s in seed.STAFF}
        assert staff[AAT["staff_id"]] == AAT["department_id"]
        assert staff[GRAD["staff_id"]] == GRAD["department_id"]

    def test_student_counts_and_id_ranges(self, seed):
        aat = [s["student_id"] for s in seed.AAT_STUDENTS]
        grad = [s["student_id"] for s in seed.GRAD_EDU_STUDENTS]
        assert len(aat) == AAT["students"] and len(grad) == GRAD["students"]
        # 학번은 부서마다 1000 단위 대역이다 — 6: 20261xxx · 7: 20262xxx · 8: 20263xxx.
        # 정원이 늘어도 옆 부서 대역을 침범하지 않도록 띄워 잡는다 (#172)
        assert aat == [f"2026{2001 + i}" for i in range(22)]
        assert grad == [f"2026{3001 + i}" for i in range(10)]
        # 두 부서 모두 교비 근로다 — 국가 근로는 월 상한(HC-TIME-3)이 따로 걸린다
        assert {s["funding_type"] for s in seed.AAT_STUDENTS + seed.GRAD_EDU_STUDENTS} == {"gyobi"}

    def test_each_department_has_its_own_policy_file(self, seed):
        assert seed.DEPARTMENT_POLICY_FILES[AAT["department_id"]] == AAT["policy"]
        assert seed.DEPARTMENT_POLICY_FILES[GRAD["department_id"]] == GRAD["policy"]


class TestOpeningCoverage:
    def test_aat_blocks_all_have_a_candidate(self):
        """아텍은 블록 단위 근무 — 블록을 통째로 덮는 학생이 없으면 그 블록은 비어 버린다."""
        policy = load_department_policy(AAT["policy"])
        _ids, by_student = _weekly_rows("aat-worker")
        thin = []
        for weekday, blocks in policy.work_slots[PeriodType.SEMESTER].items():
            for block in blocks:
                start, end = block if isinstance(block, tuple) else (block.start_min, block.end_min)
                count = sum(
                    1 for ranges in by_student.values()
                    if _covers(ranges[weekday.value + 1], start, end)
                )
                if count == 0:
                    thin.append((weekday.name, start, end))
        assert not thin, f"가능한 학생이 없는 블록: {thin}"

    def test_grad_edu_slots_all_have_a_candidate(self):
        policy = load_department_policy(GRAD["policy"])
        _ids, by_student = _weekly_rows("grad-edu-worker")
        empty = []
        for weekday, ranges in policy.opening_hours[PeriodType.SEMESTER].items():
            for open_start, open_end in ranges:
                for minute in range(open_start, open_end, policy.slot_minutes):
                    count = sum(
                        1 for student in by_student.values()
                        if _covers(student[weekday.value + 1], minute, minute + policy.slot_minutes)
                    )
                    if count == 0:
                        empty.append((weekday.name, minute))
        assert not empty, f"가능한 학생이 없는 슬롯: {empty}"


class TestClassTimesDoNotOverlapAvailability:
    @pytest.mark.parametrize("role", ["aat-worker", "grad-edu-worker"])
    def test_no_overlap(self, role):
        ids, by_student = _weekly_rows(role)
        overlaps = []
        for row in _read_csv("class_times.csv"):
            if row["student_id"] not in ids or row["term"] != TERM:
                continue
            start, end = _minutes(row["start_time"]), _minutes(row["end_time"])
            for r_start, r_end in by_student[row["student_id"]][int(row["day_of_week"])]:
                if r_start < end and start < r_end:
                    overlaps.append((row["student_id"], row["day_of_week"], row["start_time"]))
        assert not overlaps, f"수업과 겹치는 가능 시간: {overlaps[:5]}"


class TestSpecialDayRules:
    """두 부서는 공휴일에 쉬고 시험 주말에도 열지 않는다 (#172 정책 확장)."""

    HOLIDAY = datetime.date(2026, 10, 3)   # 개천절 (토)
    EXAM_SATURDAY = datetime.date(2026, 10, 24)  # 10/20~10/26 시험 주간의 토요일

    @pytest.mark.parametrize("policy_key", [AAT["policy"], GRAD["policy"]])
    def test_closed_on_public_holidays_and_exam_weekends(self, policy_key):
        policy = load_department_policy(policy_key)
        assert policy.semester_public_holiday_hours is None
        assert policy.exam_weekend_hours is None
        resolver = OpeningHoursResolver(policy, load_academic_calendar(2026))
        assert resolver.resolve(self.HOLIDAY) == []
        assert resolver.resolve(self.EXAM_SATURDAY) == []

    def test_weekday_opening_hours_match_the_department(self):
        grad = load_department_policy(GRAD["policy"])
        semester = grad.opening_hours[PeriodType.SEMESTER]
        # 공고 근무조건 — 학기중 월~목 10~21시 · 금 10~17시
        assert semester[Weekday.MON] == [(10 * 60, 21 * 60)]
        assert semester[Weekday.FRI] == [(10 * 60, 17 * 60)]
        assert semester[Weekday.SAT] == []
        vacation = grad.opening_hours[PeriodType.VACATION]
        assert vacation[Weekday.MON] == [(10 * 60, 17 * 60)]

        aat = load_department_policy(AAT["policy"])
        assert aat.opening_hours[PeriodType.SEMESTER][Weekday.MON] == [(9 * 60, 18 * 60)]
        # 방학은 이번 범위 밖이라 전 요일 폐관이다
        assert all(not v for v in aat.opening_hours[PeriodType.VACATION].values())
