"""주간 근로 시간 상한 검증 (#159).

근무를 새로 얹는 경로가 여럿이고(확정·수동 등록·draft 편집·대타 승인) 모두
같은 상한을 지켜야 해서, 라우터가 아니라 여기에 둔다. 원래 `routers/schedule.py`
안에 있었는데 대타 승인이 그걸 부를 수 없어 상한을 지나쳤다 — 승인 한 번으로
확정 근무표가 규정 위반이 되는 경로였다.

두 가지 상한을 **둘 다** 본다. 서로 다른 개념이라 어느 한쪽만 통과해선 안 된다.

- `department.weekly_hour_limit` — 부서가 정한 운영 상한
- `funding_type`별 법정 상한 — 솔버의 `WeeklyHourLimitConstraint`(HC-TIME-1/2)와
  같은 기준. 교비는 고정값, 국가는 그 주에 학기·방학이 섞이면 낮은 쪽(보수적)
"""

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.scheduler.config import load_academic_calendar, load_department_policy
from app.scheduler.domain import FundingType
from app.scheduler.service import apply_department_overrides, resolve_policy_file_key

# 상한 검증에서 "이미 배정된 시간"으로 칠 배치 상태 — draft도 포함한다.
# confirmed/manual만 보면, generate가 만든 draft가 아직 confirm되기 전에 manual을
# 등록할 때 그 draft의 시간이 안 보여서 상한 검사를 통과시켜 버리고, 이후 draft가
# 그대로 confirm되면 합계가 상한을 넘긴 채로 검증 없이 확정된다 (실제로 재현됨).
HOUR_LIMIT_CHECK_STATUSES = ("draft", "confirmed", "manual")

_STATUS_DRAFT = "draft"


def hours_between(start, end) -> float:
    return ((end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)) / 60


def week_range(work_date: date) -> tuple[date, date]:
    week_start = work_date - timedelta(days=work_date.weekday())
    return week_start, week_start + timedelta(days=6)


def to_funding_type(raw: str | None) -> FundingType:
    """비었거나 알 수 없는 값이면 상한이 더 낮은 교비로 폴백 (scheduler와 동일 규칙)."""
    try:
        return FundingType(raw)
    except (ValueError, TypeError):
        return FundingType.GYOBI


def _department_of_batch(db: Session, batch_id: int) -> int | None:
    return (
        db.query(models.ScheduleBatch.department_id)
        .filter(models.ScheduleBatch.batch_id == batch_id)
        .scalar()
    )


def _counted_draft_by_department(
    batches: list["models.ScheduleBatch"],
    target_draft: tuple[int, int] | None,
) -> dict[int, int]:
    """부서별로 "이 주에 실제로 유효한 draft" 하나씩 — {department_id: batch_id}.

    한 부서에 기간이 겹치는 draft가 둘 이상 남아 있으면(재생성·시드 등으로 낡은
    draft가 안 지워진 경우) 그건 같은 기간에 대한 **서로 다른 계획안**이지 더해질
    근무가 아니다. 전부 합산하면 실제로는 여유가 있는 학생도 상한 초과로 거부된다
    (#212: 부서 6에 batch 4(5.5h)와 낡은 batch 6(11h)이 남아 16.5h로 집계).

    승자는 지금 편집·확정 중인 draft(target_draft)이고, 그게 없으면 나중에 만들어진
    쪽(batch_id가 큰 쪽 — autoincrement라 생성 순서와 같다)이다.
    """
    counted: dict[int, int] = {}
    if target_draft is not None:
        target_batch_id, target_department_id = target_draft
        counted[target_department_id] = target_batch_id

    for batch in batches:
        if batch.status != _STATUS_DRAFT:
            continue
        if target_draft is not None and batch.department_id == target_draft[1]:
            continue  # 대상 draft가 이미 그 부서의 승자다
        current = counted.get(batch.department_id)
        if current is None or batch.batch_id > current:
            counted[batch.department_id] = batch.batch_id
    return counted


def weekly_assigned_hours(
    db: Session,
    student_id: str,
    work_date: date,
    exclude_batch_ids: set[int] | None = None,
    exclude_schedule_ids: set[int] | None = None,
    draft_batch_id: int | None = None,
) -> float:
    """해당 주(월~일)에 이미 잡혀 있는 근무시간 합계.

    학생 단위로 부서를 가리지 않고 합산한다 — 법정 주간 상한은 학생 한 명의 총
    근무시간에 걸리는 것이라 부서로 좁히면 여러 부서에서 일하는 학생을 과소집계한다.
    대신 **같은 부서 안에서 기간이 겹치는 draft는 하나만** 센다
    (`_counted_draft_by_department`, #212).

    exclude_batch_ids: 지금 이 확정으로 없어질 배치들 — 덮어쓰려는 draft 자신과,
    같은 기간이 겹쳐 이번에 superseded로 내려갈 기존 confirmed 배치.

    exclude_schedule_ids: 시간이 바뀌거나 담당자가 넘어가는 행 자신 — 옛 값을
    합계에 넣으면 자기 자신과 중복 집계된다.

    draft_batch_id: 이번 편집·확정의 대상 draft. 그 부서에서는 이 배치만 세고
    나머지 draft는 낡은 것으로 보고 뺀다. exclude_batch_ids에 같이 들어 있어도
    (확정 경로처럼) 상관없다 — 그 부서의 draft가 통째로 빠질 뿐이라 payload와
    중복되지 않는다.
    """
    week_start, week_end = week_range(work_date)

    query = (
        db.query(models.WorkSchedule, models.ScheduleBatch)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.student_id == student_id,
            models.WorkSchedule.work_date >= week_start,
            models.WorkSchedule.work_date <= week_end,
            models.ScheduleBatch.status.in_(HOUR_LIMIT_CHECK_STATUSES),
        )
    )
    if exclude_batch_ids:
        query = query.filter(~models.WorkSchedule.batch_id.in_(exclude_batch_ids))
    if exclude_schedule_ids:
        query = query.filter(~models.WorkSchedule.schedule_id.in_(exclude_schedule_ids))

    rows = query.all()

    target_draft = None
    if draft_batch_id is not None:
        target_department_id = _department_of_batch(db, draft_batch_id)
        if target_department_id is not None:
            target_draft = (draft_batch_id, target_department_id)
    # 낡은 draft 판정은 제외 필터보다 **먼저** 정해진 승자를 기준으로 한다.
    # 대상 draft가 exclude_batch_ids에 들어 있어도 그 부서의 승자 자리는 그대로
    # 차지해야, 그 자리를 낡은 draft가 물려받아 다시 합산되는 일이 없다.
    counted_draft = _counted_draft_by_department(
        [batch for _, batch in rows], target_draft
    )

    return sum(
        hours_between(row.start_time, row.end_time)
        for row, batch in rows
        if batch.status != _STATUS_DRAFT
        or counted_draft.get(batch.department_id) == batch.batch_id
    )


def funding_weekly_cap_hours(
    department_id: int, db: Session, funding_type: FundingType, work_date: date
) -> float:
    """재원 구분별 법정 주간 상한 — 솔버의 WeeklyHourLimitConstraint와 같은 기준."""
    policy_id = resolve_policy_file_key(db, department_id)
    policy = apply_department_overrides(db, department_id, load_department_policy(policy_id))
    if funding_type == FundingType.GYOBI:
        return policy.hour_limits.gyobi_weekly_max_hours

    calendar = load_academic_calendar(work_date.year)
    week_start, _ = week_range(work_date)
    week_dates = [week_start + timedelta(days=i) for i in range(7)]
    return min(policy.hour_limits.gukga_weekly(calendar.period_type(d)) for d in week_dates)


def weekly_cap_hours(
    db: Session, department_id: int, student: "models.Student", work_date: date
) -> float:
    """그 학생에게 실제로 걸리는 상한 — 부서 운영 상한과 법정 상한 중 낮은 쪽."""
    caps = [funding_weekly_cap_hours(department_id, db, to_funding_type(student.funding_type), work_date)]
    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )
    if department is not None and department.weekly_hour_limit:
        caps.append(float(department.weekly_hour_limit))
    return min(caps)


def remaining_weekly_hours(
    db: Session,
    department_id: int,
    student: "models.Student",
    work_date: date,
    exclude_schedule_ids: set[int] | None = None,
) -> float:
    """그 주에 이 학생이 더 맡을 수 있는 시간. 음수면 이미 상한을 넘었다는 뜻."""
    assigned = weekly_assigned_hours(
        db, student.student_id, work_date, exclude_schedule_ids=exclude_schedule_ids
    )
    return weekly_cap_hours(db, department_id, student, work_date) - assigned


def check_weekly_hour_limits(
    db: Session,
    department_id: int,
    student: "models.Student",
    work_date: date,
    already_hours: float,
    added_hours: float,
) -> None:
    """부서 운영 상한과 법정 상한을 둘 다 만족하는지 검사한다. 넘으면 400."""
    total = already_hours + added_hours

    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )
    dept_limit = department.weekly_hour_limit if department else None
    if dept_limit and total > dept_limit:
        raise HTTPException(
            status_code=400,
            detail=f"해당 학생은 부서 운영 상한 주 {dept_limit}시간을 초과합니다.",
        )

    funding_type = to_funding_type(student.funding_type)
    funding_cap = funding_weekly_cap_hours(department_id, db, funding_type, work_date)
    if total > funding_cap:
        raise HTTPException(
            status_code=400,
            detail=(
                f"해당 학생은 재원 구분({funding_type.value}) 기준 법정 주간 상한 "
                f"{funding_cap}시간을 초과합니다."
            ),
        )
