from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import auth, models


def display_status(posting: models.JobPosting) -> str:
    if posting.deadline is not None and posting.deadline < date.today():
        return "마감"
    return posting.status


def require_own_department(
    db: Session,
    current_user: auth.CurrentUser,
    department_id: Optional[int],
    detail: str,
) -> models.Staff:
    staff = db.query(models.Staff).filter(models.Staff.staff_id == current_user.id).first()
    if staff is None or staff.department_id != department_id:
        raise HTTPException(status_code=403, detail=detail)
    return staff
