"""확정 배치 제약 검증 (scheduler/verify.py, #156).

솔버가 만들지 않은 배정 — 손으로 넣은 시드, 대타로 고쳐진 확정본 — 이 규정을
지키는지 확인할 경로가 없었다. 여기서는 "규정을 어긴 배정을 실제로 잡아내는가"와
"정상 배정을 위반으로 오인하지 않는가"를 둘 다 고정한다.
"""

import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.scheduler.verify import verify_batch

DEPARTMENT_ID = 2
# 2026-2학기 평일 — 정보서비스팀 개관 08:00~22:00, min 1명 / max 2명
TUESDAY = datetime.date(2026, 9, 1)
WEDNESDAY = datetime.date(2026, 9, 2)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(models.Department(department_id=DEPARTMENT_ID, name="정보서비스팀"))
    session.add(
        models.DepartmentPolicy(
            department_id=DEPARTMENT_ID, availability_mode="weekly_with_exceptions"
        )
    )
    session.add(models.JobPosting(posting_id=1, department_id=DEPARTMENT_ID, title="공고"))
    yield session
    session.close()


def add_student(db, student_id, available=("08:00", "22:00"), funding_type="gyobi"):
    db.add(
        models.Student(
            student_id=student_id,
            name=f"학생{student_id[-1]}",
            password_hash="x",
            funding_type=funding_type,
        )
    )
    db.add(models.Application(student_id=student_id, posting_id=1, status="합격"))
    if available is None:
        return
    start, end = available
    for day_of_week in range(1, 6):
        db.add(
            models.AvailableTime(
                student_id=student_id,
                day_of_week=day_of_week,
                start_time=_t(start),
                end_time=_t(end),
                preference=2,
            )
        )


def add_batch(db, *, solver_summary=None, period_end=WEDNESDAY, status="confirmed"):
    batch = models.ScheduleBatch(
        department_id=DEPARTMENT_ID,
        period_start=TUESDAY,
        period_end=period_end,
        status=status,
        solver_summary=solver_summary,
    )
    db.add(batch)
    db.flush()
    return batch


def add_shift(db, batch, student_id, work_date, start, end):
    db.add(
        models.WorkSchedule(
            batch_id=batch.batch_id,
            student_id=student_id,
            department_id=DEPARTMENT_ID,
            work_date=work_date,
            start_time=_t(start),
            end_time=_t(end),
        )
    )


def rules(result, severity=None):
    return [
        v["rule"]
        for v in result["violations"]
        if severity is None or v["severity"] == severity
    ]


def find(result, rule):
    return [v for v in result["violations"] if v["rule"] == rule]


# ---- 배치 출처 ----


def test_batch_without_solver_summary_is_flagged(db):
    """솔버를 안 탄 배치를 표시하지 못하면, 손으로 넣은 시드가 확정본으로 남는다."""
    batch = add_batch(db)
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "12:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["solver_generated"] is False
    assert "PROVENANCE" in rules(result)
    # 출처는 규정 위반이 아니라 경고 — critical이 없으면 ok는 유지된다
    assert find(result, "PROVENANCE")[0]["severity"] == "warning"


def test_solver_generated_batch_has_no_provenance_warning(db):
    batch = add_batch(db, solver_summary={"status": "OPTIMAL"})
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "12:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["solver_generated"] is True
    assert "PROVENANCE" not in rules(result)


# ---- Hard Constraint 검출 ----


def test_assignment_outside_opening_hours_is_critical(db):
    """개관 08:00~22:00 밖 배정 (HC-OPEN)."""
    batch = add_batch(db)
    add_student(db, "2022001", available=("07:00", "22:00"))
    add_shift(db, batch, "2022001", TUESDAY, "07:00", "09:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    violation = find(result, "HC-OPEN")[0]
    assert violation["start_time"] == "07:00"
    assert violation["end_time"] == "08:00"  # 개관 전 구간만 잘려 나온다


def test_assignment_outside_submitted_availability_is_critical(db):
    """학생이 내지 않은 시간에 배정 (HC-CLASS-1)."""
    batch = add_batch(db)
    add_student(db, "2022001", available=("09:00", "12:00"))
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "14:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    violation = find(result, "HC-CLASS-1")[0]
    assert violation["student_id"] == "2022001"
    assert (violation["start_time"], violation["end_time"]) == ("12:00", "14:00")


def test_assignment_outside_active_period_is_critical(db):
    """근로 시작 전 날짜에 배정 (HC-CLASS-6)."""
    db.add(
        models.JobPosting(
            posting_id=2,
            department_id=DEPARTMENT_ID,
            title="중도 합류 공고",
            period_start=WEDNESDAY,
            period_end=datetime.date(2026, 12, 21),
        )
    )
    batch = add_batch(db)
    db.add(
        models.Student(
            student_id="2022002", name="중도합류", password_hash="x", funding_type="gyobi"
        )
    )
    db.add(models.Application(student_id="2022002", posting_id=2, status="합격"))
    for day_of_week in range(1, 6):
        db.add(
            models.AvailableTime(
                student_id="2022002",
                day_of_week=day_of_week,
                start_time=_t("08:00"),
                end_time=_t("22:00"),
                preference=2,
            )
        )
    add_shift(db, batch, "2022002", TUESDAY, "09:00", "12:00")  # 시작 전날
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    assert find(result, "HC-CLASS-6")[0]["student_id"] == "2022002"


def test_more_than_max_per_slot_is_critical(db):
    """동시 배정 3명 (max_per_slot=2, HC-STAFF-1)."""
    batch = add_batch(db)
    for i in (1, 2, 3):
        add_student(db, f"202200{i}")
        add_shift(db, batch, f"202200{i}", TUESDAY, "09:00", "10:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    violation = find(result, "HC-STAFF-1")[0]
    assert (violation["start_time"], violation["end_time"]) == ("09:00", "10:00")


def test_same_student_assigned_twice_in_one_slot(db):
    """같은 학생이 같은 시간대에 두 번 — 사람 수로는 1명이라 HC-STAFF-1에 안 걸린다."""
    batch = add_batch(db)
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "11:00")
    add_shift(db, batch, "2022001", TUESDAY, "10:00", "12:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    violation = find(result, "OVERLAP")[0]
    assert violation["student_id"] == "2022001"
    assert (violation["start_time"], violation["end_time"]) == ("10:00", "11:00")


def test_weekly_hour_limit_is_checked(db):
    """교비 주 14시간 상한 (HC-TIME-1) — 이틀 × 14시간 = 28시간."""
    batch = add_batch(db)
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", TUESDAY, "08:00", "22:00")
    add_shift(db, batch, "2022001", WEDNESDAY, "08:00", "22:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    assert "28" in find(result, "HC-TIME-1")[0]["message"]


def test_gukga_student_uses_its_own_weekly_cap(db):
    """국가는 학기 중 주 20시간 — 교비 상한(14h)으로 잘못 재면 오탐이 난다."""
    batch = add_batch(db)
    add_student(db, "2022001", available=("08:00", "22:00"), funding_type="gukga")
    add_shift(db, batch, "2022001", TUESDAY, "08:00", "22:00")  # 14h < 20h
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert "HC-TIME-1" not in rules(result)
    assert "HC-TIME-2" not in rules(result)


def test_row_outside_batch_period_is_critical(db):
    batch = add_batch(db, period_end=TUESDAY)
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", WEDNESDAY, "09:00", "12:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is False
    assert find(result, "BATCH-RANGE")[0]["date"] == WEDNESDAY.isoformat()


# ---- 오탐 방지 ----


def test_understaffing_is_a_warning_not_a_violation(db):
    """가능 시간이 모자라 빈 슬롯이 남는 건 규정 위반이 아니라 리포트다 (SPEC 4장).

    완화 정책(allow_understaffing_with_penalty)이 켜져 있으므로 ok는 유지된다.
    """
    batch = add_batch(db, solver_summary={"status": "OPTIMAL"})
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "12:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is True
    assert rules(result, severity="critical") == []
    assert "SC-UNDER-1" in rules(result, severity="warning")


def test_clean_batch_reports_no_critical(db):
    """개관 시간 안, 가용 시간 안, 인원·상한 모두 준수 → critical 0건."""
    batch = add_batch(db, solver_summary={"status": "OPTIMAL"})
    add_student(db, "2022001")
    add_student(db, "2022002")
    for day in (TUESDAY, WEDNESDAY):
        add_shift(db, batch, "2022001", day, "08:00", "15:00")
        add_shift(db, batch, "2022002", day, "15:00", "22:00")
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert result["ok"] is True
    assert rules(result, severity="critical") == []


def test_split_shifts_from_substitute_are_not_block_violations(db):
    """부분 대타로 쪼개진 확정 근무는 허용된 운영 예외 — HC-BLOCK-1로 잡지 않는다.

    부서 정책의 근무 블록은 학기 평일 09:00~10:30 등으로 정의돼 있어, 블록 제약을
    확정본에 들이대면 아래처럼 나뉜 세 행이 전부 위반이 된다 (SPEC 3.5, #123).
    """
    batch = add_batch(db, solver_summary={"status": "OPTIMAL"})
    add_student(db, "2022001")
    add_student(db, "2022002")
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "09:30")  # 앞
    add_shift(db, batch, "2022002", TUESDAY, "09:30", "10:00")  # 대타
    add_shift(db, batch, "2022001", TUESDAY, "10:00", "10:30")  # 뒤
    db.commit()

    result = verify_batch(db, batch.batch_id)
    assert rules(result, severity="critical") == []


# ---- 커버리지 요약 ----


def test_coverage_counts_open_slots_and_staffed_ratio(db):
    """"꽉 찼는가"에 답하는 수치 — 개관 슬롯 대비 최소 인원을 채운 슬롯."""
    batch = add_batch(db, period_end=TUESDAY)  # 화요일 하루, 08:00~22:00 = 28슬롯
    add_student(db, "2022001")
    add_shift(db, batch, "2022001", TUESDAY, "08:00", "15:00")  # 14슬롯
    db.commit()

    coverage = verify_batch(db, batch.batch_id)["coverage"]
    assert coverage["open_slots"] == 28
    assert coverage["open_hours"] == 14.0
    assert coverage["staffed_slots"] == 14
    assert coverage["staffed_ratio"] == 0.5
    assert coverage["assigned_hours"] == 7.0


# ---- 가능 시간 대비 배정 시간 ----


def test_student_capacity_targets_the_smaller_of_cap_and_availability(db):
    """"가능 시간 대비 공평 배분" 규칙은 이 값이 없으면 판정 자체가 불가능하다.

    가능 시간이 상한보다 많은 학생(목표=상한)과 적은 학생(목표=가능 시간)을
    한 배치에 섞어, 목표가 각각 다른 쪽으로 잡히는지 고정한다.
    """
    batch = add_batch(db)  # 화·수 이틀, 개관 08:00~22:00
    add_student(db, "2022001")  # 평일 08:00~22:00 → 이틀 28시간 가능
    add_student(db, "2022002", available=("09:00", "12:00"))  # 이틀 6시간 가능
    add_shift(db, batch, "2022001", TUESDAY, "08:00", "22:00")  # 14시간 = 교비 상한
    add_shift(db, batch, "2022002", WEDNESDAY, "09:00", "12:00")  # 3시간
    db.commit()

    capacity = {
        row["student_id"]: row["weeks"]
        for row in verify_batch(db, batch.batch_id)["student_capacity"]
    }

    (rich,) = capacity["2022001"]
    assert rich["available_hours"] == 28.0
    assert rich["cap_hours"] == 14  # 가능 시간이 남아도 상한이 목표를 자른다
    assert rich["target_hours"] == 14.0
    assert rich["assigned_hours"] == 14.0
    assert rich["fill_ratio"] == 1.0

    (poor,) = capacity["2022002"]
    assert poor["available_hours"] == 6.0
    assert poor["target_hours"] == 6.0  # 상한이 아니라 본인 가능 시간이 목표
    assert poor["assigned_hours"] == 3.0
    # 배정 시간(3h)만 보면 위 학생보다 훨씬 적지만, 목표 대비로는 절반이다
    assert poor["fill_ratio"] == 0.5


def test_student_capacity_skips_students_with_nothing_to_compare(db):
    """가능 시간도 배정도 없는 학생까지 넣으면 비교 대상만 늘고 판단이 흐려진다."""
    batch = add_batch(db)
    add_student(db, "2022001")
    add_student(db, "2022002", available=None)  # 가능 시간 미제출
    add_shift(db, batch, "2022001", TUESDAY, "09:00", "12:00")
    db.commit()

    ids = [row["student_id"] for row in verify_batch(db, batch.batch_id)["student_capacity"]]
    assert ids == ["2022001"]
