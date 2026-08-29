"""개설 과목 · 과목 TA 배정 API (#173).

- GET    /api/course-ta/{department_id}/courses            학기·학과별 개설 과목 + 배정 현황
- GET    /api/course-ta/{department_id}/courses/{cid}/candidates   배정 가능 학생 판정
- POST   /api/course-ta/{department_id}/courses/{cid}/tas  TA 배정
- DELETE /api/course-ta/{department_id}/courses/{cid}/tas/{student_id}  배정 해제

수업 조교 부서는 근무 단위가 **과목**이다. 같은 시간에 여러 과목이 열리므로
(예: 금 10:30~13:15에 4과목) 슬롯별 인원(#171)으로는 "과목마다 TA 1명"을 표현할 수
없어, 시간 격자와 별개의 배정 축을 둔다.

배정은 담당자(조교)가 직접 한다 — 누가 어느 수업에 들어갈지는 전공 적합성·수강
이력처럼 데이터에 없는 사정이 좌우해서 솔버가 풀 문제가 아니다. 대신 **막아야 할
것은 서버가 막는다**: 본인 수강 시간과 겹치는 배정, 이미 맡은 과목과 시간이 겹치는
배정, 과목 수 상한, 주간 근로시간 상한.

경로의 {department_id}는 **근로 부서**(아텍-test 등)이고, 과목의 department_name은
**개설 학과**다 — 한 학과 사무실이 단과대 과목까지 맡는 경우가 있어 둘을 나눈다.
"""

from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app import auth, models, schemas
from app.database import get_db
from app.services import (
    academic_terms,
    get_department_student_ids,
    require_own_department_or_lead,
    require_schedule_editor,
    resolve_term_for_department,
)
from app.work_hours import funding_weekly_cap_hours, to_funding_type

router = APIRouter(prefix="/api/course-ta", tags=["course-ta"])

# 한 학생이 맡는 과목 수 상한. 출결 체크는 수업마다 매주 반복되는 고정 근무라,
# 과목이 늘수록 다른 근무(대기 근무)를 넣을 자리가 사라진다.
MAX_COURSES_PER_TA = 2


def _hhmm(value: time) -> str:
    return value.strftime("%H:%M")


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _weekly_hours(meetings) -> float:
    return sum(_minutes(m.end_time) - _minutes(m.start_time) for m in meetings) / 60


def _overlaps(meetings_a, meetings_b) -> bool:
    """두 수업 시간 목록이 같은 요일에서 한 칸이라도 겹치는지."""
    return any(
        a.day_of_week == b.day_of_week
        and _minutes(a.start_time) < _minutes(b.end_time)
        and _minutes(b.start_time) < _minutes(a.end_time)
        for a in meetings_a
        for b in meetings_b
    )


def _course_out(course: models.Course, names: dict[str, str]) -> schemas.CourseOut:
    return schemas.CourseOut(
        course_id=course.course_id,
        term=course.term,
        course_code=course.course_code,
        section=course.section,
        title=course.title,
        department_name=course.department_name,
        credits=course.credits,
        professor=course.professor,
        enrolled_count=course.enrolled_count,
        meetings=[
            schemas.CourseMeetingOut(
                day_of_week=m.day_of_week,
                start_time=_hhmm(m.start_time),
                end_time=_hhmm(m.end_time),
                room=m.room,
            )
            for m in course.meetings
        ],
        tas=[
            schemas.CourseTaOut(
                student_id=ta.student_id,
                name=names.get(ta.student_id, ta.student_id),
                assigned_at=ta.assigned_at,
            )
            for ta in course.tas
        ],
        weekly_hours=round(_weekly_hours(course.meetings), 1),
    )


def _terms_with_courses(db: Session) -> list[str]:
    """과목이 등록된 학기 목록. 최근 학기가 앞에 온다 (학사 캘린더 순서 기준)."""
    keys = {row[0] for row in db.query(models.Course.term).distinct().all()}
    terms, _ = academic_terms()
    ordered = [t.key for t in terms if t.key in keys]
    # 캘린더가 모르는 학기(지난 연도 등)는 뒤에 붙여 목록에서 사라지지 않게 한다
    return list(reversed(ordered)) + sorted(keys - set(ordered), reverse=True)


def _load_course(db: Session, course_id: int) -> models.Course:
    course = (
        db.query(models.Course)
        .options(selectinload(models.Course.meetings), selectinload(models.Course.tas))
        .filter(models.Course.course_id == course_id)
        .first()
    )
    if course is None:
        raise HTTPException(status_code=404, detail="해당 과목을 찾을 수 없습니다.")
    return course


def _assignments_of(db: Session, student_id: str, term: str):
    """그 학생이 그 학기에 맡은 과목 목록 (수업 시간까지 함께)."""
    return (
        db.query(models.Course)
        .options(selectinload(models.Course.meetings))
        .join(models.CourseTa, models.CourseTa.course_id == models.Course.course_id)
        .filter(models.CourseTa.student_id == student_id, models.Course.term == term)
        .all()
    )


def _class_times_of(db: Session, student_id: str, term: str):
    return (
        db.query(models.ClassTime)
        .filter(models.ClassTime.student_id == student_id, models.ClassTime.term == term)
        .all()
    )


def _blocking_reason(
    db: Session,
    course: models.Course,
    student: models.Student,
    department_id: int,
    term: str,
) -> str | None:
    """배정을 막아야 할 이유. 없으면 None.

    후보 조회(GET)와 배정(POST)이 같은 함수를 쓴다 — 화면에서 회색으로 보이던 학생이
    막상 누르면 들어가거나, 그 반대가 되는 상태를 만들지 않기 위함이다.
    """
    if any(ta.student_id == student.student_id for ta in course.tas):
        return "이미 이 과목에 배정돼 있습니다."

    assigned = _assignments_of(db, student.student_id, term)
    if len(assigned) >= MAX_COURSES_PER_TA:
        return f"이미 {len(assigned)}과목을 맡고 있습니다 (한 사람당 최대 {MAX_COURSES_PER_TA}과목)."

    if _overlaps(course.meetings, _class_times_of(db, student.student_id, term)):
        return "본인 수강 시간과 겹칩니다."

    for other in assigned:
        if _overlaps(course.meetings, other.meetings):
            return f"이미 맡은 {other.course_code}-{other.section} 수업 시간과 겹칩니다."

    # 주간 근로시간은 법정 상한으로만 본다 — 부서 운영 상한(아텍 주 7시간)은 과 사무실
    # 대기 근무 몫이라 TA 시간에 그대로 걸면 실제 운영보다 좁아진다
    cap = funding_weekly_cap_hours(
        department_id, db, to_funding_type(student.funding_type), date.today()
    )
    hours = _weekly_hours(course.meetings) + sum(_weekly_hours(c.meetings) for c in assigned)
    if hours > cap:
        return f"주간 근로시간 상한({cap:g}시간)을 넘습니다 (배정 시 {hours:.1f}시간)."
    return None


@router.get("/{department_id}/courses", response_model=schemas.CourseListOut)
def list_courses(
    department_id: int,
    term: str | None = Query(default=None, description='학기 키 (예: "2026-2"). 없으면 오늘 기준'),
    department_name: str | None = Query(
        default=None, description="개설 학과로 거르기 (없으면 그 학기 전체)"
    ),
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """학기·학과별 개설 과목과 TA 배정 현황.

    화면이 학기·학과 선택을 그릴 수 있게 목록을 함께 내려준다.

    학기는 요청이 지정한 값 > 부서 기본 학기(#172) > 오늘 기준 순으로 정한다.
    그렇게 고른 학기에도 과목이 없으면 **과목이 있는 가장 최근 학기**로 바꿔 쓴다 —
    빈 화면을 보여 주고 조교가 학기를 직접 찾아 들어가게 두지 않기 위함이다.
    어느 학기를 썼는지는 응답의 term으로 알려준다.
    """
    require_own_department_or_lead(
        db, current_user, department_id, "본인 소속 부서의 과목만 조회할 수 있습니다."
    )
    available = _terms_with_courses(db)
    resolved = resolve_term_for_department(db, department_id, term)
    if term is None and resolved not in available and available:
        resolved = available[0]

    query = (
        db.query(models.Course)
        .options(selectinload(models.Course.meetings), selectinload(models.Course.tas))
        .filter(models.Course.term == resolved)
    )
    all_names = sorted(
        {row[0] for row in db.query(models.Course.department_name)
         .filter(models.Course.term == resolved).distinct().all()}
    )
    if department_name:
        query = query.filter(models.Course.department_name == department_name)
    courses = query.order_by(models.Course.course_code, models.Course.section).all()

    names = {
        s.student_id: s.name
        for s in db.query(models.Student).filter(
            models.Student.student_id.in_(
                [ta.student_id for c in courses for ta in c.tas] or [""]
            )
        )
    }
    return schemas.CourseListOut(
        term=resolved,
        available_terms=available,
        department_names=all_names,
        courses=[_course_out(c, names) for c in courses],
    )


@router.get(
    "/{department_id}/courses/{course_id}/candidates",
    response_model=list[schemas.CourseTaCandidateOut],
)
def list_candidates(
    department_id: int,
    course_id: int,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """이 과목에 배정할 수 있는 학생과, 못 하는 학생의 사유."""
    require_own_department_or_lead(
        db, current_user, department_id, "본인 소속 부서의 과목만 조회할 수 있습니다."
    )
    course = _load_course(db, course_id)
    student_ids = get_department_student_ids(db, department_id)
    students = (
        db.query(models.Student)
        .filter(models.Student.student_id.in_(student_ids or [""]))
        .order_by(models.Student.student_id)
        .all()
    )

    result = []
    for student in students:
        assigned = _assignments_of(db, student.student_id, course.term)
        reason = _blocking_reason(db, course, student, department_id, course.term)
        result.append(schemas.CourseTaCandidateOut(
            student_id=student.student_id,
            name=student.name,
            assignable=reason is None,
            reason=reason,
            assigned_course_count=len(assigned),
            assigned_weekly_hours=round(sum(_weekly_hours(c.meetings) for c in assigned), 1),
        ))
    return result


@router.post("/{department_id}/courses/{course_id}/tas", response_model=schemas.CourseOut)
def assign_ta(
    department_id: int,
    course_id: int,
    payload: schemas.CourseTaCreate,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """과목에 TA를 배정한다 (직원·학생팀장).

    막는 조건은 후보 조회와 같은 판정을 쓴다 — 화면과 서버가 다른 답을 내지 않게.
    """
    require_own_department_or_lead(
        db, current_user, department_id, "본인 소속 부서의 과목만 설정할 수 있습니다."
    )
    course = _load_course(db, course_id)

    if payload.student_id not in get_department_student_ids(db, department_id):
        raise HTTPException(
            status_code=400, detail="이 부서 근로 학생이 아닙니다."
        )
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == payload.student_id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="해당 학생을 찾을 수 없습니다.")

    reason = _blocking_reason(db, course, student, department_id, course.term)
    if reason is not None:
        raise HTTPException(status_code=400, detail=f"{student.name} 학생은 배정할 수 없습니다 — {reason}")

    db.add(models.CourseTa(
        course_id=course.course_id, student_id=student.student_id,
        department_id=department_id, assigned_by=current_user.id,
    ))
    db.commit()
    return _course_out(_load_course(db, course_id), {student.student_id: student.name}
                       | _ta_names(db, course_id))


@router.delete(
    "/{department_id}/courses/{course_id}/tas/{student_id}",
    response_model=schemas.CourseOut,
)
def unassign_ta(
    department_id: int,
    course_id: int,
    student_id: str,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """과목 TA 배정을 해제한다."""
    require_own_department_or_lead(
        db, current_user, department_id, "본인 소속 부서의 과목만 설정할 수 있습니다."
    )
    row = (
        db.query(models.CourseTa)
        .filter(
            models.CourseTa.course_id == course_id,
            models.CourseTa.student_id == student_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="배정 내역이 없습니다.")
    db.delete(row)
    db.commit()
    return _course_out(_load_course(db, course_id), _ta_names(db, course_id))


def _ta_names(db: Session, course_id: int) -> dict[str, str]:
    ids = [
        row[0] for row in db.query(models.CourseTa.student_id)
        .filter(models.CourseTa.course_id == course_id).all()
    ]
    return {
        s.student_id: s.name
        for s in db.query(models.Student).filter(models.Student.student_id.in_(ids or [""]))
    }
