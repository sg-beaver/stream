"""학생 정보 API.

- GET   /api/students/department/{department_id}      부서 소속 학생 정보 조회 (직원·학생팀장)
- PATCH /api/students/{student_id}/active-period      활동 기간 수정 (직원)
- PATCH /api/students/{student_id}/team-lead          학생팀장 지정/해제 (직원)
- GET   /api/students/me/common-application           내 공통 지원서 조회 (학생)
- PUT   /api/students/me/common-application           내 공통 지원서 저장 (학생)

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
from app.services import (
    get_department_student_ids,
    require_own_department,
    require_own_department_or_lead,
    require_schedule_editor,
)

router = APIRouter(prefix="/api", tags=["students"])


def _require_own_department_student(
    db: Session, current_user: auth.CurrentUser, student_id: str
) -> models.Student:
    """직원 본인 부서(합격 기준) 소속 학생을 가져온다. 아니면 403, 없으면 404."""
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == student_id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="해당 학생을 찾을 수 없습니다.")
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
    return student


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
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """부서 소속 학생의 기본 정보(학과·연락처·재원 구분)와 활동 기간을 돌려준다.

    학생 관리 화면이 공고×지원자 API를 여러 번 호출해 명단만 조합하던 것을
    한 번의 호출로 대체한다 (학과 등 학생 정보는 이 API가 유일한 노출 경로).
    """
    require_own_department_or_lead(
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
                "is_team_lead": bool(student.is_team_lead),
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
    student = _require_own_department_student(db, current_user, student_id)

    if (
        payload.active_from is not None
        and payload.active_until is not None
        and payload.active_from > payload.active_until
    ):
        raise HTTPException(status_code=400, detail="활동 시작일이 종료일보다 늦습니다.")

    student.active_from = payload.active_from
    student.active_until = payload.active_until
    if "funding_type" in payload.model_fields_set:
        student.funding_type = payload.funding_type
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
        is_team_lead=bool(student.is_team_lead),
    )


@router.patch(
    "/students/{student_id}/team-lead",
    response_model=schemas.DepartmentStudentItem,
)
def update_student_team_lead(
    student_id: str,
    payload: schemas.StudentTeamLeadUpdate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """근로 학생을 학생팀장으로 지정하거나 해제한다 (직원 전용, #156).

    학생팀장은 부서 근무표를 편성할 수 있다 — 생성·확정·draft 편집·검토 챗봇·
    배치 검증·부서 수합 조회. 대타 승인이나 부서 정책 변경은 열리지 않는다
    (권한 범위는 services.require_schedule_editor 참고).

    지정 권한 자체는 직원만 가진다. 학생팀장이 다른 학생을 팀장으로 만들 수 있으면
    권한 경계가 스스로 넓어지기 때문이다.
    """
    student = _require_own_department_student(db, current_user, student_id)
    student.is_team_lead = payload.is_team_lead
    db.commit()

    stored = student.active_from is not None or student.active_until is not None
    return schemas.DepartmentStudentItem(
        student_id=student.student_id,
        name=student.name,
        department_name=student.department_name,
        phone=student.phone,
        funding_type=student.funding_type,
        active_from=student.active_from,
        active_until=student.active_until,
        active_source="student" if stored else "posting",
        is_team_lead=bool(student.is_team_lead),
    )


# ---- 공통 지원서 (#122) ----
# 기본 인적사항의 SAINT 학적 항목은 읽기 전용이고, 학생이 바꾸는 건 연락처·이메일뿐이다.
# 경력·어학·자격증은 화면 전체 저장 방식이라 저장 시 학생 소유 행을 전량 교체한다 —
# 표에서 행을 지우고 순서를 바꾸는 편집을 부분 갱신으로 맞추려면 클라이언트가 행 id를
# 관리해야 하는데, 그만한 이득이 없다.

_HISTORY_TABLES = (
    ("careers", models.StudentCareer),
    ("languages", models.StudentLanguage),
    ("certificates", models.StudentCertificate),
)


def _require_student(current_user: auth.CurrentUser) -> None:
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 사용할 수 있습니다.")


def _get_me(db: Session, current_user: auth.CurrentUser) -> models.Student:
    _require_student(current_user)
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == current_user.id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def _build_common_application(student: models.Student) -> schemas.CommonApplicationOut:
    def rows(items):
        return sorted(items, key=lambda x: (x.sort_order or 0, x.__class__.__name__))

    return schemas.CommonApplicationOut(
        basic=schemas.CommonApplicationBasic.model_validate(student),
        careers=[schemas.CareerItem.model_validate(c) for c in rows(student.careers)],
        languages=[
            schemas.LanguageItem.model_validate(l) for l in rows(student.languages)
        ],
        certificates=[
            schemas.CertificateItem.model_validate(c)
            for c in rows(student.certificates)
        ],
    )


@router.get(
    "/students/me/common-application",
    response_model=schemas.CommonApplicationOut,
)
def get_my_common_application(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """내 공통 지원서를 조회한다. (학생 전용, REQ-PROFILE-001)"""
    return _build_common_application(_get_me(db, current_user))


@router.put(
    "/students/me/common-application",
    response_model=schemas.CommonApplicationOut,
)
def put_my_common_application(
    payload: schemas.CommonApplicationIn,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """내 공통 지원서를 저장한다. (학생 전용, REQ-PROFILE-002)

    연락처·이메일과 경력·어학·자격증 목록만 반영한다. 학과·학기 등 SAINT 학적
    항목은 요청 본문에 있어도 무시된다(스키마에서 아예 받지 않는다).
    """
    student = _get_me(db, current_user)

    # 화면 전체 저장이라 요청에 담긴 값이 곧 최종 상태다 — 본문에 없는 필드만 건드리지
    # 않고, null로 들어온 값은 "지웠다"로 본다. (null=무시로 두면 학생이 이메일을 비울
    # 방법이 없어진다)
    fields_sent = payload.basic.model_fields_set
    if "phone" in fields_sent:
        student.phone = payload.basic.phone
    if "email" in fields_sent:
        student.email = payload.basic.email
    if "interests" in fields_sent:
        student.interests = payload.basic.interests or []

    for field, model in _HISTORY_TABLES:
        db.query(model).filter(model.student_id == student.student_id).delete(
            synchronize_session=False
        )
        for order, item in enumerate(getattr(payload, field)):
            db.add(
                model(
                    student_id=student.student_id,
                    sort_order=order,
                    **item.model_dump(),
                )
            )

    db.commit()
    db.refresh(student)
    return _build_common_application(student)
