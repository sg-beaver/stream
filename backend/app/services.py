from datetime import date, time, timedelta
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import auth, models
from app.database import get_db
from app.scheduler.config import load_academic_calendar

# 지원서 슬롯의 요일 표기 → day_of_week (월=1, date.isoweekday()와 같은 기준)
_DAY_INDEX = {"월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6, "일": 7}

# 지원서 슬롯 한 칸의 길이 — frontend utils/coverLetter.js가 "요일-HH:MM" 1시간 단위로 저장한다
_SLOT_MINUTES = 60
# /profile 시간표 그리드의 30분 단위 슬롯 (uiux 킷 명세 — 시급 지급 기준 단위)
FINE_SLOT_MINUTES = 30

AVAILABILITY_SOURCE_APPLICATION = "application"
AVAILABILITY_SOURCE_MANUAL = "manual"


# ---- 학기 (수업 시간표·근무 가능 시간을 묶는 단위, #89 후속) ----


def academic_terms(on: date | None = None):
    """학사 캘린더의 학기 목록과 그날 기준 학기. 캘린더 파일이 없으면 (빈 목록, None)."""
    day = on or date.today()
    try:
        calendar = load_academic_calendar(day.year)
    except FileNotFoundError:
        return [], None
    return calendar.terms, calendar.term_for(day)


def resolve_term(term: Optional[str], on: date | None = None) -> Optional[str]:
    """요청이 지정한 학기, 없으면 그날(기본 오늘) 기준 학기 키."""
    if term:
        return term
    _, default_term = academic_terms(on)
    return default_term.key if default_term else None


def term_segments(
    period_start: date, period_end: date
) -> list[tuple[Optional[str], date, date]]:
    """기간을 학기 경계로 자른 (학기 키, 시작일, 종료일) 구간 목록.

    가용 시간·수업 시간표는 학기 단위로 저장되므로, 기간이 학기 경계를 넘으면
    날짜마다 읽어야 할 학기가 달라진다. 시작일 학기 하나로 기간 전체를 덮으면
    다른 학기 날짜에 엉뚱한 학기의 가용 시간이 붙어, 개관은 하는데 근무 가능자가
    0명인 슬롯이 생긴다 (#156).

    학기 키 판정은 resolve_term과 같은 규칙(AcademicCalendar.term_for)이라
    기간이 한 학기 안에 들어오면 기존과 동일하게 구간 1개를 돌려준다.
    """
    try:
        calendar = load_academic_calendar(period_start.year)
    except FileNotFoundError:
        calendar = None

    def term_of(day: date) -> Optional[str]:
        if calendar is None:
            return None
        term = calendar.term_for(day)
        return term.key if term else None

    segments: list[tuple[Optional[str], date, date]] = []
    seg_start = period_start
    current = term_of(period_start)
    day = period_start + timedelta(days=1)
    while day <= period_end:
        term = term_of(day)
        if term != current:
            segments.append((current, seg_start, day - timedelta(days=1)))
            seg_start, current = day, term
        day += timedelta(days=1)
    segments.append((current, seg_start, period_end))
    return segments


def term_filter(column, term: Optional[str]):
    """그 학기 행 + 학기 도입 전(NULL) 행.

    NULL은 학기 개념이 생기기 전에 저장된 데이터라 어느 학기를 보든 함께 적용한다 —
    학생이 그 학기를 다시 저장하는 순간 정리된다(저장 시 NULL 행도 함께 교체).
    """
    return or_(column == term, column.is_(None))


def display_status(posting: models.JobPosting) -> str:
    if posting.deadline is not None and posting.deadline < date.today():
        return "마감"
    return posting.status


def require_own_department(
    db: Session,
    current_user: auth.CurrentUser,
    department_id: Optional[int],
    detail: str,
) -> models.Staff:
    staff = db.query(models.Staff).filter(models.Staff.staff_id == current_user.id).first()
    if staff is None or staff.department_id != department_id:
        raise HTTPException(status_code=403, detail=detail)
    return staff


# ---- 근무표 편성 권한 (#156) ----
#
# 근무표를 짜는 사람이 늘 직원인 것은 아니다 — 근로 학생 중 '학생팀장'이 부서
# 근무표를 편성한다. 그렇다고 직원 권한을 통째로 주면 대타 승인·공고 관리·부서
# 정책 변경까지 함께 열린다. 그래서 토큰의 role은 student 그대로 두고,
# 근무표 편성 경로에만 통하는 권한을 따로 둔다.
#
# 열리는 것: 생성 · draft 조회/편집 · 확정 · 검토 챗봇 · 배치 검증 · 부서 수합 조회
# 닫히는 것: 대타 승인/반려 · 공고/지원서 관리 · 부서 정책 변경(챗봇 가중치 저장 포함)
#            · 학생 활동기간 수정 · 지원서 가능시간 연동


def require_schedule_editor(
    db: Session = Depends(get_db),
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
) -> auth.CurrentUser:
    """근무표를 편성할 수 있는 사용자 — 직원 또는 학생팀장."""
    if current_user.role == "staff":
        return current_user
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == current_user.id)
        .first()
    )
    if student is not None and student.is_team_lead:
        return current_user
    raise HTTPException(status_code=403, detail="근무표를 편성할 권한이 없습니다.")


def editor_department_ids(db: Session, current_user: auth.CurrentUser) -> list[int]:
    """이 사용자가 근무표를 편성할 수 있는 부서.

    직원은 소속 부서, 학생팀장은 합격한 공고의 부서다 — 부서 소속 판정 기준을
    근로 학생과 똑같이 두어(합격 공고), 학생팀장이 자기가 일하는 부서 밖의
    근무표를 건드릴 수 없게 한다.
    """
    if current_user.role == "staff":
        staff = (
            db.query(models.Staff)
            .filter(models.Staff.staff_id == current_user.id)
            .first()
        )
        return [staff.department_id] if staff and staff.department_id else []
    rows = (
        db.query(models.JobPosting.department_id)
        .join(
            models.Application,
            models.Application.posting_id == models.JobPosting.posting_id,
        )
        .filter(
            models.Application.student_id == current_user.id,
            models.Application.status == "합격",
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows if row[0] is not None]


def require_own_department_or_lead(
    db: Session,
    current_user: auth.CurrentUser,
    department_id: Optional[int],
    detail: str,
) -> None:
    """require_own_department의 근무표 편성판 — 직원과 학생팀장 모두 통과한다."""
    if department_id is None or department_id not in editor_department_ids(
        db, current_user
    ):
        raise HTTPException(status_code=403, detail=detail)


def get_department_student_ids(db: Session, department_id: int) -> list[str]:
    """department_id 소속(해당 부서 공고에 합격한) 학생 student_id 목록."""
    rows = (
        db.query(models.Application.student_id)
        .join(models.JobPosting, models.Application.posting_id == models.JobPosting.posting_id)
        .filter(
            models.JobPosting.department_id == department_id,
            models.Application.status == "합격",
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


# ---- 지원서 근무 가능 시간 → available_time 연동 (REQ-SCHED-012) ----
#
# 신규 선발 학생은 지원서에서 이미 근무 가능 시간을 체크했으므로 같은 정보를 다시 받지 않고
# 그대로 수합에 넣는다. 기존 근로 학생은 지원서가 없거나 그 항목이 비어 있어 직접 입력해야 한다.
# 파싱 규칙은 frontend/src/utils/coverLetter.js의 buildCoverLetter와 짝을 이룬다.


def parse_cover_letter_slots(cover_letter: Optional[str]) -> list[str]:
    """지원서 본문의 "[근무 가능 시간]" 섹션에서 "요일-HH:MM" 슬롯 목록을 뽑는다.

    해당 섹션이 없거나 비어 있으면 빈 리스트 (기존 근로 학생·구 형식 지원서).
    """
    if not cover_letter:
        return []

    section: Optional[list[str]] = None
    for line in cover_letter.split("\n"):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            section = [] if stripped == "[근무 가능 시간]" else None
            continue
        if section is not None:
            section.append(line)

    if not section:
        return []
    return [slot.strip() for slot in "\n".join(section).split(",") if slot.strip()]


def _to_time(minutes: int) -> time:
    return time(hour=(minutes // 60) % 24, minute=minutes % 60)


def slots_to_intervals(
    slots: list[str], slot_minutes: int = _SLOT_MINUTES
) -> list[tuple[int, time, time]]:
    """"요일-HH:MM" 슬롯들을 (day_of_week, 시작, 끝) 구간으로 병합한다.

    맞닿은 슬롯(예: 금-09:00, 금-10:00, 금-11:00)은 한 구간(09:00~12:00)으로 합쳐
    학생이 직접 입력했을 때와 같은 형태로 available_time에 저장한다.

    slot_minutes는 슬롯 하나의 길이 — 지원서 체크 시간(1시간 단위)은 기본값(60)을,
    /profile 시간표 그리드(30분 단위)는 30을 쓴다.
    """
    by_day: dict[int, set[int]] = {}
    for slot in slots:
        day_str, _, time_str = slot.partition("-")
        day = _DAY_INDEX.get(day_str.strip())
        if day is None:
            continue
        hour, _, minute = time_str.strip().partition(":")
        try:
            start = int(hour) * 60 + int(minute or 0)
        except ValueError:
            continue
        by_day.setdefault(day, set()).add(start)

    intervals: list[tuple[int, time, time]] = []
    for day in sorted(by_day):
        starts = sorted(by_day[day])
        block_start = starts[0]
        block_end = starts[0] + slot_minutes
        for start in starts[1:]:
            if start == block_end:  # 앞 슬롯과 맞닿음 → 같은 구간으로 확장
                block_end = start + slot_minutes
            else:
                intervals.append((day, _to_time(block_start), _to_time(block_end)))
                block_start, block_end = start, start + slot_minutes
        intervals.append((day, _to_time(block_start), _to_time(block_end)))
    return intervals


def intervals_to_slots(
    rows: list["models.AvailableTime | models.ClassTime"], slot_minutes: int = _SLOT_MINUTES
) -> list[str]:
    """구간(day_of_week·start_time·end_time을 가진 행)들을 "요일-HH:MM" 슬롯 목록으로 펼친다
    (slots_to_intervals의 역변환). AvailableTime·ClassTime 둘 다 이 세 필드만 읽으므로 공용으로 쓴다.

    프런트 TimeGrid는 1시간 단위 슬롯 체크박스만 다루므로, `/profile` 화면이 새로고침 후에도
    이전에 저장한 선택 상태를 그대로 복원할 수 있도록 구간을 다시 슬롯 단위로 쪼갠다.
    구간 길이가 60분의 배수가 아니어도 끝을 넘지 않는 범위까지만 슬롯을 만든다.
    """
    day_label = {v: k for k, v in _DAY_INDEX.items()}
    slots: list[str] = []
    for row in rows:
        label = day_label.get(row.day_of_week)
        if label is None or row.start_time is None or row.end_time is None:
            continue
        start = row.start_time.hour * 60 + row.start_time.minute
        end = row.end_time.hour * 60 + row.end_time.minute
        cur = start
        while cur + slot_minutes <= end:
            slots.append(f"{label}-{cur // 60:02d}:{cur % 60:02d}")
            cur += slot_minutes
    return slots


def import_availability_from_application(
    db: Session, application: models.Application
) -> int:
    """지원서에 체크된 근무 가능 시간을 그 학생의 available_time으로 만든다.

    이미 수합된 가능시간이 있으면 건드리지 않는다 (직접 입력분을 덮어쓰지 않도록).
    반환값은 새로 만든 구간 수 — 0이면 지원서에 시간이 없거나 이미 수합된 상태다.
    커밋은 호출부에서 한다.
    """
    already = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id == application.student_id)
        .count()
    )
    if already:
        return 0

    intervals = slots_to_intervals(parse_cover_letter_slots(application.cover_letter))
    for day, start, end in intervals:
        db.add(
            models.AvailableTime(
                student_id=application.student_id,
                day_of_week=day,
                start_time=start,
                end_time=end,
                # 지원서 체크만으로는 '희망(3)'과 구분할 근거가 없어 보통(2)으로 둔다
                preference=2,
                source=AVAILABILITY_SOURCE_APPLICATION,
            )
        )
    return len(intervals)
