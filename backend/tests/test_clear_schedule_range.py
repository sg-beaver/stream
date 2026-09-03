"""`clear_schedule_range.py`가 한 주만 비우는지 검증.

배포 데모에서 정보서비스팀(2)의 특정 주만 빈 시간표로 보여야 할 때 쓰는
스크립트다. 여기서 고정하는 것:

1. 그 기간이 근무표 조회(confirmed·manual만 본다)에서 사라진다
2. 나머지 기간의 확정본은 그대로다 — 배치 period도 남은 쪽으로 좁혀진다
3. 근무 행을 지우지 않는다 — 대타 요청(schedule_id NOT NULL)이 살아남는다
4. 두 번 실행해도 더 바뀌지 않는다
"""

import datetime
import importlib.util
from pathlib import Path

import pytest

from app import models

WEEK1 = datetime.date(2026, 8, 31)
WEEK1_END = datetime.date(2026, 9, 6)
WEEK2 = datetime.date(2026, 9, 7)
PERIOD_END = datetime.date(2026, 9, 13)


@pytest.fixture(scope="module")
def script():
    path = Path(__file__).resolve().parents[1] / "scripts" / "clear_schedule_range.py"
    spec = importlib.util.spec_from_file_location("clear_schedule_range", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _effective_rows(db, department_id, start, end):
    return (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.department_id == department_id,
            models.WorkSchedule.work_date >= start,
            models.WorkSchedule.work_date <= end,
            models.ScheduleBatch.status.in_(("confirmed", "manual")),
        )
        .all()
    )


@pytest.fixture
def seeded(db_session):
    """2주(08/31~09/13) 확정본 + 1주차 근무에 걸린 대타 요청 1건."""
    db_session.add(models.Department(department_id=2, name="정보서비스팀"))
    for student_id in ("20220001", "20220002"):
        db_session.add(models.Student(
            student_id=student_id, name=f"학생{student_id[-1]}", password_hash="x",
        ))
    batch = models.ScheduleBatch(
        department_id=2, period_start=WEEK1, period_end=PERIOD_END,
        status="confirmed", created_by="STF001", solver_summary={"status": "OPTIMAL"},
    )
    db_session.add(batch)
    db_session.flush()

    rows = []
    for offset in range(14):  # 2주 매일 1건씩
        row = models.WorkSchedule(
            batch_id=batch.batch_id, student_id="20220001", department_id=2,
            work_date=WEEK1 + datetime.timedelta(days=offset),
            start_time=datetime.time(9, 0), end_time=datetime.time(12, 0),
        )
        db_session.add(row)
        rows.append(row)
    db_session.flush()

    db_session.add(models.SubstituteRequest(
        schedule_id=rows[1].schedule_id, work_date=rows[1].work_date, department_id=2,
        start_time=rows[1].start_time, end_time=rows[1].end_time,
        requester_id="20220001", status="대기", reason="시험",
    ))
    db_session.commit()
    return batch


def test_clears_only_the_requested_week(script, db_session, seeded):
    report = script.clear_range(db_session, 2, WEEK1, WEEK1_END)
    db_session.commit()

    assert report["moved_total"] == 7
    assert _effective_rows(db_session, 2, WEEK1, WEEK1_END) == []
    assert len(_effective_rows(db_session, 2, WEEK2, PERIOD_END)) == 7


def test_keeps_history_and_substitute_request(script, db_session, seeded):
    report = script.clear_range(db_session, 2, WEEK1, WEEK1_END)
    db_session.commit()

    # 근무 행은 남아 있고 superseded 배치로만 옮겨졌다
    assert db_session.query(models.WorkSchedule).count() == 14
    split_id = report["batches"][0]["moved_batch_id"]
    split = db_session.get(models.ScheduleBatch, split_id)
    assert split.status == "superseded"
    assert (split.period_start, split.period_end) == (WEEK1, WEEK1_END)

    # 대타 요청은 FK가 살아 있는 채로 그대로 남는다
    request = db_session.query(models.SubstituteRequest).one()
    assert db_session.get(models.WorkSchedule, request.schedule_id) is not None
    assert report["substitute_requests"][0]["request_id"] == request.request_id


def test_narrows_the_remaining_batch_period(script, db_session, seeded):
    script.clear_range(db_session, 2, WEEK1, WEEK1_END)
    db_session.commit()

    assert (seeded.period_start, seeded.period_end) == (WEEK2, PERIOD_END)
    assert seeded.status == "confirmed"
    assert seeded.solver_summary == {"status": "OPTIMAL"}


def test_rerun_changes_nothing(script, db_session, seeded):
    script.clear_range(db_session, 2, WEEK1, WEEK1_END)
    db_session.commit()
    batches_before = db_session.query(models.ScheduleBatch).count()

    report = script.clear_range(db_session, 2, WEEK1, WEEK1_END)
    db_session.commit()

    assert report["moved_total"] == 0
    assert report["batches"] == []
    assert db_session.query(models.ScheduleBatch).count() == batches_before


def test_whole_batch_inside_range_is_superseded_in_place(script, db_session, seeded):
    report = script.clear_range(db_session, 2, WEEK1, PERIOD_END)
    db_session.commit()

    assert report["batches"][0]["moved_batch_id"] == seeded.batch_id
    assert seeded.status == "superseded"
    assert (seeded.period_start, seeded.period_end) == (WEEK1, PERIOD_END)
    assert db_session.query(models.ScheduleBatch).count() == 1
