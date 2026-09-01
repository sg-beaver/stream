"""특정 날짜에 학생이 실제로 근무 가능한 구간.

요일 반복(`available_time`)을 날것으로 읽으면 세 가지가 어긋난다.

- **학기** — 가능 시간은 학기별로 저장된다. 학기를 안 가리면 지난 학기에 낸
  가능 시간으로 이번 학기 근무가 가능해 보인다.
- **날짜 예외** — "그날은 못 나옵니다"(`availability_exception`)를 안 보면
  결석을 신고한 학생이 그대로 후보에 오른다 (#36).
- **구간 분할** — 선호도가 다르면 맞닿아 있어도 별개 행으로 저장된다
  (`slots_to_preference_intervals`). 행 하나가 요청 구간을 통째로 덮어야
  가능하다고 보면, 실제로는 내내 가능한 학생이 후보에서 사라진다.

솔버·검증기가 쓰는 `materialize_availability`가 이 셋을 이미 정리해 준다.
근무 가능 여부를 묻는 다른 경로(지금은 대타 후보 탐색)도 같은 것을 쓰게 하려고
여기에 묶었다 — 자기만의 기준을 두면 "생성은 되는데 대타는 안 되는" 상태가 된다.

TODO: `routers/schedule.py`의 `list_department_availability_by_date`도 같은 전개를
기간 단위로 한다. 화면 회귀 위험이 없는 시점에 이 모듈로 합치는 게 맞다.
"""

from datetime import date, time

from sqlalchemy.orm import Session

from app import models
from app.scheduler.loader.availability import (
    AvailabilityExceptionRow,
    AvailableTimeRow,
    materialize_availability,
)
from app.services import term_filter, term_segments

_DEFAULT_AVAILABILITY_MODE = "weekly_only"

# (시작, 끝, 선호도) — 선호도는 1(피하고 싶음)/2(가능)/3(희망), 미지정이면 None
Interval = tuple[time, time, int | None]


def available_intervals_on(
    db: Session, student_ids: list[str], department_id: int, day: date
) -> dict[str, list[Interval]]:
    """그 날짜에 각 학생이 근무 가능한 구간 목록 — {student_id: [(시작, 끝, 선호도)]}.

    가능 시간을 아예 안 낸 학생은 빈 목록으로 들어온다(키는 있다).
    """
    if not student_ids:
        return {}

    # 하루짜리 조회라 구간은 항상 하나지만, 학기 판정 규칙을 term_segments에
    # 맡겨 근무표 생성·수합 화면과 같은 기준을 쓰게 한다.
    term = term_segments(day, day)[0][0]

    weekly: dict[str, list[AvailableTimeRow]] = {sid: [] for sid in student_ids}
    for row in (
        db.query(models.AvailableTime)
        .filter(
            models.AvailableTime.student_id.in_(student_ids),
            term_filter(models.AvailableTime.term, term),
        )
        .all()
    ):
        weekly[row.student_id].append(
            AvailableTimeRow(
                day_of_week=row.day_of_week,
                start_time=row.start_time,
                end_time=row.end_time,
                preference=row.preference,
            )
        )

    exceptions: dict[str, list[AvailabilityExceptionRow]] = {sid: [] for sid in student_ids}
    for row in (
        db.query(models.AvailabilityException)
        .filter(
            models.AvailabilityException.student_id.in_(student_ids),
            models.AvailabilityException.exception_date == day,
        )
        .all()
    ):
        exceptions[row.student_id].append(
            AvailabilityExceptionRow(
                exception_date=row.exception_date,
                exception_type=row.exception_type,
                start_time=row.start_time,
                end_time=row.end_time,
                preference=row.preference,
            )
        )

    policy = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
    mode = policy.availability_mode if policy else _DEFAULT_AVAILABILITY_MODE

    return {
        sid: materialize_availability(weekly[sid], exceptions[sid], mode, day, day)[day]
        for sid in student_ids
    }


def covers(intervals: list[Interval], start_time: time, end_time: time) -> bool:
    """구간들이 [start_time, end_time)을 빈틈없이 덮는가.

    맞닿은 구간은 이어서 센다 — 선호도가 달라 두 행으로 나뉘어 저장됐을 뿐,
    학생 입장에서는 연속으로 가능하다고 낸 시간이다.
    """
    cursor = start_time
    for interval_start, interval_end, _pref in sorted(intervals):
        if interval_start > cursor:
            return False  # 사이가 비었다
        if interval_end > cursor:
            cursor = interval_end
        if cursor >= end_time:
            return True
    return cursor >= end_time
