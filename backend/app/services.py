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


def get_department_student_ids(db: Session, department_id: int) -> list[str]:
    """department_id 소속(해당 부서 공고에 합격한) 학생 student_id 목록."""
    rows = (
        db.query(models.Application.student_id)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.JobPosting.department_id == department_id,
            models.Application.status == "합격",
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows]
