import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.services import display_status, require_own_department

router = APIRouter(prefix="/api/postings", tags=["postings"])


def _load_work_slots(posting: models.JobPosting) -> Optional[list[str]]:
    if not posting.work_slots:
        return None
    try:
        return json.loads(posting.work_slots)
    except ValueError:
        return None


def _my_applications_by_posting(
    db: Session, current_user: auth.CurrentUser
) -> dict[int, int]:
    """학생 요청자의 posting_id → application_id 매핑. 학생이 아니면 빈 dict."""
    if current_user.role != "student":
        return {}
    rows = (
        db.query(models.Application.posting_id, models.Application.application_id)
        .filter(models.Application.student_id == current_user.id)
        .all()
    )
    return {posting_id: application_id for posting_id, application_id in rows}


def _availability_hours_by_day(db: Session, student_id: str) -> dict[int, list[tuple[int, int]]]:
    """학생 가능시간을 요일(월=1)별 (시작분, 끝분) 구간 목록으로."""
    rows = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id == student_id)
        .all()
    )
    by_day: dict[int, list[tuple[int, int]]] = {}
    for row in rows:
        if row.day_of_week is None or row.start_time is None or row.end_time is None:
            continue
        by_day.setdefault(row.day_of_week, []).append(
            (row.start_time.hour * 60 + row.start_time.minute,
             row.end_time.hour * 60 + row.end_time.minute)
        )
    return by_day


_DAY_INDEX = {"월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6, "일": 7}


def _schedule_match(work_slots: Optional[list[str]], by_day: dict[int, list[tuple[int, int]]]) -> Optional[bool]:
    """work_slots("월-10:00" = 해당 시각부터 1시간)가 하나라도 가능시간에 들어가면 True.

    비교 근거가 없으면(공고에 슬롯이 없거나 학생 가능시간 미등록) None.
    """
    if not work_slots or not by_day:
        return None
    for slot in work_slots:
        try:
            day_str, time_str = slot.split("-")
            hh, mm = time_str.split(":")
            start = int(hh) * 60 + int(mm)
        except ValueError:
            continue
        day = _DAY_INDEX.get(day_str)
        if day is None:
            continue
        for win_start, win_end in by_day.get(day, []):
            if win_start <= start and start + 60 <= win_end:
                return True
    return False


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

    require_own_department(
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
        category=payload.category,
        period_start=payload.period_start,
        period_end=payload.period_end,
        headcount=payload.headcount,
        weekly_max_hours=payload.weekly_max_hours,
        location=payload.location,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        work_slots=json.dumps(payload.work_slots, ensure_ascii=False)
        if payload.work_slots is not None
        else None,
    )
    db.add(posting)
    db.commit()
    db.refresh(posting)
    return posting


@router.patch("/{posting_id}", response_model=schemas.JobPostingDetail)
def update_posting(
    posting_id: int,
    payload: schemas.JobPostingUpdate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    posting = (
        db.query(models.JobPosting)
        .filter(models.JobPosting.posting_id == posting_id)
        .first()
    )
    if posting is None:
        raise HTTPException(status_code=404, detail="해당 공고를 찾을 수 없습니다.")

    require_own_department(
        db, current_user, posting.department_id, "본인 소속 부서의 공고만 수정할 수 있습니다."
    )

    updates = payload.model_dump(exclude_unset=True)
    if "work_slots" in updates:
        slots = updates.pop("work_slots")
        posting.work_slots = (
            json.dumps(slots, ensure_ascii=False) if slots is not None else None
        )
    for field, value in updates.items():
        setattr(posting, field, value)
    db.commit()
    db.refresh(posting)
    return _to_detail(posting, applied=None, application_id=None)


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

    # 학생 요청자에게만 지원 여부·시간표 겹침을 개인화해서 내려준다 (#55)
    my_applications = _my_applications_by_posting(db, current_user)
    availability = (
        _availability_hours_by_day(db, current_user.id)
        if current_user.role == "student"
        else {}
    )
    is_student = current_user.role == "student"

    return [
        schemas.JobPostingListItem(
            posting_id=posting.posting_id,
            title=posting.title,
            department_name=posting.department.name if posting.department else None,
            upload_date=posting.upload_date,
            deadline=posting.deadline,
            status=display_status(posting),
            category=posting.category,
            period_start=posting.period_start,
            period_end=posting.period_end,
            headcount=posting.headcount,
            weekly_max_hours=posting.weekly_max_hours,
            applied=(posting.posting_id in my_applications) if is_student else None,
            application_id=my_applications.get(posting.posting_id),
            schedule_match=_schedule_match(_load_work_slots(posting), availability)
            if is_student
            else None,
        )
        for posting in postings
    ]


def _to_detail(
    posting: models.JobPosting,
    applied: Optional[bool],
    application_id: Optional[int],
) -> schemas.JobPostingDetail:
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
        category=posting.category,
        period_start=posting.period_start,
        period_end=posting.period_end,
        headcount=posting.headcount,
        weekly_max_hours=posting.weekly_max_hours,
        location=posting.location,
        contact_email=posting.contact_email,
        contact_phone=posting.contact_phone,
        work_slots=_load_work_slots(posting),
        applied=applied,
        application_id=application_id,
    )


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

    my_applications = _my_applications_by_posting(db, current_user)
    is_student = current_user.role == "student"
    return _to_detail(
        posting,
        applied=(posting.posting_id in my_applications) if is_student else None,
        application_id=my_applications.get(posting.posting_id),
    )
