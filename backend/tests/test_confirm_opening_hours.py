"""확정도 개관 시간·휴관일을 지키는지 (#216의 빠진 경로).

#216이 `check_within_opening_hours`를 공용으로 뽑아 draft 편집·수동 등록에 걸었는데
**확정 경로에는 없었다.** 확정 직전 재검증은 주간 상한과 겹침만 다시 보고 개관 여부는
건너뛰어서, 휴관일·개관 시간 밖 근무가 그대로 확정본이 됐다 — "추가는 막히는데 확정은
통과한다"는 상태다. `verify_schedule`을 따로 돌려야만 HC-OPEN 위반으로 잡혔다.

2026-09 기준 (정보서비스팀 기본 정책):
  09/07(월) 08:00\~22:00 개관 / 09/13(일) 폐관 / 09/25(금) 추석 폐관
"""

import datetime

import pytest

from tests.test_schedule_draft_edits_api import (  # noqa: F401
    MONDAY,
    _client_as,
    _clear_overrides,
    scenario,
)

SUNDAY = datetime.date(2026, 9, 13)          # 요일 규칙상 폐관
CHUSEOK_FRIDAY = datetime.date(2026, 9, 25)  # 학사 캘린더 폐관일


@pytest.fixture
def client(db_session, scenario):
    return _client_as(db_session, "STF001", "staff")


def _confirm(client, scenario, day, start, end):
    return client.post("/api/schedule/confirm", json={
        "department_id": scenario["dept"].department_id,
        "period_start": day.isoformat(),
        "period_end": day.isoformat(),
        "schedules": [{
            "student_id": "20221111",
            "date": day.isoformat(),
            "start_time": start,
            "end_time": end,
        }],
    })


def test_confirm_on_a_closed_weekday_is_rejected(client, scenario):
    res = _confirm(client, scenario, SUNDAY, "10:00", "12:00")
    assert res.status_code == 400, res.text
    assert "휴관일" in res.json()["error"]


def test_confirm_on_a_calendar_closure_is_rejected(client, scenario):
    res = _confirm(client, scenario, CHUSEOK_FRIDAY, "10:00", "12:00")
    assert res.status_code == 400, res.text
    assert "휴관일" in res.json()["error"]


def test_confirm_outside_opening_hours_is_rejected(client, scenario):
    res = _confirm(client, scenario, MONDAY, "05:00", "07:00")
    assert res.status_code == 400, res.text
    assert "개관 시간" in res.json()["error"]


def test_confirm_inside_opening_hours_still_works(client, scenario):
    """과잉 차단이 아니어야 한다 — 개관 시간 안이면 종전대로 확정된다."""
    res = _confirm(client, scenario, MONDAY, "10:00", "12:00")
    assert res.status_code == 201, res.text
