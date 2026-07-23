from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db

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
