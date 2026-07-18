from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
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
