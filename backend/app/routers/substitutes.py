"""대타 API (API_SPEC 5장 — REQ-SUB-001~007).

- POST  /api/substitute-requests                    대타 요청 등록 (학생, REQ-SUB-001)
- GET   /api/substitute-requests/me                  내 대타 요청·대타 근무 기록 (학생)
- GET   /api/substitute-requests/open                내가 후보인 대기 중 요청 (학생)
- GET   /api/substitute-requests/{id}/candidates     대타 후보 탐색 (학생/직원, REQ-SUB-002)
- PATCH /api/substitute-requests/{id}/respond        후보의 수락/거절 (학생, REQ-SUB-003)
- PATCH /api/substitute-requests/{id}/approve        직원 최종 승인 (직원, REQ-SUB-004/005/006)
- PATCH /api/substitute-requests/{id}/reject         직원 반려 + 사유 (직원, REQ-SUB-008)
- GET   /api/substitute-requests/department/{id}     부서 대타 요청 전체 조회 (직원, REQ-SUB-007)

확정된 근무를 못 나가게 된 학생이 요청을 올리면, 그 시간대에 가능하고(가능시간 등록됨)
아직 다른 근무가 없는 같은 부서 학생 중에서 후보를 찾는다. 후보가 수락해도 담당 직원이
최종 승인하기 전까지는 근무표에 반영되지 않는다 — 최종 결정은 항상 사람(직원)이 한다.

부분 대타(#123): 요청 단위는 근무 한 건이 아니라 근무 안의 **연속 구간**이다. 요청
1건 = 연속 구간 1개이며, 승인 시 원 근무 행이 앞/대타/뒤 최대 3구간으로 분할된다.
후보 탐색·겹침 판정도 모두 근무 전체가 아니라 요청 구간을 기준으로 한다.
"""

from datetime import date, time

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
_STATUS_REJECTED = "반려"
# 근무표 조회에서 "실제 근무로 인정하는" 배치 상태 (schedule.py의 _EFFECTIVE_STATUSES와 동일 관례)
_EFFECTIVE_BATCH_STATUSES = ("confirmed", "manual")
# 아직 결론이 나지 않은 요청 — 구간 겹침을 막고, 승인 분할 때 함께 옮겨줘야 하는 대상
_OPEN_STATUSES = (_STATUS_PENDING, _STATUS_ACCEPTED)


def _get_request_or_404(db: Session, request_id: int) -> models.SubstituteRequest:
    request = (
        db.query(models.SubstituteRequest)
        .filter(models.SubstituteRequest.request_id == request_id)
        .first()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="해당 대타 요청을 찾을 수 없습니다.")
    return request


def _ensure_request_actionable(request: models.SubstituteRequest) -> None:
    """수락·승인 전에 요청이 아직 의미 있는지 확인한다.

    근무표가 재확정되면(superseded) 요청이 가리키는 근무 행은 어떤 시간표에도
    나타나지 않으므로 수락·승인해도 유령 대타만 남고, 지난 날짜의 근무는
    바꿔봐야 이미 일한 기록이 소급 변경될 뿐이다.
    """
    batch = request.schedule.batch
    if batch is None or batch.status not in _EFFECTIVE_BATCH_STATUSES:
        raise HTTPException(
            status_code=409, detail="근무표가 재확정되어 더 이상 유효하지 않은 요청입니다."
        )
    if request.schedule.work_date < date.today():
        raise HTTPException(status_code=409, detail="이미 지난 근무의 요청입니다.")
    # 다른 요청의 승인으로 근무가 분할되면 이 요청은 잔여 구간 행으로 옮겨진다
    # (_repoint_open_requests). 그래도 구간이 근무 밖으로 나갔다면 승인해봐야
    # 근무표에 없는 시간을 대타에게 넘기는 셈이므로 여기서 끊는다.
    if not (
        request.schedule.start_time <= request.start_time
        and request.end_time <= request.schedule.end_time
    ):
        raise HTTPException(
            status_code=409, detail="근무가 변경되어 요청 구간이 더 이상 유효하지 않습니다."
        )


def _resolve_segment(
    schedule: models.WorkSchedule, payload: schemas.SubstituteRequestCreate
) -> tuple[time, time]:
    """요청 구간을 확정한다 — 생략하면 근무 전체 (#123).

    30분 배수·시작<종료는 스키마에서 이미 걸렀고, 여기서는 근무 행을 봐야 알 수
    있는 것(구간이 근무 안에 들어오는지)만 본다.
    """
    if payload.start_time is None:
        return schedule.start_time, schedule.end_time
    if not (schedule.start_time <= payload.start_time and payload.end_time <= schedule.end_time):
        raise HTTPException(
            status_code=400,
            detail="요청 구간은 해당 근무 시간 안에 있어야 합니다.",
        )
    return payload.start_time, payload.end_time


def _find_candidates(
    db: Session,
    schedule: models.WorkSchedule,
    start_time: time,
    end_time: time,
    exclude_student_id: str | None,
) -> list[schemas.SubstituteCandidateItem]:
    """요청 구간에 가능하고 겹치는 근무가 없는 같은 부서 학생을 찾는다 (REQ-SUB-002).

    판정 기준은 근무 전체가 아니라 **요청 구간**이다 (#123) — 09:00-13:00 근무 중
    10:00-11:30만 넘긴다면, 10:00-11:30만 비어 있으면 대타를 설 수 있다.
    """
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
            models.AvailableTime.start_time <= start_time,
            models.AvailableTime.end_time >= end_time,
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
            models.WorkSchedule.start_time < end_time,
            models.WorkSchedule.end_time > start_time,
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

    if schedule.work_date < date.today():
        raise HTTPException(status_code=400, detail="이미 지난 근무는 대타를 요청할 수 없습니다.")

    segment_start, segment_end = _resolve_segment(schedule, payload)

    # 승인된 요청은 근무가 이미 대타에게 넘어간 종결 상태다 — 넘겨받은 학생이
    # 같은 근무의 대타를 다시 구할 수 있어야 하므로 진행 중(대기·수락)만 막는다.
    # 부분 대타(#123) 이후로는 근무 단위가 아니라 **구간이 겹칠 때만** 막는다.
    # 같은 근무의 서로 다른 구간을 동시에 요청하는 것은 정상 흐름이다 — 불연속
    # 선택은 구간별 요청으로 쪼개져 들어온다.
    overlapping = (
        db.query(models.SubstituteRequest)
        .filter(
            models.SubstituteRequest.schedule_id == payload.schedule_id,
            models.SubstituteRequest.status.in_(_OPEN_STATUSES),
            models.SubstituteRequest.start_time < segment_end,
            models.SubstituteRequest.end_time > segment_start,
        )
        .first()
    )
    if overlapping is not None:
        raise HTTPException(status_code=409, detail="이미 처리 중인 대타 요청이 있습니다.")

    request = models.SubstituteRequest(
        schedule_id=payload.schedule_id,
        start_time=segment_start,
        end_time=segment_end,
        requester_id=current_user.id,
        status=_STATUS_PENDING,
        reason=payload.reason,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def _list_item_fields(r: models.SubstituteRequest) -> dict:
    return dict(
        request_id=r.request_id,
        schedule_id=r.schedule_id,
        requester_id=r.requester_id,
        requester_name=r.requester.name if r.requester else None,
        department_name=r.schedule.department.name if r.schedule.department else None,
        date=r.schedule.work_date,
        # 근무 전체가 아니라 요청 구간 (#123) — 전체 대타면 근무 시간과 같은 값이다
        start_time=r.start_time,
        end_time=r.end_time,
        reason=r.reason,
        requested_at=r.requested_at,
        status=r.status,
        substitute_id=r.substitute_id,
        substitute_name=r.substitute.name if r.substitute else None,
        approved_by=r.approved_by,
        approver_name=r.approver.name if r.approver else None,
        reject_reason=r.reject_reason,
    )


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
    return [schemas.SubstituteRequestListItem(**_list_item_fields(r)) for r in rows]


@router.get("/me", response_model=list[schemas.SubstituteMyRequestItem])
def list_my_substitute_requests(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """내가 올린 요청과 내가 대타로 지목·수락된 요청을 함께 조회한다 (학생 전용).

    '대타 요청 기록' 탭과, 승인된 대타를 근무 시간표에 금색으로 표시하는 데 쓴다
    (schedule_id로 근무표 행과 매칭).
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    rows = (
        db.query(models.SubstituteRequest)
        .filter(
            (models.SubstituteRequest.requester_id == current_user.id)
            | (models.SubstituteRequest.substitute_id == current_user.id)
        )
        .order_by(models.SubstituteRequest.requested_at.desc())
        .all()
    )
    return [
        schemas.SubstituteMyRequestItem(
            **_list_item_fields(r),
            role="requester" if r.requester_id == current_user.id else "substitute",
        )
        for r in rows
    ]


@router.get("/open", response_model=list[schemas.SubstituteOpenRequestItem])
def list_open_substitute_requests_for_me(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """대기 중 요청 가운데 내가 후보 조건에 맞는 것만 조회한다 (학생 전용).

    후보 조건은 candidates 탐색과 동일하다 — 같은 부서 소속이고, 그 시간대에
    가능시간이 등록돼 있으며, 겹치는 다른 근무가 없어야 한다 (REQ-SUB-002).
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    pending = (
        db.query(models.SubstituteRequest)
        .join(
            models.WorkSchedule,
            models.SubstituteRequest.schedule_id == models.WorkSchedule.schedule_id,
        )
        .join(models.ScheduleBatch)
        .filter(
            models.SubstituteRequest.status == _STATUS_PENDING,
            models.SubstituteRequest.requester_id != current_user.id,
            # 재확정으로 내려간 배치의 근무나 이미 지난 근무는 응답해도 의미가 없다
            models.ScheduleBatch.status.in_(_EFFECTIVE_BATCH_STATUSES),
            models.WorkSchedule.work_date >= date.today(),
        )
        .order_by(models.SubstituteRequest.requested_at.desc())
        .all()
    )

    result: list[schemas.SubstituteOpenRequestItem] = []
    for r in pending:
        candidate_ids = {
            c.student_id
            for c in _find_candidates(db, r.schedule, r.start_time, r.end_time, r.requester_id)
        }
        if current_user.id not in candidate_ids:
            continue
        result.append(
            schemas.SubstituteOpenRequestItem(
                request_id=r.request_id,
                requester_id=r.requester_id,
                requester_name=r.requester.name if r.requester else None,
                department_name=r.schedule.department.name if r.schedule.department else None,
                date=r.schedule.work_date,
                start_time=r.start_time,
                end_time=r.end_time,
                reason=r.reason,
                requested_at=r.requested_at,
            )
        )
    return result


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

    return _find_candidates(
        db, request.schedule, request.start_time, request.end_time, request.requester_id
    )


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
    if request.status == _STATUS_REJECTED:
        raise HTTPException(status_code=409, detail="반려된 요청에는 응답할 수 없습니다.")
    _ensure_request_actionable(request)

    if payload.response == "수락":
        request.substitute_id = payload.substitute_id
        request.status = _STATUS_ACCEPTED
        db.commit()
        db.refresh(request)
    # 거절은 이 후보의 의사만 확인하는 것 — 다른 후보가 계속 수락할 수 있도록
    # 요청 상태("대기")는 바꾸지 않는다.

    return schemas.SubstituteRequestStatusOut(request_id=request.request_id, status=request.status)


def _split_schedule(
    db: Session, request: models.SubstituteRequest
) -> list[models.WorkSchedule]:
    """승인된 요청 구간만큼 근무 행을 앞/대타/뒤 최대 3구간으로 쪼갠다 (#123).

    원 근무 행을 요청 구간으로 좁혀 대타에게 넘기고, 남는 앞·뒤 구간을 새 행으로
    떼어 원 근무자에게 남긴다. 원 행을 재사용하는 이유는 요청의 schedule_id가
    승인 뒤에도 "대타가 맡은 근무"를 계속 가리키게 하기 위해서다 — 근무표 화면이
    이 값으로 대타 칸을 찾는다.

    batch_id·department_id·work_date는 원 근무에서 그대로 승계한다. 근무 전체를
    넘기는 요청이면 잔여 구간이 없으므로 새 행은 만들어지지 않는다.

    HC-BLOCK-1(블록 all-or-none)은 솔버가 근무표를 *생성할 때* 거는 제약이고 이
    분할은 확정된 근무표를 운영 중에 고치는 일이므로, 여기서 블록이 쪼개지는 것은
    허용된 운영 예외다 (docs/SCHEDULER_SPEC.md 3.5).
    """
    schedule = request.schedule
    original_owner = schedule.student_id
    leftovers = [
        (start, end)
        for start, end in (
            (schedule.start_time, request.start_time),
            (request.end_time, schedule.end_time),
        )
        if start < end
    ]

    schedule.start_time = request.start_time
    schedule.end_time = request.end_time
    schedule.student_id = request.substitute_id

    remainders = [
        models.WorkSchedule(
            batch_id=schedule.batch_id,
            student_id=original_owner,
            department_id=schedule.department_id,
            work_date=schedule.work_date,
            start_time=start,
            end_time=end,
        )
        for start, end in leftovers
    ]
    db.add_all(remainders)
    db.flush()  # 아래에서 옮겨 붙일 schedule_id가 필요하다
    return remainders


def _repoint_open_requests(
    db: Session,
    approved: models.SubstituteRequest,
    remainders: list[models.WorkSchedule],
) -> None:
    """같은 근무의 다른 진행 중 요청을 잔여 구간 행으로 옮겨 붙인다 (#123).

    분할 뒤에도 원래 schedule_id를 가리키게 두면, 그 행은 이미 대타 구간으로
    좁혀졌으므로 남은 요청의 구간이 근무 밖으로 나가버린다. 진행 중 요청들의
    구간은 서로 겹치지 않고(등록 시 가드) 승인된 구간과도 겹치지 않으므로,
    각 요청은 앞·뒤 잔여 구간 중 정확히 하나 안에 들어간다.
    """
    if not remainders:
        return
    others = (
        db.query(models.SubstituteRequest)
        .filter(
            models.SubstituteRequest.schedule_id == approved.schedule_id,
            models.SubstituteRequest.request_id != approved.request_id,
            models.SubstituteRequest.status.in_(_OPEN_STATUSES),
        )
        .all()
    )
    for other in others:
        for row in remainders:
            if row.start_time <= other.start_time and other.end_time <= row.end_time:
                other.schedule_id = row.schedule_id
                break


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
    _ensure_request_actionable(request)

    # REQ-SUB-005: 요청 구간이 대타 학생에게 넘어가고, 남는 앞/뒤 구간은 원 근무자에게
    # 그대로 남는다 (#123). 근무 전체 요청이면 잔여 구간이 없어 예전처럼 담당 학생만
    # 바뀐 한 행이 된다.
    remainders = _split_schedule(db, request)
    _repoint_open_requests(db, request, remainders)
    request.status = _STATUS_APPROVED
    request.approved_by = current_user.id
    db.commit()
    db.refresh(request)

    return schemas.SubstituteApproveOut(
        request_id=request.request_id,
        status=request.status,
        approved_by=request.approved_by,
    )


@router.patch(
    "/{request_id}/reject",
    response_model=schemas.SubstituteRejectOut,
)
def reject_substitute_request(
    request_id: int,
    payload: schemas.SubstituteRejectIn,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """담당 직원이 대타 요청을 반려한다 (직원 전용, REQ-SUB-008).

    승인 전(대기·수락) 요청만 반려할 수 있다 — 승인된 요청은 이미 근무표가
    교체되었으므로 되돌리려면 별도 플로우가 필요하다. 반려된 요청의 근무는
    원 근무자에게 그대로 남고, 학생은 같은 근무로 다시 요청할 수 있다.
    """
    request = _get_request_or_404(db, request_id)

    require_own_department(
        db,
        current_user,
        request.schedule.department_id,
        "본인 소속 부서의 대타 요청만 반려할 수 있습니다.",
    )

    if request.status == _STATUS_APPROVED:
        raise HTTPException(status_code=409, detail="이미 승인된 요청은 반려할 수 없습니다.")
    if request.status == _STATUS_REJECTED:
        raise HTTPException(status_code=409, detail="이미 반려된 요청입니다.")

    request.status = _STATUS_REJECTED
    request.reject_reason = payload.reject_reason
    db.commit()
    db.refresh(request)

    return schemas.SubstituteRejectOut(
        request_id=request.request_id,
        status=request.status,
        reject_reason=request.reject_reason,
    )
