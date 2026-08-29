"""`--only` 경로가 행 단위로 멱등한지 검증.

전에는 `department` 행 하나만 보고 전체를 건너뛰었다. 그래서 시드 CSV에 학생을
더해도 운영 DB는 옛 인원에 멈춰 있었고, 새로 생긴 컬럼(course_ta_enabled)은 값이
안 채워져 화면 기능이 조용히 꺼졌다 — 배포판에서 실제로 일어난 일이다.

여기서 고정하는 것:

1. **빈 DB** — 부서 전체가 들어간다
2. **두 번 실행** — 아무것도 늘지 않는다 (중복 삽입 없음)
3. **뒤처진 DB** — 배포판 상황 재현: 학생 일부가 빠지고 부서 값이 옛날 값일 때,
   빠진 학생만 채우고 부서 값을 CSV로 맞춘다
4. **운영 설정 보존** — 담당자가 고친 부서 정책과 기존 학생의 가능시간은 안 덮는다
5. **신원 불일치 중단** — 그 학번이 DB에서 다른 사람의 것이면 아무것도 바꾸지 않는다
"""

import datetime
import importlib.util
from pathlib import Path

import pytest

from app import models


@pytest.fixture(scope="module")
def seed():
    path = Path(__file__).resolve().parents[1] / "scripts" / "seed_mock_data.py"
    spec = importlib.util.spec_from_file_location("seed_mock_data", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def aat(seed):
    return seed.TEST_DEPARTMENTS["aat-dept"]


def _run(seed, db, spec):
    added = seed.seed_test_department(db, "hash", spec)
    db.commit()
    return added


def _counts(db, spec):
    ids = [s["student_id"] for s in spec["students"]]
    return dict(
        students=db.query(models.Student).filter(models.Student.student_id.in_(ids)).count(),
        applications=db.query(models.Application)
        .filter(models.Application.posting_id == spec["posting_id"]).count(),
        availability=db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id.in_(ids)).count(),
        class_times=db.query(models.ClassTime)
        .filter(models.ClassTime.student_id.in_(ids)).count(),
    )


def test_seeds_whole_department_into_empty_db(seed, db_session, aat):
    added = _run(seed, db_session, aat)

    assert added["department"] == 1
    assert added["students"] == len(aat["students"])
    assert added["applications"] == len(aat["students"])
    assert db_session.query(models.Department).filter_by(
        department_id=aat["department_id"]
    ).one().course_ta_enabled is True


def test_second_run_changes_nothing(seed, db_session, aat):
    _run(seed, db_session, aat)
    before = _counts(db_session, aat)

    added = _run(seed, db_session, aat)

    assert _counts(db_session, aat) == before, "두 번째 실행이 행을 늘렸다 — 중복 삽입"
    assert added["students"] == 0
    assert added["applications"] == 0
    assert added["availability"] == 0
    assert added["updated_fields"] == []


def test_fills_only_the_missing_students(seed, db_session, aat):
    """배포판 상황 — 부서는 있는데 학생이 옛 인원에 멈춰 있다."""
    _run(seed, db_session, aat)
    dropped = [s["student_id"] for s in aat["students"][-2:]]
    for student_id in dropped:
        db_session.query(models.Application).filter_by(student_id=student_id).delete()
        db_session.query(models.AvailableTime).filter_by(student_id=student_id).delete()
        db_session.query(models.ClassTime).filter_by(student_id=student_id).delete()
        db_session.query(models.Student).filter_by(student_id=student_id).delete()
    db_session.commit()

    added = _run(seed, db_session, aat)

    assert added["students"] == 2
    assert added["applications"] == 2
    assert added["availability"] > 0, "새로 만든 학생에게는 가능시간도 함께 들어가야 한다"
    assert _counts(db_session, aat)["students"] == len(aat["students"])


def test_realigns_seed_owned_department_fields(seed, db_session, aat):
    """course_ta_enabled·정원처럼 시드가 정의하는 값은 CSV 쪽이 맞다."""
    _run(seed, db_session, aat)
    dept = db_session.query(models.Department).filter_by(
        department_id=aat["department_id"]
    ).one()
    dept.course_ta_enabled = False   # 컬럼이 나중에 추가돼 기본값 False로 남은 상태
    dept.headcount_to = 20           # 정원이 22로 늘기 전 값
    db_session.commit()

    added = _run(seed, db_session, aat)

    assert set(added["updated_fields"]) == {"course_ta_enabled", "headcount_to"}
    dept = db_session.query(models.Department).filter_by(
        department_id=aat["department_id"]
    ).one()
    assert dept.course_ta_enabled is True
    assert dept.headcount_to == 22


def test_keeps_department_policy_edited_by_staff(seed, db_session, aat):
    """부서 정책은 화면에서 고치는 값이라 시드가 덮으면 안 된다."""
    _run(seed, db_session, aat)
    policy = db_session.query(models.DepartmentPolicy).filter_by(
        department_id=aat["department_id"]
    ).one()
    policy.min_per_slot = 3
    policy.custom_rules = "담당자가 화면에서 넣은 규칙"
    db_session.commit()

    added = _run(seed, db_session, aat)

    assert added["policy"] == 0
    policy = db_session.query(models.DepartmentPolicy).filter_by(
        department_id=aat["department_id"]
    ).one()
    assert policy.min_per_slot == 3
    assert policy.custom_rules == "담당자가 화면에서 넣은 규칙"


def test_keeps_availability_a_student_already_submitted(seed, db_session, aat):
    """이미 시간을 낸 학생에게 시드 값을 덧붙이면 중복이 된다."""
    _run(seed, db_session, aat)
    student_id = aat["students"][0]["student_id"]
    db_session.query(models.AvailableTime).filter_by(student_id=student_id).delete()
    db_session.add(models.AvailableTime(
        term="2026-2", student_id=student_id, day_of_week=1,
        start_time=datetime.time(9, 0), end_time=datetime.time(10, 0), preference=3,
    ))
    db_session.commit()

    _run(seed, db_session, aat)

    rows = db_session.query(models.AvailableTime).filter_by(student_id=student_id).all()
    assert len(rows) == 1, "학생이 직접 낸 시간 위에 시드가 덧붙었다"


def test_stops_when_the_student_id_belongs_to_someone_else(seed, db_session, aat):
    """시드가 학번을 재번호했는데 DB가 옛 번호를 들고 있는 경우 (배포판 실제 사고).

    학번만 보고 "이미 있다"고 넘어가면, 그 자리에 있던 다른 부서 사람에게
    합격 지원서가 붙어 한 사람이 두 부서 명단에 걸친다.
    """
    taken = aat["students"][-1]["student_id"]
    db_session.add(models.Student(
        student_id=taken, name="구본영", department_name="교육대학원",
        password_hash="hash",
    ))
    db_session.commit()

    added = seed.seed_test_department(db_session, "hash", aat)

    assert len(added["conflicts"]) == 1
    conflict = added["conflicts"][0]
    assert conflict["student_id"] == taken
    assert "구본영" in conflict["db"] and "교육대학원" in conflict["db"]
    # 충돌을 만나면 어떤 행도 만들지 않는다
    assert added["students"] == 0 and added["applications"] == 0
    assert db_session.query(models.Department).filter_by(
        department_id=aat["department_id"]
    ).first() is None, "충돌 판정이 부서 생성보다 먼저 와야 한다"


def test_matching_student_is_not_a_conflict(seed, db_session, aat):
    """이름·학과가 같으면 그 학번은 같은 사람이다 — 정상 경로."""
    _run(seed, db_session, aat)

    added = _run(seed, db_session, aat)

    assert added["conflicts"] == []
