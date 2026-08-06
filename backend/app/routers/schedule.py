"""근무표 API (API_SPEC 4장 — REQ-SCHED).

- POST /api/availability                    가능 시간 등록 (학생, REQ-SCHED-001)
- GET  /api/availability/department/{id}    부서 가능 시간 수합 조회 (직원, REQ-SCHED-002)
- POST /api/availability/exceptions         날짜별 예외 등록 (학생, 이슈 #36 B안)
- GET  /api/availability/exceptions/me      본인 예외 목록 조회 (학생, 이슈 #36 B안)
- POST /api/schedule/generate               제약조건 기반 근무표 생성 (직원, REQ-SCHED-006)

generate는 가능시간을 DB에서 조회해 계산하고, 결과를 ScheduleBatch(status="draft")
+ WorkSchedule로 저장한다. 같은 부서·기간으로 재호출하면 기존 draft만 교체하고
confirmed 배치는 건드리지 않는다. 확정(confirm) 조회·수동 등록은 후속 작업.

생성 단위는 2주(기본값)를 권장한다 — 2주 교비 총합 제약과 정합하고,
동기 응답이 가능한 풀이 시간(수십 초 이내)이 나온다. 학기 전체 생성이
필요해지면 job 기반 비동기(202 + 폴링)로 확장한다.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.scheduler.service import (
    DepartmentNotFound,
    GenerateRequest,
    ScheduleInfeasible,
    ScheduleTimeout,
    generate_schedule,
)
from app.services import get_department_student_ids, require_own_department

router = APIRouter(prefix="/api", tags=["schedule"])


def _resolve_student_department_id(db: Session, student_id: str) -> int | None:
    """학생이 합격한 공고를 기준으로 소속 부서를 판정한다 (REQ-SCHED-002와 동일 패턴)."""
    application = (
        db.query(models.Application)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.Application.student_id == student_id,
            models.Application.status == "합격",
        )
        .first()
    )
    return application.posting.department_id if application else None


@router.post(
    "/availability",
    response_model=schemas.AvailabilityCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_availability(
    payload: schemas.AvailabilityCreate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 가능 시간을 등록할 수 있습니다.")

    availability = models.AvailableTime(
        student_id=current_user.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        preference=payload.preference,
    )
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability


@router.get(
    "/availability/department/{department_id}",
    response_model=list[schemas.AvailabilityDepartmentItem],
)
def list_department_availability(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="직원만 조회할 수 있습니다.")

    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )
    if department is None:
        raise HTTPException(status_code=404, detail="해당 부서를 찾을 수 없습니다.")

    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 가능 시간만 조회할 수 있습니다."
    )

    student_ids = get_department_student_ids(db, department_id)

    availabilities = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id.in_(student_ids))
        .all()
    )
    return [
        schemas.AvailabilityDepartmentItem(
            student_name=availability.student.name if availability.student else None,
            day_of_week=availability.day_of_week,
            start_time=availability.start_time,
            end_time=availability.end_time,
        )
        for availability in availabilities
    ]


@router.post(
    "/availability/exceptions",
    response_model=schemas.AvailabilityExceptionCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_availability_exception(
    payload: schemas.AvailabilityExceptionCreate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 예외를 등록할 수 있습니다.")

    department_id = _resolve_student_department_id(db, current_user.id)
    if department_id is None:
        raise HTTPException(status_code=403, detail="소속 부서 정보를 확인할 수 없습니다.")

    policy = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
    availability_mode = policy.availability_mode if policy else "weekly_only"

    if availability_mode == "weekly_only":
        raise HTTPException(status_code=403, detail="이 부서는 예외 등록을 허용하지 않습니다.")
    if (
        availability_mode == "weekly_with_unavailable"
        and payload.exception_type == "AVAILABLE"
    ):
        raise HTTPException(status_code=403, detail="이 부서는 근무 불가 신고만 허용합니다.")

    exception = models.AvailabilityException(
        student_id=current_user.id,
        exception_date=payload.exception_date,
        exception_type=payload.exception_type,
        start_time=payload.start_time,
        end_time=payload.end_time,
        preference=payload.preference,
    )
    db.add(exception)
    db.commit()
    db.refresh(exception)
    return exception


@router.get(
    "/availability/exceptions/me",
    response_model=list[schemas.AvailabilityExceptionItem],
)
def list_my_availability_exceptions(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    exceptions = (
        db.query(models.AvailabilityException)
        .filter(models.AvailabilityException.student_id == current_user.id)
        .all()
    )
    return exceptions


# TODO: 팀 컨벤션 확정 후 app/schemas.py로 이동
class ScheduleGenerateIn(BaseModel):
    department_id: int
    start_date: date = Field(description="스케줄링 시작일 (월요일 권장)")
    num_days: int = Field(default=14, ge=1, le=28, description="기간 일수 (2주 권장)")
    time_limit_seconds: float = Field(default=30.0, ge=1, le=120, description="해 하나당 시간 제한")
    num_alternatives: int = Field(
        default=1, ge=1, le=5, description="동률 배정안 개수 (여러 개면 비교 후 선택)"
    )


def _parse_hhmm(value: str):
    return datetime.strptime(value, "%H:%M").time()


def _replace_draft_batch(
    db: Session,
    department_id: int,
    period_start: date,
    period_end: date,
    created_by: str,
    schedules: list[dict],
) -> tuple[int, int]:
    """같은 부서·기간의 기존 draft 배치를 새 결과로 교체한다 (confirmed는 건드리지 않음)."""
    existing_batch = (
        db.query(models.ScheduleBatch)
        .filter(
            models.ScheduleBatch.department_id == department_id,
            models.ScheduleBatch.period_start == period_start,
            models.ScheduleBatch.period_end == period_end,
            models.ScheduleBatch.status == "draft",
        )
        .first()
    )
    if existing_batch is not None:
        db.query(models.WorkSchedule).filter(
            models.WorkSchedule.batch_id == existing_batch.batch_id
        ).delete(synchronize_session=False)
        db.delete(existing_batch)
        db.flush()

    batch = models.ScheduleBatch(
        department_id=department_id,
        period_start=period_start,
        period_end=period_end,
        status="draft",
        created_by=created_by,
    )
    db.add(batch)
    db.flush()  # batch_id 확보

    work_schedules = [
        models.WorkSchedule(
            batch_id=batch.batch_id,
            student_id=row["student_id"],
            department_id=department_id,
            work_date=date.fromisoformat(row["date"]),
            start_time=_parse_hhmm(row["start_time"]),
            end_time=_parse_hhmm(row["end_time"]),
        )
        for row in schedules
    ]
    db.add_all(work_schedules)

    return batch.batch_id, len(work_schedules)


@router.post("/schedule/generate")
def generate(
    payload: ScheduleGenerateIn,
    current_user: auth.CurrentUser = Depends(auth.require_staff),  # REQ-SCHED-006
    db: Session = Depends(get_db),
):
    # TODO(DB): 직원 본인 소속 부서 검증 (REQ-POST-007과 동일 패턴,
    # services.require_own_department) — 부서가 늘어나기 전에 반드시 추가
    """제약조건 기반 근무표 생성 (직원 전용).

    응답에는 배정 목록과 함께 담당자 판단 근거(부족 슬롯·가능 후보·
    페널티 내역·개인별 집계)가 포함된다. 결과는 draft 상태 ScheduleBatch +
    WorkSchedule로 저장되며, 확정(confirm)은 별도 플로우로 처리한다.
    """
    try:
        response = generate_schedule(
            GenerateRequest(
                department_id=payload.department_id,
                start_date=payload.start_date,
                num_days=payload.num_days,
                time_limit_seconds=payload.time_limit_seconds,
                num_alternatives=payload.num_alternatives,
            ),
            db,
        )
    except DepartmentNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ScheduleInfeasible as exc:
        # API_SPEC: 409 — 제약조건을 만족하는 근무표를 생성할 수 없음 (증명됨)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ScheduleTimeout as exc:
        # 해 없음이 증명된 게 아니라 시간 초과 — 409와 구분해 504로 응답
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc))

    period_start = payload.start_date
    period_end = period_start + timedelta(days=payload.num_days - 1)

    try:
        batch_id, saved_count = _replace_draft_batch(
            db,
            department_id=payload.department_id,
            period_start=period_start,
            period_end=period_end,
            created_by=current_user.id,
            schedules=response["schedules"],
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="근무표 저장에 실패했습니다.",
        ) from exc

    response["batch_id"] = batch_id
    response["saved_schedule_count"] = saved_count
    return response
