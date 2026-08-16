"""대타 API (API_SPEC 5장 — REQ-SUB-001~007).

- POST  /api/substitute-requests                    대타 요청 등록 (학생, REQ-SUB-001)
- GET   /api/substitute-requests/{id}/candidates     대타 후보 탐색 (학생/직원, REQ-SUB-002)
- PATCH /api/substitute-requests/{id}/respond        후보의 수락/거절 (학생, REQ-SUB-003)
- PATCH /api/substitute-requests/{id}/approve        직원 최종 승인 (직원, REQ-SUB-004/005/006)
- GET   /api/substitute-requests/department/{id}     부서 대타 요청 전체 조회 (직원, REQ-SUB-007)

확정된 근무를 못 나가게 된 학생이 요청을 올리면, 그 시간대에 가능하고(가능시간 등록됨)
아직 다른 근무가 없는 같은 부서 학생 중에서 후보를 찾는다. 후보가 수락해도 담당 직원이
최종 승인하기 전까지는 근무표에 반영되지 않는다 — 최종 결정은 항상 사람(직원)이 한다.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.services import get_department_student_ids, require_own_department

router = APIRouter(prefix="/api/substitute-requests", tags=["substitutes"])

# SubstituteRequest.status 값
_STATUS_PENDING = "대기"
_STATUS_ACCEPTED = "수락"
_STATUS_APPROVED = "승인"
# 근무표 조회에서 "실제 근무로 인정하는" 배치 상태 (schedule.py의 _EFFECTIVE_STATUSES와 동일 관례)
_EFFECTIVE_BATCH_STATUSES = ("confirmed", "manual")


def _get_request_or_404(db: Session, request_id: int) -> models.SubstituteRequest:
    request = (
        db.query(models.SubstituteRequest)
        .filter(models.SubstituteRequest.request_id == request_id)
        .first()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="해당 대타 요청을 찾을 수 없습니다.")
    return request


def _find_candidates(
    db: Session, schedule: models.WorkSchedule, exclude_student_id: str | None
) -> list[schemas.SubstituteCandidateItem]:
    """해당 시간대에 가능하고 겹치는 근무가 없는 같은 부서 학생을 찾는다 (REQ-SUB-002)."""
    student_ids = [
        sid
        for sid in get_department_student_ids(db, schedule.department_id)
        if sid != exclude_student_id
    ]
    if not student_ids:
        return []

    day_of_week = schedule.work_date.isoweekday()  # 월=1 ~ 일=7, AvailableTime과 동일 기준
    available_ids = {
        row.student_id
        for row in db.query(models.AvailableTime)
        .filter(
            models.AvailableTime.student_id.in_(student_ids),
            models.AvailableTime.day_of_week == day_of_week,
            models.AvailableTime.start_time <= schedule.start_time,
            models.AvailableTime.end_time >= schedule.end_time,
        )
        .all()
    }
    if not available_ids:
        return []

    busy_ids = {
        row.student_id
        for row in db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.student_id.in_(available_ids),
            models.WorkSchedule.work_date == schedule.work_date,
            models.ScheduleBatch.status.in_(_EFFECTIVE_BATCH_STATUSES),
            models.WorkSchedule.start_time < schedule.end_time,
            models.WorkSchedule.end_time > schedule.start_time,
        )
        .all()
    }

    candidate_ids = sorted(available_ids - busy_ids)
    name_by_id = {
        student.student_id: student.name
        for student in db.query(models.Student).filter(
            models.Student.student_id.in_(candidate_ids)
        )
    }
    return [
        schemas.SubstituteCandidateItem(student_id=sid, name=name_by_id.get(sid))
        for sid in candidate_ids
    ]


@router.post(
    "",
    response_model=schemas.SubstituteRequestCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_substitute_request(
    payload: schemas.SubstituteRequestCreate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 대타 요청을 등록할 수 있습니다.")

    schedule = (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.schedule_id == payload.schedule_id,
            models.ScheduleBatch.status.in_(_EFFECTIVE_BATCH_STATUSES),
        )
        .first()
    )
    if schedule is None or schedule.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인의 근무 일정만 대타 요청할 수 있습니다.")

    already_open = (
        db.query(models.SubstituteRequest)
        .filter(
            models.SubstituteRequest.schedule_id == payload.schedule_id,
            models.SubstituteRequest.status.in_(
                (_STATUS_PENDING, _STATUS_ACCEPTED, _STATUS_APPROVED)
            ),
        )
        .first()
    )
    if already_open is not None:
        raise HTTPException(status_code=409, detail="이미 처리 중인 대타 요청이 있습니다.")

    request = models.SubstituteRequest(
        schedule_id=payload.schedule_id,
        requester_id=current_user.id,
        status=_STATUS_PENDING,
        reason=payload.reason,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get(
    "/department/{department_id}",
    response_model=list[schemas.SubstituteRequestListItem],
)
def list_department_substitute_requests(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 소속 근무에 걸린 대타 요청을 전체 조회한다 (직원 전용, REQ-SUB-007)."""
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 대타 요청만 조회할 수 있습니다."
    )

    rows = (
        db.query(models.SubstituteRequest)
        .join(models.WorkSchedule, models.SubstituteRequest.schedule_id == models.WorkSchedule.schedule_id)
        .filter(models.WorkSchedule.department_id == department_id)
        .order_by(models.SubstituteRequest.requested_at.desc())
        .all()
    )
    return [
        schemas.SubstituteRequestListItem(
            request_id=r.request_id,
            requester_id=r.requester_id,
            requester_name=r.requester.name if r.requester else None,
            department_name=r.schedule.department.name if r.schedule.department else None,
            date=r.schedule.work_date,
            start_time=r.schedule.start_time,
            end_time=r.schedule.end_time,
            reason=r.reason,
            requested_at=r.requested_at,
            status=r.status,
            substitute_id=r.substitute_id,
            substitute_name=r.substitute.name if r.substitute else None,
            approved_by=r.approved_by,
            approver_name=r.approver.name if r.approver else None,
        )
        for r in rows
    ]


@router.get(
    "/{request_id}/candidates",
    response_model=list[schemas.SubstituteCandidateItem],
)
def list_substitute_candidates(
    request_id: int,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    request = _get_request_or_404(db, request_id)

    if current_user.role == "staff":
        require_own_department(
            db,
            current_user,
            request.schedule.department_id,
            "본인 소속 부서의 대타 요청만 조회할 수 있습니다.",
        )
    elif current_user.id != request.requester_id:
        raise HTTPException(status_code=403, detail="본인의 대타 요청만 조회할 수 있습니다.")

    return _find_candidates(db, request.schedule, request.requester_id)


@router.patch(
    "/{request_id}/respond",
    response_model=schemas.SubstituteRequestStatusOut,
)
def respond_to_substitute_request(
    request_id: int,
    payload: schemas.SubstituteRespondIn,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 응답할 수 있습니다.")
    if current_user.id != payload.substitute_id:
        raise HTTPException(status_code=403, detail="본인 명의로만 응답할 수 있습니다.")

    request = _get_request_or_404(db, request_id)

    if request.status in (_STATUS_ACCEPTED, _STATUS_APPROVED):
        raise HTTPException(
            status_code=409, detail="이미 다른 학생이 수락했거나 승인된 요청입니다."
        )

    if payload.response == "수락":
        request.substitute_id = payload.substitute_id
        request.status = _STATUS_ACCEPTED
        db.commit()
        db.refresh(request)
    # 거절은 이 후보의 의사만 확인하는 것 — 다른 후보가 계속 수락할 수 있도록
    # 요청 상태("대기")는 바꾸지 않는다.

    return schemas.SubstituteRequestStatusOut(request_id=request.request_id, status=request.status)


@router.patch(
    "/{request_id}/approve",
    response_model=schemas.SubstituteApproveOut,
)
def approve_substitute_request(
    request_id: int,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    request = _get_request_or_404(db, request_id)

    require_own_department(
        db,
        current_user,
        request.schedule.department_id,
        "본인 소속 부서의 대타 요청만 승인할 수 있습니다.",
    )

    if request.status != _STATUS_ACCEPTED:
        raise HTTPException(status_code=400, detail="아직 후보자가 수락하지 않았습니다.")

    # REQ-SUB-005: 원래 근무자의 근무표는 취소되고, 대타 학생의 근무표로 그대로 교체된다
    # (같은 schedule 행의 student_id만 바꾼다 — batch·날짜·시간은 그대로 유지).
    request.schedule.student_id = request.substitute_id
    request.status = _STATUS_APPROVED
    request.approved_by = current_user.id
    db.commit()
    db.refresh(request)

    return schemas.SubstituteApproveOut(
        request_id=request.request_id,
        status=request.status,
        approved_by=request.approved_by,
    )
