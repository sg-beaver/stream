"""개관 시간·휴관일 검증 (#216).

솔버는 개관 슬롯 안에서만 배정하지만, **그 뒤에 사람이 얹는 근무**(챗봇 편집·화면
draft 편집·수동 등록)는 이 검사를 안 거쳐 휴관일에도 그대로 들어갔다.
`verify_schedule`을 따로 돌려야만 HC-OPEN 위반으로 잡혔고, 안 돌리면 위반인 채로
확정될 수 있었다. 그래서 상한 검증(`app/work_hours.py`)과 같은 이유로 라우터가
아니라 여기에 둔다 — 근무를 새로 얹는 경로가 여럿이고 모두 같은 기준을 써야 한다.

판정은 솔버·검증기가 쓰는 `OpeningHoursResolver`를 그대로 재사용한다. 추가 경로가
자기만의 기준을 두면 "추가는 되는데 검증기는 위반이라는" 상태가 된다.
"""

from datetime import date, time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.scheduler.config import load_academic_calendar, load_department_policy
from app.scheduler.domain.calendar import OpeningHoursResolver
from app.scheduler.domain.timegrid import minutes_to_str
from app.scheduler.service import apply_department_overrides, resolve_policy_file_key

_WEEKDAY_NAMES = ("월", "화", "수", "목", "금", "토", "일")


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _day_label(work_date: date) -> str:
    return f"{work_date.isoformat()}({_WEEKDAY_NAMES[work_date.weekday()]})"


def open_ranges(
    db: Session, department_id: int, work_date: date
) -> list[tuple[int, int]]:
    """그 날짜의 개관 구간 목록 (분 단위). 빈 목록이면 휴관일."""
    policy = apply_department_overrides(
        db,
        department_id,
        load_department_policy(resolve_policy_file_key(db, department_id)),
    )
    calendar = load_academic_calendar(work_date.year)
    return OpeningHoursResolver(policy, calendar).resolve(work_date)


def check_within_opening_hours(
    db: Session,
    department_id: int,
    work_date: date,
    start_time: time,
    end_time: time,
) -> None:
    """그 시간대가 부서 개관 시간 안에 온전히 들어가는지 검사한다. 아니면 400.

    막을 때는 **왜 막혔는지**를 문구에 담는다 — 휴관일인지, 개관 시간 밖인지에
    따라 담당자가 할 일이 다르다(날짜를 옮기거나, 시간을 당기거나).

    구간이 여러 개인 날(점심 휴관 등)에는 **한 구간 안에 통째로** 들어가야 한다.
    구간 사이의 닫힌 시간을 가로지르는 근무는 그 사이가 폐관이라 허용할 수 없다.
    """
    ranges = open_ranges(db, department_id, work_date)
    if not ranges:
        raise HTTPException(
            status_code=400,
            detail=f"{_day_label(work_date)}은(는) 부서 휴관일이라 근무를 배정할 수 없습니다.",
        )

    start, end = _minutes(start_time), _minutes(end_time)
    if any(open_min <= start and end <= close_min for open_min, close_min in ranges):
        return

    opened = ", ".join(
        f"{minutes_to_str(open_min)}~{minutes_to_str(close_min)}"
        for open_min, close_min in ranges
    )
    raise HTTPException(
        status_code=400,
        detail=(
            f"{_day_label(work_date)}의 개관 시간은 {opened}입니다. "
            f"요청하신 {minutes_to_str(start)}~{minutes_to_str(end)}은(는) "
            "개관 시간 밖이라 배정할 수 없습니다."
        ),
    )
