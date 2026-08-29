"""수업 시간 API (REQ-SCHED-015) — SAINT 학사 연동 전까지 학생이 직접 입력하는 임시 수단.

- GET  /api/class-time/me                본인 수업 시간 슬롯 조회 (학생)
- PUT  /api/class-time/me                본인 수업 시간 슬롯 통째로 교체 (학생)
- GET  /api/class-time/department/{id}         부서 소속 학생들의 수업 시간 주간 패턴 (직원·학생팀장)
- GET  /api/class-time/department/{id}/dates   같은 값을 날짜별로 전개 (직원·학생팀장)

시간표는 **학기마다 다르다**. 봄학기에 낸 시간표가 가을학기에 그대로 적용되면
안 되므로 모든 조회·저장은 학기(term) 단위로 이루어진다. 학기를 지정하지 않으면
서버가 오늘 기준 학기를 골라 쓰고, 어느 학기를 썼는지 응답의 term으로 알려준다.
학기 목록은 GET /api/academic/terms에 있다.

AvailableTime의 /me 엔드포인트(REQ-SCHED-014)와 형태를 그대로 따른다 — POST 대신
PUT/GET만 있는 이유도 같다: 학생이 몇 번을 다시 저장해도 누적되지 않고 항상 현재
선택 상태 전체로 교체되어야 한다. preference 개념은 없다(수업은 선호도가 아니라
근무 불가 제약이므로).
"""

from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.scheduler.loader.availability import (
    AvailableTimeRow,
    materialize_availability,
)
from app.services import (
    FINE_SLOT_MINUTES,
    get_department_student_ids,
    intervals_to_slots,
    require_own_department_or_lead,
    require_schedule_editor,
    resolve_term_for_department,
    resolve_term_for_student,
    slots_to_intervals,
    term_filter,
    term_segments,
)

router = APIRouter(prefix="/api/class-time", tags=["class-time"])


@router.get("/me", response_model=schemas.ClassTimeMeOut)
def get_my_class_time(
    term: str | None = Query(default=None, description="학기 키. 생략하면 오늘 기준 학기"),
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 조회할 수 있습니다.")

    resolved = resolve_term_for_student(db, current_user.id, term)
    rows = (
        db.query(models.ClassTime)
        .filter(
            models.ClassTime.student_id == current_user.id,
            term_filter(models.ClassTime.term, resolved),
        )
        .all()
    )
    return schemas.ClassTimeMeOut(
        slots=intervals_to_slots(rows, slot_minutes=FINE_SLOT_MINUTES),
        term=resolved,
    )


@router.put("/me", response_model=schemas.ClassTimeMeOut)
def replace_my_class_time(
    payload: schemas.ClassTimeReplaceIn,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="학생만 등록할 수 있습니다.")

    resolved = resolve_term_for_student(db, current_user.id, payload.term)
    # 보낸 학기만 통째로 교체 — 다른 학기 시간표는 건드리지 않는다.
    # 학기 도입 전(NULL) 행도 이때 함께 정리한다
    db.query(models.ClassTime).filter(
        models.ClassTime.student_id == current_user.id,
        term_filter(models.ClassTime.term, resolved),
    ).delete(synchronize_session=False)

    for day, start, end in slots_to_intervals(payload.slots, slot_minutes=FINE_SLOT_MINUTES):
        db.add(
            models.ClassTime(
                student_id=current_user.id,
                term=resolved,
                day_of_week=day,
                start_time=start,
                end_time=end,
            )
        )
    db.commit()

    rows = (
        db.query(models.ClassTime)
        .filter(
            models.ClassTime.student_id == current_user.id,
            models.ClassTime.term == resolved,
        )
        .all()
    )
    return schemas.ClassTimeMeOut(
        slots=intervals_to_slots(rows, slot_minutes=FINE_SLOT_MINUTES),
        term=resolved,
    )


@router.get(
    "/department/{department_id}",
    response_model=list[schemas.ClassTimeDepartmentItem],
)
def list_department_class_time(
    department_id: int,
    term: str | None = Query(default=None, description="학기 키. 생략하면 오늘 기준 학기"),
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """부서 소속(=부서 공고 합격) 학생들의 수업 시간 주간 패턴을 조회한다.

    시간표는 학기마다 다르므로 한 학기 것만 돌려준다 — 근무표를 짜는 학기의
    시간표를 봐야 하기 때문이다. 특정 주의 시간표가 필요하면(한 주가 학기 경계를
    넘을 수 있다) `/department/{id}/dates`를 쓴다.
    """
    require_own_department_or_lead(
        db, current_user, department_id, "본인 소속 부서의 수업 시간만 조회할 수 있습니다."
    )

    resolved = resolve_term_for_department(db, department_id, term)
    student_ids = get_department_student_ids(db, department_id)
    rows = (
        db.query(models.ClassTime)
        .filter(
            models.ClassTime.student_id.in_(student_ids),
            term_filter(models.ClassTime.term, resolved),
        )
        .all()
    )
    return [
        schemas.ClassTimeDepartmentItem(
            student_id=row.student_id,
            student_name=row.student.name if row.student else None,
            day_of_week=row.day_of_week,
            start_time=row.start_time,
            end_time=row.end_time,
            term=row.term,
        )
        for row in rows
    ]


@router.get(
    "/department/{department_id}/dates",
    response_model=list[schemas.ClassTimeDateItem],
)
def list_department_class_time_by_date(
    department_id: int,
    from_date: date,
    to_date: date,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """기간 내 날짜별 수업 시간 조회 — 주간 패턴을 날짜로 전개한다.

    학기별 주간 패턴만 돌려주는 `/department/{id}`와 달리, 응답 하나에 여러 학기가
    섞여 들어갈 수 있다. 개강 주(2026-08-31 방학 · 09-01부터 학기)처럼 한 주가 학기
    경계를 넘으면 날짜마다 읽을 시간표가 달라지기 때문이다 — 학기 하나로 그 주를
    덮으면 화면이 엉뚱한 학기의 수업을 겹쳐 보여준다.

    구간 분할은 가능 시간(`/api/availability/department/{id}/dates`)과 같은 규칙
    (`services.term_segments`)이라 두 값이 같은 날짜에 대해 어긋나지 않는다.

    수업 시간에는 날짜 예외 개념이 없어(휴강을 받는 테이블이 없다) 전개는 요일
    패턴을 그대로 펼치는 것뿐이다. 요일↔날짜 규칙을 한 곳에 두려고 가능 시간과
    같은 `materialize_availability`를 예외 없이(`weekly_only`) 재사용한다.
    """
    require_own_department_or_lead(
        db, current_user, department_id, "본인 소속 부서의 수업 시간만 조회할 수 있습니다."
    )
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="기간의 시작일이 종료일보다 늦습니다.")
    if (to_date - from_date).days > 62:
        raise HTTPException(status_code=400, detail="한 번에 62일까지만 조회할 수 있습니다.")

    student_ids = get_department_student_ids(db, department_id)

    segments = term_segments(from_date, to_date)
    weekly_by_term: dict[str | None, dict[str, list[AvailableTimeRow]]] = {}
    for seg_term in {term for term, _, _ in segments}:
        by_student: dict[str, list[AvailableTimeRow]] = {}
        for row in (
            db.query(models.ClassTime)
            .filter(
                models.ClassTime.student_id.in_(student_ids),
                term_filter(models.ClassTime.term, seg_term),
            )
            .all()
        ):
            by_student.setdefault(row.student_id, []).append(
                AvailableTimeRow(
                    day_of_week=row.day_of_week,
                    start_time=row.start_time,
                    end_time=row.end_time,
                    preference=None,
                )
            )
        weekly_by_term[seg_term] = by_student

    names = dict(
        db.query(models.Student.student_id, models.Student.name)
        .filter(models.Student.student_id.in_(student_ids))
        .all()
    )

    items: list[schemas.ClassTimeDateItem] = []
    for student_id in student_ids:
        # 구간은 날짜가 겹치지 않으므로 결과를 그대로 합친다
        by_date: dict[date, list[tuple[time, time, int | None]]] = {}
        for seg_term, seg_start, seg_end in segments:
            by_date.update(
                materialize_availability(
                    weekly_by_term[seg_term].get(student_id, []),
                    [],
                    "weekly_only",
                    seg_start,
                    seg_end,
                )
            )
        for day, intervals in by_date.items():
            for start_time, end_time, _pref in intervals:
                items.append(
                    schemas.ClassTimeDateItem(
                        student_id=student_id,
                        student_name=names.get(student_id),
                        date=day,
                        start_time=start_time,
                        end_time=end_time,
                    )
                )
    items.sort(key=lambda x: (x.date, x.student_id, x.start_time))
    return items
