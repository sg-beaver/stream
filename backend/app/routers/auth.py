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
    department = user.department if payload.role == "staff" else None
    return schemas.LoginResponse(
        token=token,
        role=payload.role,
        name=user.name,
        department_id=department.department_id if department else None,
        department_name=department.name if department else None,
        major=user.department_name if payload.role == "student" else None,
    )


# TODO: 회원가입 엔드포인트 구현
