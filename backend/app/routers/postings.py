from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/postings", tags=["postings"])


def _display_status(posting: models.JobPosting) -> str:
    if posting.deadline is not None and posting.deadline < date.today():
        return "마감"
    return posting.status


@router.post("", response_model=schemas.JobPostingCreateOut, status_code=status.HTTP_201_CREATED)
def create_posting(
    payload: schemas.JobPostingCreate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == payload.department_id)
        .first()
    )
    if department is None:
        raise HTTPException(status_code=404, detail="해당 부서를 찾을 수 없습니다.")

    staff = db.query(models.Staff).filter(models.Staff.staff_id == current_user.id).first()
    if staff is None or staff.department_id != payload.department_id:
        raise HTTPException(
            status_code=403, detail="본인 소속 부서의 공고만 등록할 수 있습니다."
        )

    posting = models.JobPosting(
        department_id=payload.department_id,
        created_by=current_user.id,
        title=payload.title,
        description=payload.description,
        qualification=payload.qualification,
        upload_date=date.today(),
        deadline=payload.deadline,
        status="모집중",
    )
    db.add(posting)
    db.commit()
    db.refresh(posting)
    return posting


@router.get("", response_model=list[schemas.JobPostingListItem])
def list_postings(
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.JobPosting)
    if department_id is not None:
        query = query.filter(models.JobPosting.department_id == department_id)
    if status is not None:
        query = query.filter(models.JobPosting.status == status)

    postings = query.all()
    return [
        schemas.JobPostingListItem(
            posting_id=posting.posting_id,
            title=posting.title,
            department_name=posting.department.name if posting.department else None,
            upload_date=posting.upload_date,
            deadline=posting.deadline,
            status=_display_status(posting),
        )
        for posting in postings
    ]


@router.get("/{posting_id}", response_model=schemas.JobPostingDetail)
def get_posting(
    posting_id: int,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    posting = (
        db.query(models.JobPosting)
        .filter(models.JobPosting.posting_id == posting_id)
        .first()
    )
    if posting is None:
        raise HTTPException(status_code=404, detail="해당 공고를 찾을 수 없습니다.")

    return schemas.JobPostingDetail(
        posting_id=posting.posting_id,
        department_id=posting.department_id,
        department_name=posting.department.name if posting.department else None,
        created_by=posting.created_by,
        title=posting.title,
        description=posting.description,
        qualification=posting.qualification,
        upload_date=posting.upload_date,
        deadline=posting.deadline,
        status=_display_status(posting),
    )
