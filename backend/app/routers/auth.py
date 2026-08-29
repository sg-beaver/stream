from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    invalid_credentials = HTTPException(
        status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다."
    )

    if payload.role == "student":
        user = db.query(models.Student).filter(models.Student.student_id == payload.id).first()
    else:
        user = db.query(models.Staff).filter(models.Staff.staff_id == payload.id).first()

    if user is None or not auth.verify_password(payload.password, user.password_hash):
        raise invalid_credentials

    token = auth.create_access_token({"sub": payload.id, "role": payload.role})
    is_team_lead = payload.role == "student" and bool(user.is_team_lead)
    if payload.role == "staff":
        department = user.department
    elif is_team_lead:
        # 학생팀장은 근무표 편성 화면을 쓰므로 부서 스코프가 필요하다 (#156).
        # 부서 판정 기준은 근로 학생과 같다 — 합격 공고의 부서
        department = _team_lead_department(db, user.student_id)
    else:
        department = None
    return schemas.LoginResponse(
        token=token,
        role=payload.role,
        name=user.name,
        department_id=department.department_id if department else None,
        department_name=department.name if department else None,
        major=user.department_name if payload.role == "student" else None,
        is_team_lead=is_team_lead,
        course_ta_enabled=bool(department.course_ta_enabled) if department else False,
    )


def _team_lead_department(db: Session, student_id: str):
    """학생팀장이 일하는 부서 — 합격 공고의 부서. 여러 곳이면 가장 이른 공고 기준."""
    row = (
        db.query(models.Department)
        .join(models.JobPosting, models.JobPosting.department_id == models.Department.department_id)
        .join(models.Application, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.Application.student_id == student_id,
            models.Application.status == "합격",
        )
        .order_by(models.JobPosting.posting_id)
        .first()
    )
    return row


# TODO: 회원가입 엔드포인트 구현
