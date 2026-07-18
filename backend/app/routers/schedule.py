"""근무표 API (API_SPEC 4장 — REQ-SCHED).

- POST /api/availability          가능 시간 등록 (학생, REQ-SCHED-001)
- POST /api/schedule/generate     제약조건 기반 근무표 생성 (직원, REQ-SCHED-006)

가능시간 수합 조회·확정 근무표 조회·수동 등록은 후속 작업.
generate는 아직 DB가 아닌 scheduler/config의 수합 데이터를 사용한다.

생성 단위는 2주(기본값)를 권장한다 — 2주 교비 총합 제약과 정합하고,
동기 응답이 가능한 풀이 시간(수십 초 이내)이 나온다. 학기 전체 생성이
필요해지면 job 기반 비동기(202 + 폴링)로 확장한다.
"""

from datetime import date

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
from app.services import require_own_department

router = APIRouter(prefix="/api", tags=["schedule"])


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

    hired_student_ids = (
        db.query(models.Application.student_id)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.JobPosting.department_id == department_id,
            models.Application.status == "합격",
        )
        .distinct()
    )

    availabilities = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id.in_(hired_student_ids))
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


# TODO: 팀 컨벤션 확정 후 app/schemas.py로 이동
class ScheduleGenerateIn(BaseModel):
    department_id: int
    start_date: date = Field(description="스케줄링 시작일 (월요일 권장)")
    num_days: int = Field(default=14, ge=1, le=28, description="기간 일수 (2주 권장)")
    time_limit_seconds: float = Field(default=30.0, ge=1, le=120, description="해 하나당 시간 제한")
    num_alternatives: int = Field(
        default=1, ge=1, le=5, description="동률 배정안 개수 (여러 개면 비교 후 선택)"
    )


@router.post("/schedule/generate")
def generate(
    payload: ScheduleGenerateIn,
    current_user: auth.CurrentUser = Depends(auth.require_staff),  # REQ-SCHED-006
):
    # TODO(DB): 직원 본인 소속 부서 검증 (REQ-POST-007과 동일 패턴,
    # services.require_own_department) — 부서가 늘어나기 전에 반드시 추가
    """제약조건 기반 근무표 생성 (직원 전용).

    응답에는 배정 목록과 함께 담당자 판단 근거(부족 슬롯·가능 후보·
    페널티 내역·개인별 집계)가 포함된다. 결과는 초안이며 확정은 별도
    플로우로 처리한다 (TODO: draft 저장 → 수동 조정 → confirm).
    """
    try:
        return generate_schedule(
            GenerateRequest(
                department_id=payload.department_id,
                start_date=payload.start_date,
                num_days=payload.num_days,
                time_limit_seconds=payload.time_limit_seconds,
                num_alternatives=payload.num_alternatives,
            )
        )
    except DepartmentNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ScheduleInfeasible as exc:
        # API_SPEC: 409 — 제약조건을 만족하는 근무표를 생성할 수 없음 (증명됨)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ScheduleTimeout as exc:
        # 해 없음이 증명된 게 아니라 시간 초과 — 409와 구분해 504로 응답
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc))
