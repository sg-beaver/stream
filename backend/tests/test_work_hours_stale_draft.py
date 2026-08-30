"""같은 부서에 기간이 겹치는 낡은 draft가 남아도 주간 상한이 오탐하지 않게 (#212).

`weekly_assigned_hours()`는 학생·주 단위로만 합산해서, 부서 6에 batch 4
(실제 편집 중, 5.5h)와 시드가 남긴 batch 6(안 쓰는 draft, 11h)이 함께 있으면
16.5h로 세었다. 교비 상한 14h인 학생이 실제로는 8.5h 여유가 있는데도 1시간
추가가 "법정 주간 상한 초과"로 거부됐다 (챗봇 add_schedule·수동 등록·대타 승인이
모두 같은 함수를 쓴다).

여기서 고정하는 것:
  1. 한 부서에서 기간이 겹치는 draft는 **하나만** 센다
  2. 부서가 다르면 종전대로 합산한다 — 법정 상한은 학생 한 명의 총 근무시간에
     걸리는 것이라 부서로 좁히면 과소집계다
  3. 재생성이 낡은 draft를 실제로 지운다 — 검증에서만 빼면 확정 이후의
     수동 등록·대타 승인이 같은 이중 집계를 다시 겪는다
"""

from datetime import date, time

import pytest

from app import models
from app.routers.schedule import _overlapping_draft_batch_ids, _replace_draft_batch
from app.work_hours import weekly_assigned_hours

DEPARTMENT_ID = 6
OTHER_DEPARTMENT_ID = 2
STUDENT_ID = "20261005"
MONDAY = date(2026, 9, 7)  # 재현 사례의 그 주

EDITED_BATCH = 4   # 09/07~09/20 — 실제로 편집 중인 배치
STALE_BATCH = 6    # 08/31~09/13 — 시드가 만든, 안 쓰는 낡은 draft


def _batch(db, batch_id, department_id, period_start, period_end, status="draft"):
    batch = models.ScheduleBatch(
        batch_id=batch_id, department_id=department_id,
        period_start=period_start, period_end=period_end, status=status,
    )
    db.add(batch)
    db.flush()
    return batch


def _hours(db, batch_id, department_id, work_date, hours):
    db.add(models.WorkSchedule(
        batch_id=batch_id, student_id=STUDENT_ID, department_id=department_id,
        work_date=work_date, start_time=time(9, 0),
        end_time=time(9 + int(hours), int(round((hours % 1) * 60))),
    ))
    db.flush()


@pytest.fixture
def two_overlapping_drafts(db_session):
    """재현 조건 그대로 — 부서 6에 기간이 겹치는 draft 두 개."""
    db_session.add(models.Department(department_id=DEPARTMENT_ID, name="정보서비스팀-test"))
    db_session.add(models.Student(
        student_id=STUDENT_ID, name="김찬우", funding_type="gyobi", password_hash="x",
    ))
    _batch(db_session, EDITED_BATCH, DEPARTMENT_ID, date(2026, 9, 7), date(2026, 9, 20))
    _batch(db_session, STALE_BATCH, DEPARTMENT_ID, date(2026, 8, 31), date(2026, 9, 13))
    _hours(db_session, EDITED_BATCH, DEPARTMENT_ID, MONDAY, 5.5)
    _hours(db_session, STALE_BATCH, DEPARTMENT_ID, date(2026, 9, 8), 11)
    db_session.commit()
    return db_session


def test_stale_draft_is_not_added_to_the_edited_draft(two_overlapping_drafts):
    """편집 중인 draft를 지정하면 그 부서의 다른 draft는 세지 않는다."""
    assigned = weekly_assigned_hours(
        two_overlapping_drafts, STUDENT_ID, MONDAY, draft_batch_id=EDITED_BATCH
    )
    assert assigned == 5.5  # 16.5가 아니다 — 교비 14h 상한까지 8.5h 여유


def test_without_a_target_the_newest_draft_wins(two_overlapping_drafts):
    """대상 draft가 없는 경로(수동 등록·대타 승인)에서도 둘을 더하지는 않는다."""
    assigned = weekly_assigned_hours(two_overlapping_drafts, STUDENT_ID, MONDAY)
    assert assigned == 11  # 나중에 만들어진 batch 6 하나만


def test_other_departments_still_sum(two_overlapping_drafts):
    """법정 상한은 학생 한 명의 총 근무시간에 걸린다 — 부서로 좁히면 과소집계."""
    db = two_overlapping_drafts
    db.add(models.Department(department_id=OTHER_DEPARTMENT_ID, name="다른 부서"))
    _batch(db, 9, OTHER_DEPARTMENT_ID, date(2026, 9, 7), date(2026, 9, 20))
    _hours(db, 9, OTHER_DEPARTMENT_ID, date(2026, 9, 9), 3)
    db.commit()

    assigned = weekly_assigned_hours(db, STUDENT_ID, MONDAY, draft_batch_id=EDITED_BATCH)
    assert assigned == 8.5  # 부서 6의 5.5h + 다른 부서 3h


def test_confirmed_batch_is_still_counted_alongside_a_draft(two_overlapping_drafts):
    """draft 정리는 draft끼리만 — 확정본은 종전대로 합산된다.

    draft와 확정본의 이중 집계는 별개 규칙(_superseded_by_draft_ids)이 담당한다.
    """
    db = two_overlapping_drafts
    _batch(db, 11, DEPARTMENT_ID, date(2026, 9, 7), date(2026, 9, 20), status="confirmed")
    _hours(db, 11, DEPARTMENT_ID, date(2026, 9, 10), 2)
    db.commit()

    assigned = weekly_assigned_hours(db, STUDENT_ID, MONDAY, draft_batch_id=EDITED_BATCH)
    assert assigned == 7.5  # 5.5h draft + 2h confirmed


def test_excluded_target_draft_does_not_hand_its_slot_to_the_stale_one(two_overlapping_drafts):
    """확정 경로처럼 대상 draft를 exclude_batch_ids로 빼도, 그 자리를 낡은 draft가
    물려받아 다시 세어지면 안 된다 — payload와 이중 집계가 된다."""
    assigned = weekly_assigned_hours(
        two_overlapping_drafts, STUDENT_ID, MONDAY,
        exclude_batch_ids={EDITED_BATCH}, draft_batch_id=EDITED_BATCH,
    )
    assert assigned == 0


def test_regenerating_a_shifted_period_removes_the_stale_draft(two_overlapping_drafts):
    """기간을 옮겨 재생성하면 기간이 겹치는 낡은 draft가 남지 않는다.

    정확히 일치하는 draft만 지우던 게 이 낡은 draft를 남긴 원인이다.
    """
    db = two_overlapping_drafts
    _replace_draft_batch(
        db, DEPARTMENT_ID, date(2026, 9, 7), date(2026, 9, 20),
        created_by="STF001",
        schedules=[{
            "student_id": STUDENT_ID, "date": "2026-09-07",
            "start_time": "09:00", "end_time": "14:30",
        }],
        solver_summary={},
    )
    db.commit()

    remaining = {
        b.batch_id for b in db.query(models.ScheduleBatch)
        .filter(models.ScheduleBatch.department_id == DEPARTMENT_ID)
    }
    assert EDITED_BATCH not in remaining and STALE_BATCH not in remaining
    assert weekly_assigned_hours(db, STUDENT_ID, MONDAY) == 5.5


def test_overlapping_draft_ids_ignores_non_overlapping_periods(two_overlapping_drafts):
    db = two_overlapping_drafts
    _batch(db, 12, DEPARTMENT_ID, date(2026, 10, 5), date(2026, 10, 18))
    db.commit()

    ids = _overlapping_draft_batch_ids(db, DEPARTMENT_ID, date(2026, 9, 7), date(2026, 9, 20))
    assert ids == {EDITED_BATCH, STALE_BATCH}
