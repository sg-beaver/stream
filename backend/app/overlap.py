"""근무 시간 겹침 검증 (같은 학생·같은 날짜).

`app/work_hours.py`(주간 상한)·`app/opening_hours.py`(개관 시간)와 같은 이유로
라우터가 아니라 여기에 둔다 — 근무를 새로 얹는 경로가 여럿이고(확정·수동 등록·
draft 편집·대타 승인·재확정 시 대타 재적용) 모두 같은 기준을 써야 한다.

원래 `routers/schedule.py` 안에만 있어서 대타 라우터가 부를 수 없었고, 그래서
대타 수락·승인이 **이미 그 시간에 근무가 있는 학생도 그대로 통과**시켰다.
상한 검사가 #159에서 겪은 일과 같은 모양이다.
"""

from datetime import date, time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.work_hours import HOUR_LIMIT_CHECK_STATUSES


def find_overlap(
    db: Session,
    student_id: str,
    work_date: date,
    start_time: time,
    end_time: time,
    exclude_batch_ids: set[int] | None = None,
    exclude_schedule_ids: set[int] | None = None,
) -> "models.WorkSchedule | None":
    """같은 학생·같은 날짜에 시간이 겹치는 기존 배정 1건을 찾는다 (없으면 None).

    HOUR_LIMIT_CHECK_STATUSES(draft/confirmed/manual) 전체가 대상 — 완전히
    동일한 시간대 재등록도 겹침의 특수 케이스라 자연히 여기서 걸린다.

    exclude_schedule_ids: 시간이 바뀌거나 담당자가 넘어가는 행 자신 — 새 시간이
    옛 시간과 겹치는 이동(예: 30분만 미루기)을 자기 자신과의 충돌로 오판하지 않도록 뺀다.
    """
    query = (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.student_id == student_id,
            models.WorkSchedule.work_date == work_date,
            models.ScheduleBatch.status.in_(HOUR_LIMIT_CHECK_STATUSES),
            models.WorkSchedule.start_time < end_time,
            models.WorkSchedule.end_time > start_time,
        )
    )
    if exclude_batch_ids:
        query = query.filter(models.WorkSchedule.batch_id.notin_(exclude_batch_ids))
    if exclude_schedule_ids:
        query = query.filter(models.WorkSchedule.schedule_id.notin_(exclude_schedule_ids))
    return query.first()


def describe_overlap(existing: "models.WorkSchedule") -> str:
    """겹친 근무를 사람이 읽을 수 있게 — 어느 근무와 부딪혔는지 알아야 옮길 수 있다."""
    return (
        f"{existing.work_date.isoformat()} "
        f"{existing.start_time.strftime('%H:%M')}-{existing.end_time.strftime('%H:%M')}"
    )


def check_no_overlap(
    db: Session,
    student_id: str,
    work_date: date,
    start_time: time,
    end_time: time,
    exclude_batch_ids: set[int] | None = None,
    exclude_schedule_ids: set[int] | None = None,
) -> None:
    """겹치는 배정이 있으면 400."""
    existing = find_overlap(
        db, student_id, work_date, start_time, end_time,
        exclude_batch_ids, exclude_schedule_ids,
    )
    if existing is not None:
        raise HTTPException(
            status_code=400,
            detail=f"이미 {describe_overlap(existing)}에 배정이 있어 겹칩니다.",
        )
