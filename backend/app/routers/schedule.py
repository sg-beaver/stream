"""근무표 API (API_SPEC 4장 — REQ-SCHED).

- POST /api/availability                    가능 시간 등록 (학생, REQ-SCHED-001)
- GET  /api/availability/me                 본인 가능 시간 슬롯 조회 (학생, REQ-SCHED-014)
- PUT  /api/availability/me                 본인 가능 시간 슬롯 통째로 교체 (학생, REQ-SCHED-014)
- GET  /api/availability/department/{id}    부서 가능 시간 수합 조회 (직원, REQ-SCHED-002)
- POST /api/availability/exceptions         날짜별 예외 등록 (학생, 이슈 #36 B안)
- GET  /api/availability/exceptions/me      본인 예외 목록 조회 (학생, 이슈 #36 B안)
- DELETE /api/availability/exceptions/{id}  본인 예외 삭제 (학생, 이슈 #36 B안)
- GET  /api/schedule/policy/me              내 소속 부서 정책 조회 (학생, #89)
- POST /api/availability/department/{id}/import-from-applications
                                            지원서 체크 시간을 수합에 연동 (직원, REQ-SCHED-012)
- POST /api/schedule/generate               제약조건 기반 근무표 생성 (직원, REQ-SCHED-006)
- POST /api/schedule/review                 draft 배치 AI 검토 (직원) — 확정 권한 없음, 조용한 실패 원칙
- POST /api/schedule/confirm                생성 초안을 확정 (직원, REQ-SCHED-009)
- POST /api/schedule/manual                 기존 근로 학생 수동 등록 (직원, REQ-SCHED-008)
- GET  /api/schedule/me                     본인 확정 근무표 조회 (학생, REQ-SCHED-007)
- GET  /api/schedule/department/{id}        부서 확정 근무표 조회 (직원, REQ-SCHED-007)

generate는 가능시간을 DB에서 조회해 계산하고, 결과를 ScheduleBatch(status="draft")
+ WorkSchedule로 저장한다. 같은 부서·기간으로 재호출하면 기존 draft만 교체하고
confirmed 배치는 건드리지 않는다.

confirm은 그 draft 배치를 담당자가 고른 배정안으로 덮어쓴 뒤 status를 confirmed로
올린다 (draft가 없으면 새로 만든다 — 서버 재시작 등으로 유실된 경우 대비).
같은 부서·기간의 이전 확정본은 삭제하지 않고 superseded로 내려 이력을 남기며,
조회는 항상 가장 최근 confirmed 배치를 본다.

생성 단위는 2주(기본값)를 권장한다 — 2주 교비 총합 제약과 정합하고,
동기 응답이 가능한 풀이 시간(수십 초 이내)이 나온다. 학기 전체 생성이
필요해지면 job 기반 비동기(202 + 폴링)로 확장한다.
"""

from datetime import date, datetime, time, timedelta

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app import auth, models, schemas
from app.database import get_db
from app.scheduler.review import BatchNotDraft, BatchNotFound, review_batch
from app.scheduler.config import load_academic_calendar, load_department_policy
from app.scheduler.domain import OpeningHoursResolver, PeriodType, validate_work_slots_tiling
from app.scheduler.domain.timegrid import minutes_to_str
from app.scheduler.loader.availability import (
    AvailabilityExceptionRow,
    AvailableTimeRow,
    materialize_availability,
)
from app.scheduler.service import (
    DepartmentNotFound,
    GenerateRequest,
    ScheduleInfeasible,
    ScheduleTimeout,
    apply_department_overrides,
    expand_weekly_pattern,
    merge_stored_hours,
    resolve_policy_file_key,
    generate_schedule,
)
from app.services import (
    AVAILABILITY_SOURCE_MANUAL,
    FINE_SLOT_MINUTES,
    get_department_student_ids,
    import_availability_from_application,
    intervals_to_slots,
    require_own_department,
    slots_to_intervals,
)

router = APIRouter(prefix="/api", tags=["schedule"])

# ScheduleBatch.status 값
_STATUS_DRAFT = "draft"
_STATUS_CONFIRMED = "confirmed"
_STATUS_SUPERSEDED = "superseded"
# 수동 등록분은 알고리즘 배치와 섞이지 않도록 부서별 전용 배치에 모은다 (REQ-SCHED-008)
_STATUS_MANUAL = "manual"

# 조회·주간 상한 검증에서 "실제 근무로 인정하는" 배치 상태
_EFFECTIVE_STATUSES = (_STATUS_CONFIRMED, _STATUS_MANUAL)

_DAY_LABELS = {1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일"}

# 부서 정책 행이 없을 때의 가능시간 편집 범위 — 날짜 예외를 막는 쪽으로 fail-closed
_DEFAULT_AVAILABILITY_MODE = "weekly_only"



def _hhmm_to_minutes(value: str) -> int:
    hour, _, minute = value.partition(":")
    return int(hour) * 60 + int(minute)


def _get_policy_row(db: Session, department_id: int) -> models.DepartmentPolicy | None:
    return (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )


def _resolve_biweekly(policy_row, file_policy) -> tuple[int, str]:
    """2주 교비 총합 상한 — 담당자 저장값 우선, 없으면 정책 파일 값."""
    stored = policy_row.biweekly_max_hours if policy_row else None
    if stored is None:
        return int(file_policy.hour_limits.gyobi_biweekly_dept_total_max_hours), "policy_file"
    return stored, "department"


def _resolve_staffing(policy_row, file_policy) -> tuple[int, int, str]:
    """배정 인원 — 담당자가 저장한 값을 우선 쓰고, 없으면 정책 파일 값."""
    stored_min = policy_row.min_per_slot if policy_row else None
    stored_max = policy_row.max_per_slot if policy_row else None
    if stored_min is None and stored_max is None:
        return file_policy.staffing.min_per_slot, file_policy.staffing.max_per_slot, "policy_file"
    return (
        stored_min if stored_min is not None else file_policy.staffing.min_per_slot,
        stored_max if stored_max is not None else file_policy.staffing.max_per_slot,
        "department",
    )


def _opening_hours_response(
    policy, stored: dict | None
) -> dict[str, list[schemas.DepartmentOpeningDay]]:
    """정책 파일 기본값 위에 담당자가 저장한 값을 덮어 응답 형태로 만든다.

    담당자가 특정 기간만 저장했을 수 있으므로(예: 학기만 수정) 기간 단위로 덮어쓴다.
    """
    result: dict[str, list[schemas.DepartmentOpeningDay]] = {}

    for period, by_day in policy.opening_hours.items():
        period_key = period.value
        saved_days = (stored or {}).get(period_key)
        days: list[schemas.DepartmentOpeningDay] = []

        for weekday in sorted(by_day, key=lambda w: w.value):
            # Weekday는 월=0 기준이라 API 표기(월=1)로 맞춘다
            day_number = weekday.value + 1
            if saved_days is not None:
                ranges = [
                    schemas.OpeningHourRange(start_time=start, end_time=end)
                    for start, end in saved_days.get(str(day_number), [])
                ]
            else:
                ranges = [
                    schemas.OpeningHourRange(
                        start_time=minutes_to_str(open_min),
                        end_time=minutes_to_str(close_min),
                    )
                    for open_min, close_min in by_day[weekday]
                ]
            days.append(
                schemas.DepartmentOpeningDay(day_of_week=day_number, ranges=ranges)
            )
        result[period_key] = days

    return result


def _work_slots_response(
    policy, stored: dict | None
) -> dict[str, list[schemas.DepartmentOpeningDay]]:
    """부서 정의 근무 슬롯(#89)을 응답 형태로 만든다. 정의된 요일만 포함.

    개관 시간과 마찬가지로 담당자 저장값이 있는 기간은 저장값이 통째로 우선한다.
    """
    result: dict[str, list[schemas.DepartmentOpeningDay]] = {}

    for period_key in ("semester", "vacation"):
        saved_days = (stored or {}).get(period_key)
        days: list[schemas.DepartmentOpeningDay] = []
        if saved_days is not None:
            for day_number in sorted(saved_days, key=int):
                ranges = [
                    schemas.OpeningHourRange(start_time=start, end_time=end)
                    for start, end in saved_days[day_number]
                ]
                if ranges:
                    days.append(
                        schemas.DepartmentOpeningDay(
                            day_of_week=int(day_number), ranges=ranges
                        )
                    )
        else:
            by_day = policy.work_slots.get(PeriodType(period_key), {})
            for weekday in sorted(by_day, key=lambda w: w.value):
                blocks = by_day[weekday]
                if blocks:
                    days.append(
                        schemas.DepartmentOpeningDay(
                            day_of_week=weekday.value + 1,
                            ranges=[
                                schemas.OpeningHourRange(
                                    start_time=minutes_to_str(start),
                                    end_time=minutes_to_str(end),
                                )
                                for start, end in blocks
                            ],
                        )
                    )
        result[period_key] = days

    return result


def _day_note(calendar, day: date, ranges: list[tuple[int, int]]) -> str | None:
    """그날 개관이 평소와 다른 이유 — 화면 머리글에 한 단어로 붙인다."""
    if not ranges:
        # 평소에도 닫는 요일(일요일 등)은 사유가 아니다
        return "휴관" if calendar.is_closed(day) else None
    if calendar.period_type(day) == PeriodType.SEMESTER:
        if calendar.is_exam_extended_weekend(day):
            return "연장"
        if calendar.is_public_holiday(day) or calendar.is_school_only_holiday(day):
            return "단축"
    return None


def _semester_ranges(year: int) -> list[schemas.SemesterRange]:
    """화면이 날짜별로 학기/방학 개관 시간을 가려 쓰도록 학기 구간을 실어 보낸다.

    한 주가 두 기간에 걸칠 수 있어(예: 8/31 방학 · 9/1 개강) 화면은 요일 하나하나를
    이 구간과 견줘 판정한다. 캘린더 파일이 없으면 빈 목록 — 화면은 학기 기준으로 폴백한다.
    """
    try:
        calendar = load_academic_calendar(year)
    except FileNotFoundError:
        return []
    return [
        schemas.SemesterRange(start=r.start, end=r.end) for r in calendar.semesters
    ]


def _grid_range(
    opening: dict[str, list[schemas.DepartmentOpeningDay]]
) -> tuple[str, str]:
    """학기·방학 개관 시간을 모두 덮는 화면 그리드 세로 범위 (가장 이른 개관~가장 늦은 폐관)."""
    bounds = [
        (_hhmm_to_minutes(r.start_time), _hhmm_to_minutes(r.end_time))
        for days in opening.values()
        for day in days
        for r in day.ranges
    ]
    return (
        minutes_to_str(min((b[0] for b in bounds), default=9 * 60)),
        minutes_to_str(max((b[1] for b in bounds), default=18 * 60)),
    )


def _validate_work_slots_against_opening(
    db: Session,
    department_id: int,
    stored_opening: dict | None,
    stored_work_slots: dict | None,
) -> None:
    """저장 반영 후의 유효 개관 시간 × 유효 근무 슬롯 타일링을 전수 검증한다 (#89).

    개관 시간이나 근무 슬롯 중 한쪽만 바꿔 조합이 어긋나는 저장을 400으로 막는다.
    """
    file_policy = load_department_policy(resolve_policy_file_key(db, department_id))
    merged = merge_stored_hours(
        department_id, file_policy, stored_opening, stored_work_slots
    )

    for period, by_day in merged.work_slots.items():
        for weekday, blocks in by_day.items():
            if not blocks:
                continue
            opening = merged.opening_hours.get(period, {}).get(weekday, [])
            error = validate_work_slots_tiling(opening, blocks, merged.slot_minutes)
            if error is not None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{period.value} {_DAY_LABELS[weekday.value + 1]}요일의 근무 슬롯이 "
                        f"개관 시간과 맞지 않습니다: {error}. "
                        "개관 시간과 근무 슬롯을 함께 수정해 주세요."
                    ),
                )


def _resolve_student_department_id(db: Session, student_id: str) -> int | None:
    """학생이 합격한 공고를 기준으로 소속 부서를 판정한다 (REQ-SCHED-002와 동일 패턴)."""
    application = (
        db.query(models.Application)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.Application.student_id == student_id,
            models.Application.status == "합격",
        )
        .first()
    )
    return application.posting.department_id if application else None


@router.post(
    "/availability",
    response_model=schemas.AvailabilityCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_availability(
    payload: schemas.AvailabilityCreate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 가능 시간을 등록할 수 있습니다.")

    availability = models.AvailableTime(
        student_id=current_user.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        preference=payload.preference,
    )
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability


@router.get("/availability/me", response_model=schemas.AvailabilityMeOut)
def get_my_availability(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """본인이 등록한 근무 가능 시간을 조회한다 (학생 전용, REQ-SCHED-014).

    프런트 TimeGrid가 다루는 "요일-HH:MM" 슬롯 형태로 반환한다 — `/profile` 화면이
    새로고침 후에도 이전에 저장한(또는 지원서에서 연동된) 선택 상태를 그대로 복원할 수 있도록.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    rows = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id == current_user.id)
        .all()
    )
    return schemas.AvailabilityMeOut(
        slots=intervals_to_slots(rows, slot_minutes=FINE_SLOT_MINUTES)
    )


@router.put("/availability/me", response_model=schemas.AvailabilityMeOut)
def replace_my_availability(
    payload: schemas.AvailabilityReplaceIn,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """본인의 근무 가능 시간을 통째로 교체한다 (학생 전용, REQ-SCHED-014).

    `/profile` 화면에서 저장을 누를 때마다 현재 선택 상태 전체를 보내므로,
    `POST /api/availability`처럼 누적되지 않도록 기존 등록분(지원서 연동분 포함)을
    지우고 새로 저장한다. 맞닿은 슬롯은 하나의 구간으로 병합하고, 슬롯 체크만으로는
    '희망'과 구분할 근거가 없으므로 preference는 지원서 연동(REQ-SCHED-012)과 동일하게
    모두 2(보통)로 저장한다 — 선호도를 슬롯별로 지정하려면 `POST /api/availability`를 쓴다.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 등록할 수 있습니다.")

    db.query(models.AvailableTime).filter(
        models.AvailableTime.student_id == current_user.id
    ).delete(synchronize_session=False)

    for day, start, end in slots_to_intervals(payload.slots, slot_minutes=FINE_SLOT_MINUTES):
        db.add(
            models.AvailableTime(
                student_id=current_user.id,
                day_of_week=day,
                start_time=start,
                end_time=end,
                preference=2,
                source=AVAILABILITY_SOURCE_MANUAL,
            )
        )
    db.commit()

    rows = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id == current_user.id)
        .all()
    )
    return schemas.AvailabilityMeOut(
        slots=intervals_to_slots(rows, slot_minutes=FINE_SLOT_MINUTES)
    )


@router.get(
    "/availability/department/{department_id}",
    response_model=list[schemas.AvailabilityDepartmentItem],
)
def list_department_availability(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="직원만 조회할 수 있습니다.")

    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )
    if department is None:
        raise HTTPException(status_code=404, detail="해당 부서를 찾을 수 없습니다.")

    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 가능 시간만 조회할 수 있습니다."
    )

    student_ids = get_department_student_ids(db, department_id)

    availabilities = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id.in_(student_ids))
        .all()
    )
    return [
        schemas.AvailabilityDepartmentItem(
            student_id=availability.student_id,
            student_name=availability.student.name if availability.student else None,
            day_of_week=availability.day_of_week,
            start_time=availability.start_time,
            end_time=availability.end_time,
            source=availability.source,
        )
        for availability in availabilities
    ]


@router.get(
    "/availability/department/{department_id}/dates",
    response_model=list[schemas.AvailabilityDateItem],
)
def list_department_availability_by_date(
    department_id: int,
    from_date: date,
    to_date: date,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """기간 내 날짜별 가능 시간 조회 (직원) — 주간 패턴에 날짜 예외를 반영해 전개한다.

    학생 관리의 주차별 가능 시간표용: 주간 반복 패턴만 보여주는
    /availability/department/{id}와 달리, 특정 주에 등록된 예외(그날 불가/추가
    가능)가 반영된 '그 주의 실제 가능 시간'을 돌려준다. 전개는 스케줄러
    materialize_availability와 동일 규칙이다.
    """
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 가능 시간만 조회할 수 있습니다."
    )
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="기간의 시작일이 종료일보다 늦습니다.")
    if (to_date - from_date).days > 62:
        raise HTTPException(status_code=400, detail="한 번에 62일까지만 조회할 수 있습니다.")

    student_ids = get_department_student_ids(db, department_id)
    policy_row = _get_policy_row(db, department_id)
    availability_mode = (
        policy_row.availability_mode if policy_row else _DEFAULT_AVAILABILITY_MODE
    )

    weekly_by_student: dict[str, list[AvailableTimeRow]] = {}
    for row in (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id.in_(student_ids))
        .all()
    ):
        weekly_by_student.setdefault(row.student_id, []).append(
            AvailableTimeRow(
                day_of_week=row.day_of_week,
                start_time=row.start_time,
                end_time=row.end_time,
                preference=row.preference,
            )
        )

    exceptions_by_student: dict[str, list[AvailabilityExceptionRow]] = {}
    for row in (
        db.query(models.AvailabilityException)
        .filter(
            models.AvailabilityException.student_id.in_(student_ids),
            models.AvailabilityException.exception_date >= from_date,
            models.AvailabilityException.exception_date <= to_date,
        )
        .all()
    ):
        exceptions_by_student.setdefault(row.student_id, []).append(
            AvailabilityExceptionRow(
                exception_date=row.exception_date,
                exception_type=row.exception_type,
                start_time=row.start_time,
                end_time=row.end_time,
                preference=row.preference,
            )
        )

    names = dict(
        db.query(models.Student.student_id, models.Student.name)
        .filter(models.Student.student_id.in_(student_ids))
        .all()
    )

    items: list[schemas.AvailabilityDateItem] = []
    for student_id in student_ids:
        by_date = materialize_availability(
            weekly_by_student.get(student_id, []),
            exceptions_by_student.get(student_id, []),
            availability_mode,
            from_date,
            to_date,
        )
        for day, intervals in by_date.items():
            for start_time, end_time, _pref in intervals:
                items.append(
                    schemas.AvailabilityDateItem(
                        student_id=student_id,
                        student_name=names.get(student_id),
                        date=day,
                        start_time=start_time,
                        end_time=end_time,
                    )
                )
    items.sort(key=lambda x: (x.date, x.student_id, x.start_time))
    return items


@router.post(
    "/availability/department/{department_id}/import-from-applications",
    response_model=schemas.AvailabilityImportOut,
)
def import_department_availability(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 합격자의 지원서 체크 시간을 가능시간 수합에 연동한다 (직원 전용, REQ-SCHED-012).

    합격 처리 시 자동으로 호출되지만, 그 이전에 합격한 학생이나 연동에 실패한 건을
    담당자가 화면에서 다시 시도할 수 있도록 수동 실행 경로도 열어둔다.
    이미 가능시간이 있는 학생은 건너뛴다 — 직접 입력분을 덮어쓰지 않기 위함이다.
    """
    require_own_department(
        db, current_user, department_id, "본인 소속 부서만 연동할 수 있습니다."
    )

    applications = (
        db.query(models.Application)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.JobPosting.department_id == department_id,
            models.Application.status == "합격",
        )
        .all()
    )

    results: list[schemas.AvailabilityImportResult] = []
    imported_students = 0
    imported_intervals = 0

    for application in applications:
        student_name = application.student.name if application.student else None
        has_availability = (
            db.query(models.AvailableTime)
            .filter(models.AvailableTime.student_id == application.student_id)
            .count()
        )
        if has_availability:
            results.append(
                schemas.AvailabilityImportResult(
                    student_id=application.student_id,
                    student_name=student_name,
                    result="already",
                )
            )
            continue

        count = import_availability_from_application(db, application)
        if count:
            imported_students += 1
            imported_intervals += count
        results.append(
            schemas.AvailabilityImportResult(
                student_id=application.student_id,
                student_name=student_name,
                result="imported" if count else "no_slots",
                interval_count=count,
            )
        )

    db.commit()
    return schemas.AvailabilityImportOut(
        imported_students=imported_students,
        imported_intervals=imported_intervals,
        results=results,
    )


@router.post(
    "/availability/exceptions",
    response_model=schemas.AvailabilityExceptionCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_availability_exception(
    payload: schemas.AvailabilityExceptionCreate,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 예외를 등록할 수 있습니다.")

    department_id = _resolve_student_department_id(db, current_user.id)
    if department_id is None:
        raise HTTPException(status_code=403, detail="소속 부서 정보를 확인할 수 없습니다.")

    policy = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
    availability_mode = policy.availability_mode if policy else _DEFAULT_AVAILABILITY_MODE

    if availability_mode == "weekly_only":
        raise HTTPException(status_code=403, detail="이 부서는 예외 등록을 허용하지 않습니다.")
    if (
        availability_mode == "weekly_with_unavailable"
        and payload.exception_type == "AVAILABLE"
    ):
        raise HTTPException(status_code=403, detail="이 부서는 근무 불가 신고만 허용합니다.")

    exception = models.AvailabilityException(
        student_id=current_user.id,
        exception_date=payload.exception_date,
        exception_type=payload.exception_type,
        start_time=payload.start_time,
        end_time=payload.end_time,
        preference=payload.preference,
    )
    db.add(exception)
    db.commit()
    db.refresh(exception)
    return exception


@router.get(
    "/availability/exceptions/me",
    response_model=list[schemas.AvailabilityExceptionItem],
)
def list_my_availability_exceptions(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    exceptions = (
        db.query(models.AvailabilityException)
        .filter(models.AvailabilityException.student_id == current_user.id)
        .all()
    )
    return exceptions


@router.delete(
    "/availability/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_availability_exception(
    exception_id: int,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """본인이 등록한 날짜별 예외를 지운다 (학생 전용, 이슈 #36 B안).

    화면에서 "이 주만 빼기"를 되돌리는 수단이다. 등록 당시의 availability_mode는
    다시 보지 않는다 — 부서가 모드를 좁힌 뒤에도 이미 남은 예외는 지울 수 있어야 한다.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 예외를 삭제할 수 있습니다.")

    exception = (
        db.query(models.AvailabilityException)
        .filter(
            models.AvailabilityException.exception_id == exception_id,
            models.AvailabilityException.student_id == current_user.id,
        )
        .first()
    )
    if exception is None:
        raise HTTPException(status_code=404, detail="해당 예외를 찾을 수 없습니다.")

    db.delete(exception)
    db.commit()


# TODO: 팀 컨벤션 확정 후 app/schemas.py로 이동
class ScheduleGenerateIn(BaseModel):
    department_id: int
    start_date: date = Field(description="스케줄링 시작일 (월요일 권장)")
    num_days: int = Field(default=14, ge=1, le=28, description="기간 일수 (2주 권장)")
    time_limit_seconds: float = Field(default=30.0, ge=1, le=120, description="해 하나당 시간 제한")
    num_alternatives: int = Field(
        default=1, ge=1, le=5, description="동률 배정안 개수 (여러 개면 비교 후 선택)"
    )
    semester_pattern: bool = Field(
        default=False,
        description="학기 고정용 대표 패턴 생성 — 국가근로 주간 상한을 조여 "
        "주 단위 복제 후에도 월 46시간 상한이 지켜지게 한다",
    )


def _parse_hhmm(value: str):
    return datetime.strptime(value, "%H:%M").time()


def _replace_draft_batch(
    db: Session,
    department_id: int,
    period_start: date,
    period_end: date,
    created_by: str,
    schedules: list[dict],
    solver_summary: dict,
) -> tuple[int, int]:
    """같은 부서·기간의 기존 draft 배치를 새 결과로 교체한다 (confirmed는 건드리지 않음)."""
    existing_batch = (
        db.query(models.ScheduleBatch)
        .filter(
            models.ScheduleBatch.department_id == department_id,
            models.ScheduleBatch.period_start == period_start,
            models.ScheduleBatch.period_end == period_end,
            models.ScheduleBatch.status == _STATUS_DRAFT,
        )
        .first()
    )
    if existing_batch is not None:
        db.query(models.WorkSchedule).filter(
            models.WorkSchedule.batch_id == existing_batch.batch_id
        ).delete(synchronize_session=False)
        db.delete(existing_batch)
        db.flush()

    batch = models.ScheduleBatch(
        department_id=department_id,
        period_start=period_start,
        period_end=period_end,
        status=_STATUS_DRAFT,
        created_by=created_by,
        solver_summary=solver_summary,
    )
    db.add(batch)
    db.flush()  # batch_id 확보

    work_schedules = [
        models.WorkSchedule(
            batch_id=batch.batch_id,
            student_id=row["student_id"],
            department_id=department_id,
            work_date=date.fromisoformat(row["date"]),
            start_time=_parse_hhmm(row["start_time"]),
            end_time=_parse_hhmm(row["end_time"]),
        )
        for row in schedules
    ]
    db.add_all(work_schedules)

    return batch.batch_id, len(work_schedules)


@router.get("/schedule/policy/me", response_model=schemas.MyDepartmentPolicyOut)
def get_my_department_scheduling_policy(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """합격해 배정된 부서의 정책 중 학생 화면이 필요한 부분을 조회한다 (학생 전용, #89).

    지원 단계에서는 부서가 정해지지 않아 공통 지원서에서 30분 자유 그리드로 가능
    시간을 내지만, 합격해 소속 부서가 생기면 그 부서가 정의한 근무 슬롯(블록)
    단위로 다시 낸다. 그 격자를 그리는 데 필요한 값(개관 시간·블록·편집 허용 범위)만
    돌려주고 인원·예산 같은 운영 설정은 담지 않는다.

    담당자용 `/schedule/policy/{department_id}`와 달리 경로에 부서를 받지 않는다 —
    학생의 소속 부서는 합격한 지원서에서 서버가 판정한다.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    department_id = _resolve_student_department_id(db, current_user.id)
    if department_id is None:
        # 아직 합격 전인 정상 상태 — 화면은 이 404를 "부서 미배정" 안내로 쓴다
        raise HTTPException(
            status_code=404,
            detail="아직 배정된 부서가 없습니다. 근로에 선발되면 이용할 수 있습니다.",
        )

    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )

    policy_file_key = resolve_policy_file_key(db, department_id)
    try:
        policy = load_department_policy(policy_file_key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail=f"부서 {department_id}의 스케줄링 정책이 없습니다."
        )

    policy_row = _get_policy_row(db, department_id)
    opening = _opening_hours_response(
        policy, policy_row.opening_hours or None if policy_row else None
    )
    work_slots = _work_slots_response(
        policy, policy_row.work_slots or None if policy_row else None
    )
    grid_start_time, grid_end_time = _grid_range(opening)

    return schemas.MyDepartmentPolicyOut(
        department_id=department_id,
        department_name=department.name if department else None,
        slot_minutes=policy.slot_minutes,
        grid_start_time=grid_start_time,
        grid_end_time=grid_end_time,
        opening_hours=opening,
        work_slots=work_slots,
        availability_mode=(
            policy_row.availability_mode if policy_row else _DEFAULT_AVAILABILITY_MODE
        ),
        semesters=_semester_ranges(date.today().year),
    )


@router.get(
    "/schedule/policy/me/days", response_model=list[schemas.MyDepartmentDayOut]
)
def get_my_department_days(
    from_date: date,
    to_date: date,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """기간 내 날짜별 실제 개관 구간·근무 블록을 조회한다 (학생 전용, #89).

    요일별 기본값만으로 그린 시간표는 공휴일 단축(HC-OPEN-3)·시험 직전 주말
    연장(HC-OPEN-5)·폐관(HC-OPEN-1)을 담지 못한다. 근무표를 만들 때 쓰는
    OpeningHoursResolver를 그대로 태워, 학생 화면이 실제 배정 가능 시간과
    같은 격자를 보게 한다.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")
    if to_date < from_date:
        raise HTTPException(status_code=422, detail="조회 종료일이 시작일보다 앞설 수 없습니다.")
    if (to_date - from_date).days > 30:
        raise HTTPException(status_code=422, detail="한 번에 31일까지만 조회할 수 있습니다.")

    department_id = _resolve_student_department_id(db, current_user.id)
    if department_id is None:
        raise HTTPException(
            status_code=404,
            detail="아직 배정된 부서가 없습니다. 근로에 선발되면 이용할 수 있습니다.",
        )

    policy_row = _get_policy_row(db, department_id)
    try:
        file_policy = load_department_policy(resolve_policy_file_key(db, department_id))
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail=f"부서 {department_id}의 스케줄링 정책이 없습니다."
        )
    policy = merge_stored_hours(
        department_id,
        file_policy,
        policy_row.opening_hours or None if policy_row else None,
        policy_row.work_slots or None if policy_row else None,
    )

    days: list[schemas.MyDepartmentDayOut] = []
    day = from_date
    while day <= to_date:
        calendar = load_academic_calendar(day.year)
        resolver = OpeningHoursResolver(policy, calendar)
        ranges = resolver.resolve(day)
        days.append(
            schemas.MyDepartmentDayOut(
                date=day,
                ranges=[
                    schemas.OpeningHourRange(
                        start_time=minutes_to_str(start), end_time=minutes_to_str(end)
                    )
                    for start, end in ranges
                ],
                blocks=[
                    schemas.OpeningHourRange(
                        start_time=minutes_to_str(start), end_time=minutes_to_str(end)
                    )
                    for start, end in resolver.resolve_work_blocks(day)
                ],
                note=_day_note(calendar, day, ranges),
            )
        )
        day += timedelta(days=1)

    return days


@router.get(
    "/schedule/policy/{department_id}",
    response_model=schemas.DepartmentPolicyOut,
)
def get_department_scheduling_policy(
    department_id: int,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 스케줄링 정책 중 화면이 필요한 부분(개관 시간대·슬롯 길이)을 조회한다.

    담당자 화면의 시간표 그리드는 학생이 제출한 시간이 아니라 **부서 개관 시간**을
    세로축으로 그려야 한다 (아무도 제출하지 않은 시간대가 비어 보여야 하므로).

    개관 시간은 담당자가 저장한 값(department_policy.opening_hours)을 우선 쓰고,
    저장한 적이 없으면 정책 파일의 기본값을 돌려준다.
    """
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 정책만 조회할 수 있습니다."
    )

    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )
    if department is None:
        raise HTTPException(status_code=404, detail="해당 부서를 찾을 수 없습니다.")

    policy_file_key = resolve_policy_file_key(db, department_id)
    try:
        policy = load_department_policy(policy_file_key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail=f"부서 {department_id}의 스케줄링 정책이 없습니다."
        )

    policy_row = _get_policy_row(db, department_id)
    stored = policy_row.opening_hours or None if policy_row else None
    opening = _opening_hours_response(policy, stored)
    stored_work_slots = policy_row.work_slots or None if policy_row else None
    work_slots = _work_slots_response(policy, stored_work_slots)

    grid_start_time, grid_end_time = _grid_range(opening)

    min_per_slot, max_per_slot, staffing_source = _resolve_staffing(policy_row, policy)
    biweekly_max_hours, biweekly_source = _resolve_biweekly(policy_row, policy)

    return schemas.DepartmentPolicyOut(
        department_id=department_id,
        department_name=department.name,
        policy_file_key=policy_file_key,
        slot_minutes=policy.slot_minutes,
        availability_mode=(
            policy_row.availability_mode if policy_row else _DEFAULT_AVAILABILITY_MODE
        ),
        grid_start_time=grid_start_time,
        grid_end_time=grid_end_time,
        opening_hours_source="department" if stored else "policy_file",
        opening_hours=opening,
        work_slots=work_slots,
        work_slots_source="department" if stored_work_slots else "policy_file",
        min_per_slot=min_per_slot,
        max_per_slot=max_per_slot,
        staffing_source=staffing_source,
        preferred_staffing_max=max(
            (band.preferred_count for band in policy.preferred_staffing_bands),
            default=policy.staffing.min_per_slot,
        ),
        biweekly_max_hours=biweekly_max_hours,
        biweekly_source=biweekly_source,
        soft_weight_scales=(policy_row.soft_weight_scales or {}) if policy_row else {},
        custom_rules=policy_row.custom_rules if policy_row else None,
        semesters=_semester_ranges(date.today().year),
    )


@router.patch(
    "/schedule/policy/{department_id}",
    response_model=schemas.DepartmentPolicyOut,
)
def update_department_scheduling_policy(
    department_id: int,
    payload: schemas.DepartmentPolicyUpdate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 스케줄링 정책을 담당자가 직접 수정한다 (직원 전용).

    전달된 항목만 반영한다. 개관 시간은 보낸 기간(semester/vacation)만 교체하므로,
    학기만 수정하고 방학은 그대로 둘 수 있다.
    저장 이후의 근무표 생성은 정책 파일이 아니라 이 값을 기준으로 이루어진다.
    """
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 정책만 설정할 수 있습니다."
    )

    policy_row = _get_policy_row(db, department_id)
    if policy_row is None:
        raise HTTPException(status_code=404, detail="해당 부서의 정책이 없습니다.")

    if payload.opening_hours is not None or payload.work_slots is not None:
        # 후보 값을 먼저 만들어 검증하고, 통과했을 때만 row에 반영한다
        stored = dict(policy_row.opening_hours or {})
        for period, days in (payload.opening_hours or {}).items():
            stored[period] = {
                str(day.day_of_week): [[r.start_time, r.end_time] for r in day.ranges]
                for day in days
            }
        stored_slots = dict(policy_row.work_slots or {})
        for period, days in (payload.work_slots or {}).items():
            stored_slots[period] = {
                str(day.day_of_week): [[r.start_time, r.end_time] for r in day.ranges]
                for day in days
            }
        # 한쪽만 바꿔 개관 시간 ↔ 근무 슬롯 조합이 어긋나는 저장을 400으로 막는다
        _validate_work_slots_against_opening(db, department_id, stored, stored_slots)

        if payload.opening_hours is not None:
            policy_row.opening_hours = stored
            # JSONB는 통째로 교체해야 변경으로 인식된다 (dict 내부 수정은 감지되지 않음)
            flag_modified(policy_row, "opening_hours")
        if payload.work_slots is not None:
            policy_row.work_slots = stored_slots
            flag_modified(policy_row, "work_slots")

    if payload.min_per_slot is not None or payload.max_per_slot is not None:
        policy_file_key = resolve_policy_file_key(db, department_id)
        file_policy = load_department_policy(policy_file_key)
        current_min, current_max, _ = _resolve_staffing(policy_row, file_policy)

        new_min = payload.min_per_slot if payload.min_per_slot is not None else current_min
        new_max = payload.max_per_slot if payload.max_per_slot is not None else current_max
        # 한쪽만 보낸 경우도 저장된 값과 맞춰 검증해야 한다
        if new_min > new_max:
            raise HTTPException(
                status_code=400,
                detail=f"최소 인원({new_min}명)이 최대 인원({new_max}명)보다 많을 수 없습니다.",
            )
        policy_row.min_per_slot = new_min
        policy_row.max_per_slot = new_max

    if payload.biweekly_max_hours is not None:
        policy_row.biweekly_max_hours = payload.biweekly_max_hours

    if payload.soft_weight_scales is not None:
        # 보낸 카테고리만 덮어쓴다 — 나머지는 이전 설정(또는 정책 파일 값) 유지.
        # 배율 1.0은 "정책 파일 값 그대로"라 저장하지 않는다 — 이게 곧 되돌리기 수단이다.
        scales = dict(policy_row.soft_weight_scales or {})
        scales.update(payload.soft_weight_scales)
        policy_row.soft_weight_scales = {k: v for k, v in scales.items() if v != 1.0}
        flag_modified(policy_row, "soft_weight_scales")

    if payload.custom_rules is not None:
        # 전체 교체 — 빈 문자열(공백만 포함)은 규칙 삭제로 취급해 null 저장
        # (AI 검토가 no_rules로 건너뛰게)
        policy_row.custom_rules = payload.custom_rules.strip() or None

    if payload.availability_mode is not None:
        # 좁히는 방향(예: weekly_with_exceptions → weekly_only)으로 바꿔도 이미 등록된
        # 예외 행은 지우지 않는다 — materialize_availability가 모드에 맞지 않는 예외를
        # 무시하므로, 모드를 되돌리면 학생이 냈던 예외가 그대로 살아난다
        policy_row.availability_mode = payload.availability_mode

    db.commit()

    return get_department_scheduling_policy(department_id, current_user, db)


@router.post("/schedule/generate")
def generate(
    payload: ScheduleGenerateIn,
    current_user: auth.CurrentUser = Depends(auth.require_staff),  # REQ-SCHED-006
    db: Session = Depends(get_db),
):
    """제약조건 기반 근무표 생성 (직원 전용).

    응답에는 배정 목록과 함께 담당자 판단 근거(부족 슬롯·가능 후보·
    페널티 내역·개인별 집계)가 포함된다. 결과는 draft 상태 ScheduleBatch +
    WorkSchedule로 저장되며, 확정(confirm)은 별도 플로우로 처리한다.
    """
    require_own_department(
        db,
        current_user,
        payload.department_id,
        "본인 소속 부서의 근무표만 생성할 수 있습니다.",
    )

    try:
        response = generate_schedule(
            GenerateRequest(
                department_id=payload.department_id,
                start_date=payload.start_date,
                num_days=payload.num_days,
                time_limit_seconds=payload.time_limit_seconds,
                num_alternatives=payload.num_alternatives,
                semester_pattern=payload.semester_pattern,
            ),
            db,
        )
    except DepartmentNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ScheduleInfeasible as exc:
        # API_SPEC: 409 — 제약조건을 만족하는 근무표를 생성할 수 없음 (증명됨)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ScheduleTimeout as exc:
        # 해 없음이 증명된 게 아니라 시간 초과 — 409와 구분해 504로 응답
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc))

    period_start = payload.start_date
    period_end = period_start + timedelta(days=payload.num_days - 1)

    try:
        batch_id, saved_count = _replace_draft_batch(
            db,
            department_id=payload.department_id,
            period_start=period_start,
            period_end=period_end,
            created_by=current_user.id,
            schedules=response["schedules"],
            solver_summary={
                # OPTIMAL/FEASIBLE 여부를 남겨야 확정 후에도 시간 제한 조기 종료였는지 추적 가능 (#84)
                "status": response["status"],
                "solve_time_seconds": response["solve_time_seconds"],
                "shortages": response["shortages"],
                "penalty_summary": response["penalty_summary"],
                "per_student": response["per_student"],
            },
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="근무표 저장에 실패했습니다.",
        ) from exc

    response["batch_id"] = batch_id
    response["saved_schedule_count"] = saved_count
    return response


# TODO: 팀 컨벤션 확정 후 app/schemas.py로 이동
class ScheduleReviewIn(BaseModel):
    batch_id: int


@router.post("/schedule/review")
def review(
    payload: ScheduleReviewIn,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """draft 배치에 대한 AI 검토 의견 (직원 전용, REQ-SCHED-016).

    부서의 자연어 운영 규칙(custom_rules)이 없거나 AI 호출이 실패해도
    HTTP 200으로 응답하고 review_available=false + reason만 알려준다
    (조용한 실패 원칙 — AI는 검토 의견만 낼 뿐 확정 권한이 없다).
    """
    try:
        return review_batch(db, payload.batch_id)
    except BatchNotFound:
        raise HTTPException(status_code=404, detail="해당 배치를 찾을 수 없습니다.")
    except BatchNotDraft:
        raise HTTPException(status_code=409, detail="draft 상태의 배치만 검토할 수 있습니다.")


# TODO: 팀 컨벤션 확정 후 app/schemas.py로 이동
class ClarificationAnswerIn(BaseModel):
    target_type: Literal["student", "department", "rule_interpretation"]
    target_id: Optional[str] = None
    field_name: Optional[str] = None
    question: str
    answer: str


@router.post(
    "/schedule/review/clarifications",
    status_code=status.HTTP_201_CREATED,
)
def create_clarification_answer(
    payload: ClarificationAnswerIn,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """AI 되묻기(clarification_requests)에 대한 답변을 로그로 남긴다 (직원 전용).

    clarification_answer 테이블에 INSERT만 수행한다 — 학생/부서 실제 컬럼은
    자동 반영하지 않으며(사람이 수동으로 판단해 반영), 기존 POST /api/schedule/manual과는
    완전히 분리된 책임이다.
    """
    # 되묻기 대상이 student/department면 target_id·field_name이 있어야
    # 조회(_get_relevant_clarification_answers)의 구조화된 키 매칭이 가능하고,
    # rule_interpretation은 대상 ID 개념이 없어 반대로 비어 있어야 한다.
    if payload.target_type in ("student", "department"):
        if not payload.target_id or not payload.field_name:
            raise HTTPException(
                status_code=400,
                detail=f"target_type={payload.target_type}에는 target_id와 field_name이 모두 필요합니다.",
            )
    elif payload.target_id is not None or payload.field_name is not None:
        raise HTTPException(
            status_code=400,
            detail="rule_interpretation에는 target_id·field_name을 보낼 수 없습니다.",
        )

    # "부수효과 없음"(자동 UPDATE 안 함) 설계와는 별개 문제 — 존재하지 않는 ID가
    # 그대로 로그에 남는 것만 막는다. 실제 데이터 반영은 여전히 사람이 한다.
    if payload.target_type == "student":
        exists = (
            db.query(models.Student)
            .filter(models.Student.student_id == payload.target_id)
            .first()
        )
        if exists is None:
            raise HTTPException(status_code=404, detail="해당 학생을 찾을 수 없습니다.")
    elif payload.target_type == "department":
        try:
            department_id = int(payload.target_id)
        except (TypeError, ValueError):
            department_id = None
        exists = (
            db.query(models.Department)
            .filter(models.Department.department_id == department_id)
            .first()
            if department_id is not None
            else None
        )
        if exists is None:
            raise HTTPException(status_code=404, detail="해당 부서를 찾을 수 없습니다.")

    record = models.ClarificationAnswer(
        target_type=payload.target_type,
        target_id=payload.target_id,
        field_name=payload.field_name,
        question=payload.question,
        answer=payload.answer,
        answered_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "clarification_answer_id": record.clarification_answer_id,
        "target_type": record.target_type,
        "target_id": record.target_id,
        "field_name": record.field_name,
        "answered_at": record.answered_at,
    }


@router.post(
    "/schedule/confirm",
    response_model=schemas.ScheduleConfirmOut,
    status_code=status.HTTP_201_CREATED,
)
def confirm_schedule(
    payload: schemas.ScheduleConfirmRequest,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """생성 초안을 확정 근무표로 확정한다 (직원 전용, REQ-SCHED-009).

    담당자가 화면에서 배정안(본안 또는 대안) 하나를 고른 뒤 그 배정 목록을 그대로
    되돌려보낸다. generate가 남긴 draft 배치를 그 목록으로 덮어쓰고 confirmed로 올리며,
    같은 부서·기간의 이전 확정본은 superseded로 내려 이력을 남긴다.
    """
    require_own_department(
        db,
        current_user,
        payload.department_id,
        "본인 소속 부서의 근무표만 확정할 수 있습니다.",
    )

    if not payload.schedules:
        raise HTTPException(status_code=400, detail="확정할 배정 내역이 없습니다.")
    if payload.period_start > payload.period_end:
        raise HTTPException(status_code=400, detail="기간의 시작일이 종료일보다 늦습니다.")

    requested_ids = {item.student_id for item in payload.schedules}
    known_ids = {
        student_id
        for (student_id,) in db.query(models.Student.student_id).filter(
            models.Student.student_id.in_(requested_ids)
        )
    }
    unknown = sorted(requested_ids - known_ids)
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"등록되지 않은 학생이 포함되어 있습니다: {', '.join(unknown)}",
        )

    out_of_range = [
        item
        for item in payload.schedules
        if not payload.period_start <= item.date <= payload.period_end
    ]
    if out_of_range:
        raise HTTPException(
            status_code=400, detail="확정 기간을 벗어난 배정이 포함되어 있습니다."
        )

    # 학기 고정: 대표 기간 배정을 repeat_until까지 주 단위 복제 (서버 전개 — 공휴일
    # 단축·폐관 등 실제 개관 시간을 반영해야 하므로 클라이언트에 맡기지 않는다)
    schedule_rows = [
        (item.student_id, item.date, item.start_time, item.end_time)
        for item in payload.schedules
    ]
    adjusted_dates: list[dict] = []
    effective_end = payload.period_end
    if payload.repeat_until is not None:
        if payload.repeat_until < payload.period_end:
            raise HTTPException(
                status_code=400, detail="반복 종료일이 확정 기간 종료일보다 빠릅니다."
            )
        if payload.repeat_until.year != payload.period_start.year:
            raise HTTPException(
                status_code=400,
                detail="학사 일정이 연 단위라 같은 해 안에서만 반복 확정할 수 있습니다.",
            )
        policy = apply_department_overrides(
            db,
            payload.department_id,
            load_department_policy(resolve_policy_file_key(db, payload.department_id)),
        )
        resolver = OpeningHoursResolver(
            policy, load_academic_calendar(payload.period_start.year)
        )
        expanded, adjusted_dates = expand_weekly_pattern(
            [
                (sid, d, t.hour * 60 + t.minute, e.hour * 60 + e.minute)
                for sid, d, t, e in schedule_rows
            ],
            payload.period_start,
            payload.period_end,
            payload.repeat_until,
            resolver,
        )
        schedule_rows = [
            (sid, d, time(start // 60, start % 60), time(end // 60, end % 60))
            for sid, d, start, end in expanded
        ]
        effective_end = payload.repeat_until

    try:
        # 기간이 겹치는 이전 확정본은 지우지 않고 내려둔다 (이력 보존).
        # 완전 일치만 내리면 같은 계획을 다른 기간으로 재확정할 때(예: 2주 확정 후
        # 한 학기 고정으로 재확정) 이전 확정본이 남아 겹치는 기간의 근무가 중복된다.
        (
            db.query(models.ScheduleBatch)
            .filter(
                models.ScheduleBatch.department_id == payload.department_id,
                models.ScheduleBatch.period_start <= effective_end,
                models.ScheduleBatch.period_end >= payload.period_start,
                models.ScheduleBatch.status == _STATUS_CONFIRMED,
            )
            .update({models.ScheduleBatch.status: _STATUS_SUPERSEDED}, synchronize_session=False)
        )

        # generate가 남긴 draft를 그대로 승격한다 — 없으면(서버 재시작 등) 새로 만든다.
        # 학기 고정 확정은 period_end가 draft(대표 기간)와 다르므로 시작일 기준으로
        # 찾는다 — 정확 일치만 보면 draft가 영영 draft로 남는다.
        batch = (
            db.query(models.ScheduleBatch)
            .filter(
                models.ScheduleBatch.department_id == payload.department_id,
                models.ScheduleBatch.period_start == payload.period_start,
                models.ScheduleBatch.status == _STATUS_DRAFT,
            )
            .order_by(models.ScheduleBatch.batch_id.desc())
            .first()
        )
        if batch is None:
            batch = models.ScheduleBatch(
                department_id=payload.department_id,
                period_start=payload.period_start,
                period_end=effective_end,
                created_by=current_user.id,
            )
            db.add(batch)
            db.flush()
        else:
            # 담당자가 대안을 골랐을 수 있으므로 draft 행은 버리고 보낸 목록으로 채운다
            db.query(models.WorkSchedule).filter(
                models.WorkSchedule.batch_id == batch.batch_id
            ).delete(synchronize_session=False)

        batch.status = _STATUS_CONFIRMED
        batch.created_by = current_user.id
        batch.period_end = effective_end

        db.add_all(
            [
                models.WorkSchedule(
                    batch_id=batch.batch_id,
                    student_id=student_id,
                    department_id=payload.department_id,
                    work_date=work_date,
                    start_time=start_time,
                    end_time=end_time,
                )
                for student_id, work_date, start_time, end_time in schedule_rows
            ]
        )
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="근무표 확정에 실패했습니다.",
        ) from exc

    return schemas.ScheduleConfirmOut(
        batch_id=batch.batch_id,
        status=batch.status,
        confirmed_count=len(schedule_rows),
        adjusted_dates=adjusted_dates,
    )


def _hours_between(start, end) -> float:
    return ((end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)) / 60


def _weekly_assigned_hours(db: Session, student_id: str, work_date: date) -> float:
    """해당 주(월~일)에 이미 잡혀 있는 근무시간 합계 (수동 등록 상한 검증용)."""
    week_start = work_date - timedelta(days=work_date.weekday())
    week_end = week_start + timedelta(days=6)

    rows = (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.student_id == student_id,
            models.WorkSchedule.work_date >= week_start,
            models.WorkSchedule.work_date <= week_end,
            models.ScheduleBatch.status.in_(_EFFECTIVE_STATUSES),
        )
        .all()
    )
    return sum(
        _hours_between(row.start_time, row.end_time)
        for row in rows
        if row.start_time is not None and row.end_time is not None
    )


@router.post(
    "/schedule/manual",
    response_model=schemas.ScheduleManualCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_manual_schedule(
    payload: schemas.ScheduleManualCreate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """기존 근로 학생의 근무를 알고리즘 없이 직접 등록한다 (직원 전용, REQ-SCHED-008).

    수동 등록분은 부서별 'manual' 배치 하나에 모아 담는다 — 알고리즘 확정 배치를
    다시 만들어도 수동 등록 이력이 함께 남는다.
    """
    require_own_department(
        db,
        current_user,
        payload.department_id,
        "본인 소속 부서의 근무만 등록할 수 있습니다.",
    )

    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == payload.student_id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="해당 학생을 찾을 수 없습니다.")

    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="종료 시각이 시작 시각보다 빨라야 합니다.")

    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == payload.department_id)
        .first()
    )
    weekly_limit = department.weekly_hour_limit if department else None
    if weekly_limit:
        added = _hours_between(payload.start_time, payload.end_time)
        already = _weekly_assigned_hours(db, payload.student_id, payload.work_date)
        if already + added > weekly_limit:
            raise HTTPException(
                status_code=400,
                detail=f"해당 학생은 주간 근로시간 {weekly_limit}시간을 초과합니다.",
            )

    # 수동 등록 전용 배치 (부서당 1건) — 기간은 등록된 근무 날짜 범위로 넓혀 간다
    batch = (
        db.query(models.ScheduleBatch)
        .filter(
            models.ScheduleBatch.department_id == payload.department_id,
            models.ScheduleBatch.status == _STATUS_MANUAL,
        )
        .first()
    )
    if batch is None:
        batch = models.ScheduleBatch(
            department_id=payload.department_id,
            period_start=payload.work_date,
            period_end=payload.work_date,
            status=_STATUS_MANUAL,
            created_by=current_user.id,
        )
        db.add(batch)
        db.flush()
    else:
        if batch.period_start is None or payload.work_date < batch.period_start:
            batch.period_start = payload.work_date
        if batch.period_end is None or payload.work_date > batch.period_end:
            batch.period_end = payload.work_date

    schedule = models.WorkSchedule(
        batch_id=batch.batch_id,
        student_id=payload.student_id,
        department_id=payload.department_id,
        work_date=payload.work_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    return schemas.ScheduleManualCreateOut(
        schedule_id=schedule.schedule_id, batch_id=batch.batch_id
    )


def _effective_schedules(db: Session, from_date: date | None, to_date: date | None):
    """확정·수동 배치에 속한 근무만 뽑는 공통 쿼리 (draft·superseded 제외)."""
    query = (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(models.ScheduleBatch.status.in_(_EFFECTIVE_STATUSES))
    )
    if from_date is not None:
        query = query.filter(models.WorkSchedule.work_date >= from_date)
    if to_date is not None:
        query = query.filter(models.WorkSchedule.work_date <= to_date)
    return query


@router.get("/schedule/me", response_model=list[schemas.MyScheduleItem])
def list_my_schedule(
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """본인의 확정 근무표를 조회한다 (학생 전용, REQ-SCHED-007)."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    rows = (
        _effective_schedules(db, from_date, to_date)
        .filter(models.WorkSchedule.student_id == current_user.id)
        .order_by(models.WorkSchedule.work_date, models.WorkSchedule.start_time)
        .all()
    )
    return [
        schemas.MyScheduleItem(
            schedule_id=row.schedule_id,
            date=row.work_date,
            day_of_week=_DAY_LABELS[row.work_date.isoweekday()],
            start_time=row.start_time,
            end_time=row.end_time,
            department_name=row.department.name if row.department else None,
        )
        for row in rows
    ]


@router.get(
    "/schedule/department/{department_id}",
    response_model=list[schemas.DepartmentScheduleItem],
)
def list_department_schedule(
    department_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """부서 전체 확정 근무표를 조회한다 (직원 전용, REQ-SCHED-007)."""
    require_own_department(
        db, current_user, department_id, "본인 소속 부서의 근무표만 조회할 수 있습니다."
    )

    rows = (
        _effective_schedules(db, from_date, to_date)
        .filter(models.WorkSchedule.department_id == department_id)
        .order_by(models.WorkSchedule.work_date, models.WorkSchedule.start_time)
        .all()
    )
    return [
        schemas.DepartmentScheduleItem(
            schedule_id=row.schedule_id,
            date=row.work_date,
            day_of_week=_DAY_LABELS[row.work_date.isoweekday()],
            start_time=row.start_time,
            end_time=row.end_time,
            student_id=row.student_id,
            student_name=row.student.name if row.student else None,
        )
        for row in rows
    ]
