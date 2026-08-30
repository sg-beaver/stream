"""근무 추가·이동이 개관 시간·휴관일을 지키는지 (#216).

솔버가 만든 draft는 개관 시간을 지키지만, 그 뒤에 사람이 손댄 배정
(챗봇 add_schedule·화면 draft 편집·수동 등록)은 개관 여부를 전혀 보지 않아
휴관일·개관 시간 밖에도 그대로 들어갔다. `verify_schedule`을 따로 돌려야만
HC-OPEN 위반으로 잡혔고, 안 돌리면 그대로 확정될 수 있었다.

기준은 `OpeningHoursResolver`(솔버·검증기가 쓰는 그 판정)를 그대로 쓴다 —
추가 경로가 다른 기준을 쓰면 "추가는 되는데 검증은 위반이라는" 상태가 된다.

2026-09 기준 (정보서비스팀 기본 정책):
  09/07(월) 08:00~22:00 개관 / 09/12(토) 09:00~17:00 / 09/13(일) 폐관
  09/25(금) 추석 폐관
"""

import datetime

import pytest

from app import models
from tests.test_schedule_draft_edits_api import (  # noqa: F401
    MONDAY,
    _client_as,
    _clear_overrides,
    _edit,
    _t,
    scenario,
)

SUNDAY = datetime.date(2026, 9, 13)      # 요일 규칙상 폐관
SATURDAY = datetime.date(2026, 9, 12)    # 09:00~17:00만 개관
CHUSEOK_FRIDAY = datetime.date(2026, 9, 25)  # 학사 캘린더 폐관일


@pytest.fixture
def client(db_session, scenario):
    return _client_as(db_session, "STF001", "staff")


def _add(client, scenario, day, start, end, student_id="20221111"):
    return _edit(client, [{
        "op": "add",
        "batch_id": scenario["draft"].batch_id,
        "student_id": student_id,
        "work_date": day.isoformat(),
        "start_time": start,
        "end_time": end,
    }])


def test_add_on_a_closed_weekday_is_rejected(client, scenario):
    """일요일은 부서가 문을 닫는다 — 배정이 들어가면 안 된다."""
    res = _add(client, scenario, SUNDAY, "10:00", "12:00")
    assert res.status_code == 400, res.json()


def test_add_on_a_calendar_closure_is_rejected(client, scenario):
    """추석 폐관일도 마찬가지 — 요일이 아니라 학사 캘린더가 정한 휴관이다."""
    res = _add(client, scenario, CHUSEOK_FRIDAY, "10:00", "12:00")
    assert res.status_code == 400, res.json()


def test_add_outside_opening_hours_is_rejected(client, scenario):
    """토요일은 17시에 닫는다 — 18~20시는 개관 밖이다."""
    res = _add(client, scenario, SATURDAY, "18:00", "20:00")
    assert res.status_code == 400, res.json()


def test_add_partially_outside_opening_hours_is_rejected(client, scenario):
    """일부만 개관 밖이어도 거부한다 — 16~18시는 뒤 1시간이 폐관 뒤다."""
    res = _add(client, scenario, SATURDAY, "16:00", "18:00")
    assert res.status_code == 400, res.json()


def test_add_inside_opening_hours_still_works(client, scenario):
    """과잉 차단이 아님 — 개관 시간 안이면 종전대로 들어간다."""
    res = _add(client, scenario, SATURDAY, "10:00", "12:00")
    assert res.status_code == 200, res.json()


def test_move_into_a_closed_day_is_rejected(client, scenario):
    """이동도 같은 검사를 거친다 — 추가만 막으면 옮겨서 우회된다."""
    res = _edit(client, [{
        "op": "move",
        "schedule_id": scenario["draft_a"].schedule_id,
        "work_date": SUNDAY.isoformat(),
        "start_time": "10:00",
        "end_time": "12:00",
    }])
    assert res.status_code == 400, res.json()


def _manual(client, scenario, day, start, end):
    return client.post("/api/schedule/manual", json={
        "department_id": scenario["dept"].department_id,
        "student_id": "20221111",
        "work_date": day.isoformat(),
        "start_time": start,
        "end_time": end,
    })


def test_manual_registration_on_a_closed_day_is_rejected(client, scenario):
    """수동 등록만 열어두면 휴관일 배정이 그리로 들어온다 — 같은 기준을 쓴다."""
    res = _manual(client, scenario, SUNDAY, "10:00", "12:00")
    assert res.status_code == 400, res.json()


def test_manual_registration_inside_opening_hours_still_works(client, scenario):
    res = _manual(client, scenario, SATURDAY, "10:00", "12:00")
    assert res.status_code == 201, res.json()


def test_closed_day_rejection_says_it_is_a_closure(client, scenario):
    """휴관일이라 막혔다는 것과 그 날짜가 문구에 담겨야 한다 — 담당자는 날짜를 옮겨야 한다."""
    message = _add(client, scenario, SUNDAY, "10:00", "12:00").json()["error"]
    assert "휴관일" in message, message
    assert SUNDAY.isoformat() in message, message


def test_outside_hours_rejection_says_the_opening_hours(client, scenario):
    """개관 시간 밖이라 막혔을 때는 그 날의 개관 시간을 알려줘야 한다 — 시간을 당기면 된다."""
    message = _add(client, scenario, SATURDAY, "18:00", "20:00").json()["error"]
    assert "09:00~17:00" in message, message
    assert "18:00~20:00" in message, message
