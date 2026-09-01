"""격주 배정 블록 경계 (2주 단위 근무표 생성).

부서는 근무표를 2주씩 끊어서 계속 돌린다. 이 2주가 **어디서 끊기는지는 학년도마다
한 번 정해지고 그 뒤로 고정**이다 — 아무 월요일에서나 2주를 시작할 수 있는 게 아니다.

    3월 개강 첫날이 든 주 = 1주차
    1-2주차 / 3-4주차 / 5-6주차 … 로 계속 나간다
    남는 날짜는 2월 말(다음 3월 개강 전)에 몰아서 처리한다

그래서 2026학년도(개강 2026-03-03 화)의 격주 경계는 2026-03-02(월)부터 14일 간격이다.
2026-08-31·09-14·09-28은 블록 시작이고, 09-07·09-21은 블록 **중간**이라 여기서
2주를 새로 시작하면 그 뒤 모든 블록이 부서의 주기와 어긋난다.

`work_hours.py`·`opening_hours.py`·`overlap.py`와 같은 층에 둔다 — 이 판정을 쓰는 곳이
라우터 말고도 늘어날 수 있고, 갈라지면 화면과 API가 서로 다른 날짜를 허용하게 된다.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.scheduler.config import load_academic_calendar

BLOCK_DAYS = 14


def academic_year_of(day: date) -> int:
    """그날이 속한 학년도. 3월 개강으로 시작해 다음 해 2월 말에 끝난다."""
    return day.year if day.month >= 3 else day.year - 1


def anchor_monday(day: date) -> date | None:
    """그 학년도 1주차의 월요일 — 3월 개강 첫날이 든 주의 월요일.

    학사 캘린더가 없는 해는 None. 부르는 쪽은 '격주 판정을 할 수 없다'로 읽고
    월요일 검사만 하면 된다 — 없는 기준으로 날짜를 막는 것보다 낫다.
    """
    try:
        calendar = load_academic_calendar(academic_year_of(day))
    except FileNotFoundError:
        return None
    starts = [s.start for s in calendar.semesters]
    if not starts:
        return None
    spring = min(starts)  # 학기 목록의 첫 구간 = 3월 개강
    return spring - timedelta(days=spring.weekday())


def week_index(day: date) -> int | None:
    """그 학년도 기준 몇 주차인지 (1주차 = 1). 기준을 모르면 None."""
    anchor = anchor_monday(day)
    if anchor is None:
        return None
    return (day - anchor).days // 7 + 1


def is_block_start(day: date) -> bool:
    """2주 블록을 여기서 시작해도 되는 날인지.

    월요일이면서 홀수 주차(1·3·5…)여야 한다. 기준을 모르는 해는 월요일이면 통과시킨다.
    """
    if day.weekday() != 0:
        return False
    index = week_index(day)
    return index is None or index % 2 == 1


def surrounding_block_starts(day: date) -> tuple[date, date]:
    """day를 감싸는 직전·다음 블록 시작일.

    "그 날짜는 안 됩니다"로 끝내면 담당자가 달력을 세어야 한다. 쓸 수 있는 날짜를
    같이 준다. day 자체가 블록 시작이면 (day, day + 2주)를 돌려준다.
    """
    monday = day - timedelta(days=day.weekday())
    if not is_block_start(monday):
        monday -= timedelta(days=7)
    return monday, monday + timedelta(days=BLOCK_DAYS)
