from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.services import display_status, require_own_department

router = APIRouter(prefix="/api/postings", tags=["postings"])


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

    staff = require_own_department(
        db, current_user, payload.department_id, "본인 소속 부서의 공고만 등록할 수 있습니다."
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
        # 마감일이 지난 공고는 DB status와 무관하게 "마감"으로 취급 (_display_status와 동일 기준)
        today = date.today()
        if status == "마감":
            query = query.filter(
                (models.JobPosting.status == "마감")
                | (models.JobPosting.deadline < today)
            )
        elif status == "모집중":
            query = query.filter(
                models.JobPosting.status == "모집중",
                (models.JobPosting.deadline.is_(None))
                | (models.JobPosting.deadline >= today),
            )
        else:
            query = query.filter(models.JobPosting.status == status)

    postings = query.all()
    return [
        schemas.JobPostingListItem(
            posting_id=posting.posting_id,
            title=posting.title,
            department_name=posting.department.name if posting.department else None,
            upload_date=posting.upload_date,
            deadline=posting.deadline,
            status=display_status(posting),
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
        status=display_status(posting),
    )
