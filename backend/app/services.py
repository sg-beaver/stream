from datetime import date, time
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import auth, models

# 지원서 슬롯의 요일 표기 → day_of_week (월=1, date.isoweekday()와 같은 기준)
_DAY_INDEX = {"월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6, "일": 7}

# 지원서 슬롯 한 칸의 길이 — frontend utils/coverLetter.js가 "요일-HH:MM" 1시간 단위로 저장한다
_SLOT_MINUTES = 60
# /profile 시간표 그리드의 30분 단위 슬롯 (uiux 킷 명세 — 시급 지급 기준 단위)
FINE_SLOT_MINUTES = 30

AVAILABILITY_SOURCE_APPLICATION = "application"
AVAILABILITY_SOURCE_MANUAL = "manual"


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
