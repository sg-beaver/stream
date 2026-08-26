"""학생 정보 API.

- GET   /api/students/department/{department_id}      부서 소속 학생 정보 조회 (직원)
- PATCH /api/students/{student_id}/active-period      활동 기간 수정 (직원)

부서 소속 = 해당 부서 공고에 합격한 학생 (services.get_department_student_ids와
같은 기준). 활동 기간은 담당자가 저장한 값(Student.active_from/active_until)을
우선 쓰고, 저장한 적이 없으면 합격 공고의 period_start/period_end에서 파생한다 —
여러 공고에 합격한 학생은 가장 이른 시작 ~ 가장 늦은 종료로 합치며, 한쪽이라도
NULL(기간 미지정 공고)이면 무제한(null)으로 본다 (스케줄러 활동 기간 판정과 동일).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.services import get_department_student_ids, require_own_department

router = APIRouter(prefix="/api", tags=["students"])


def _merge_posting_period(entry: dict, posting: models.JobPosting) -> None:
    """여러 공고 합격 시 기간 합집합 — 한쪽이라도 무제한(None)이면 무제한 유지."""
    if entry["active_from"] is not None:
        entry["active_from"] = (
            None if posting.period_start is None
            else min(entry["active_from"], posting.period_start)
        )
    if entry["active_until"] is not None:
        entry["active_until"] = (
            None if posting.period_end is None
            else max(entry["active_until"], posting.period_end)
        )


@router.get(
    "/students/department/{department_id}",
    response_model=list[schemas.DepartmentStudentItem],
)
def list_department_students(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 소속 학생의 기본 정보(학과·연락처·재원 구분)와 활동 기간을 돌려준다.

    학생 관리 화면이 공고×지원자 API를 여러 번 호출해 명단만 조합하던 것을
    한 번의 호출로 대체한다 (학과 등 학생 정보는 이 API가 유일한 노출 경로).
    """
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 학생만 조회할 수 있습니다."
    )

    rows = (
        db.query(models.Application, models.JobPosting, models.Student)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .join(models.Student, models.Application.student_id == models.Student.student_id)
        .filter(
            models.JobPosting.department_id == department_id,
            models.Application.status == "합격",
        )
        .all()
    )

    by_student: dict[str, dict] = {}
    for _, posting, student in rows:
        stored = student.active_from is not None or student.active_until is not None
        entry = by_student.get(student.student_id)
        if entry is None:
            by_student[student.student_id] = {
                "student_id": student.student_id,
                "name": student.name,
                "department_name": student.department_name,
                "phone": student.phone,
                "funding_type": student.funding_type,
                # 담당자가 저장한 활동 기간이 있으면 그 값을 그대로 쓴다
                "active_from": student.active_from if stored else posting.period_start,
                "active_until": student.active_until if stored else posting.period_end,
                "active_source": "student" if stored else "posting",
            }
            continue
        if entry["active_source"] == "posting":
            _merge_posting_period(entry, posting)

    items = sorted(by_student.values(), key=lambda s: s["name"] or "")
    return [schemas.DepartmentStudentItem(**item) for item in items]


@router.patch(
    "/students/{student_id}/active-period",
    response_model=schemas.DepartmentStudentItem,
)
def update_student_active_period(
    student_id: str,
    payload: schemas.StudentActivePeriodUpdate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """학생의 활동 기간을 담당자가 직접 저장한다 (전체 교체 — null은 무제한).

    저장 이후 조회·근무표 생성은 공고 기간 대신 이 값을 기준으로 한다.
    """
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == student_id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="해당 학생을 찾을 수 없습니다.")

    # 직원 본인 부서 소속(합격) 학생인지 확인
    staff_row = (
        db.query(models.Staff)
        .filter(models.Staff.staff_id == current_user.id)
        .first()
    )
    if staff_row is None or staff_row.department_id is None:
        raise HTTPException(status_code=403, detail="소속 부서가 없는 계정입니다.")
    if student_id not in get_department_student_ids(db, staff_row.department_id):
        raise HTTPException(
            status_code=403, detail="본인 소속 부서의 학생만 수정할 수 있습니다."
        )

    if (
        payload.active_from is not None
        and payload.active_until is not None
        and payload.active_from > payload.active_until
    ):
        raise HTTPException(status_code=400, detail="활동 시작일이 종료일보다 늦습니다.")

    student.active_from = payload.active_from
    student.active_until = payload.active_until
    db.commit()

    return schemas.DepartmentStudentItem(
        student_id=student.student_id,
        name=student.name,
        department_name=student.department_name,
        phone=student.phone,
        funding_type=student.funding_type,
        active_from=student.active_from,
        active_until=student.active_until,
        active_source="student",
    )
