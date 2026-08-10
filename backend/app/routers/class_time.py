"""수업 시간 API (REQ-SCHED-015) — SAINT 학사 연동 전까지 학생이 직접 입력하는 임시 수단.

- GET  /api/class-time/me                본인 수업 시간 슬롯 조회 (학생)
- PUT  /api/class-time/me                본인 수업 시간 슬롯 통째로 교체 (학생)
- GET  /api/class-time/department/{id}   부서 소속 학생들의 수업 시간 전체 조회 (직원)

AvailableTime의 /me 엔드포인트(REQ-SCHED-014)와 형태를 그대로 따른다 — POST 대신
PUT/GET만 있는 이유도 같다: 학생이 몇 번을 다시 저장해도 누적되지 않고 항상 현재
선택 상태 전체로 교체되어야 한다. preference 개념은 없다(수업은 선호도가 아니라
근무 불가 제약이므로).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.services import (
    get_department_student_ids,
    intervals_to_slots,
    require_own_department,
    slots_to_intervals,
)

router = APIRouter(prefix="/api/class-time", tags=["class-time"])


@router.get("/me", response_model=schemas.ClassTimeMeOut)
def get_my_class_time(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    rows = (
        db.query(models.ClassTime)
        .filter(models.ClassTime.student_id == current_user.id)
        .all()
    )
    return schemas.ClassTimeMeOut(slots=intervals_to_slots(rows))


@router.put("/me", response_model=schemas.ClassTimeMeOut)
def replace_my_class_time(
    payload: schemas.ClassTimeReplaceIn,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 등록할 수 있습니다.")

    db.query(models.ClassTime).filter(
        models.ClassTime.student_id == current_user.id
    ).delete(synchronize_session=False)

    for day, start, end in slots_to_intervals(payload.slots):
        db.add(
            models.ClassTime(
                student_id=current_user.id,
                day_of_week=day,
                start_time=start,
                end_time=end,
            )
        )
    db.commit()

    rows = (
        db.query(models.ClassTime)
        .filter(models.ClassTime.student_id == current_user.id)
        .all()
    )
    return schemas.ClassTimeMeOut(slots=intervals_to_slots(rows))


@router.get(
    "/department/{department_id}",
    response_model=list[schemas.ClassTimeDepartmentItem],
)
def list_department_class_time(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 소속(=부서 공고 합격) 학생들의 수업 시간을 전체 조회한다 (직원 전용)."""
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 수업 시간만 조회할 수 있습니다."
    )

    student_ids = get_department_student_ids(db, department_id)
    rows = (
        db.query(models.ClassTime)
        .filter(models.ClassTime.student_id.in_(student_ids))
        .all()
    )
    return [
        schemas.ClassTimeDepartmentItem(
            student_id=row.student_id,
            student_name=row.student.name if row.student else None,
            day_of_week=row.day_of_week,
            start_time=row.start_time,
            end_time=row.end_time,
        )
        for row in rows
    ]
