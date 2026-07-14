from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.services import display_status, require_own_department

router = APIRouter(prefix="/api/applications", tags=["applications"])


@router.post("", response_model=schemas.ApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: schemas.ApplicationCreate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 지원할 수 있습니다.")

    posting = (
        db.query(models.JobPosting)
        .filter(models.JobPosting.posting_id == payload.posting_id)
        .first()
    )
    if posting is None:
        raise HTTPException(status_code=404, detail="해당 공고를 찾을 수 없습니다.")

    if display_status(posting) == "마감":
        raise HTTPException(status_code=400, detail="마감된 공고입니다.")

    existing_application = (
        db.query(models.Application)
        .filter(
            models.Application.student_id == current_user.id,
            models.Application.posting_id == payload.posting_id,
        )
        .first()
    )
    if existing_application is not None:
        raise HTTPException(status_code=409, detail="이미 지원한 공고입니다.")

    application = models.Application(
        student_id=current_user.id,
        posting_id=payload.posting_id,
        cover_letter=payload.cover_letter,
        status="제출완료",
    )
    db.add(application)
    try:
        db.commit()
    except IntegrityError:
        # 동시 요청으로 사전 중복 체크를 통과한 경우 DB 유니크 제약으로 방어
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 지원한 공고입니다.")
    db.refresh(application)
    return application


@router.get("/me", response_model=list[schemas.MyApplicationItem])
def list_my_applications(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    applications = (
        db.query(models.Application)
        .filter(models.Application.student_id == current_user.id)
        .all()
    )
    return [
        schemas.MyApplicationItem(
            application_id=application.application_id,
            posting_id=application.posting_id,
            posting_title=application.posting.title if application.posting else None,
            cover_letter=application.cover_letter,
            status=application.status,
            submitted_at=application.submitted_at,
        )
        for application in applications
    ]


@router.get("/posting/{posting_id}", response_model=list[schemas.ApplicantItem])
def list_applicants_for_posting(
    posting_id: int,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="직원만 조회할 수 있습니다.")

    posting = (
        db.query(models.JobPosting)
        .filter(models.JobPosting.posting_id == posting_id)
        .first()
    )
    if posting is None:
        raise HTTPException(status_code=404, detail="해당 공고를 찾을 수 없습니다.")

    require_own_department(
        db, current_user, posting.department_id, "본인 소속 부서의 공고만 조회할 수 있습니다."
    )

    applications = (
        db.query(models.Application)
        .filter(models.Application.posting_id == posting_id)
        .all()
    )
    return [
        schemas.ApplicantItem(
            application_id=application.application_id,
            student_id=application.student_id,
            student_name=application.student.name if application.student else None,
            cover_letter=application.cover_letter,
            status=application.status,
            submitted_at=application.submitted_at,
        )
        for application in applications
    ]


@router.patch("/{application_id}/status", response_model=schemas.ApplicationOut)
def update_application_status(
    application_id: int,
    payload: schemas.ApplicationStatusUpdate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="직원만 처리할 수 있습니다.")

    application = (
        db.query(models.Application)
        .filter(models.Application.application_id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="해당 지원 내역을 찾을 수 없습니다.")

    posting = application.posting
    require_own_department(
        db,
        current_user,
        posting.department_id if posting else None,
        "본인 소속 부서의 지원 내역만 처리할 수 있습니다.",
    )

    application.status = payload.status
    application.reviewed_by = current_user.id
    db.commit()
    db.refresh(application)
    return application
