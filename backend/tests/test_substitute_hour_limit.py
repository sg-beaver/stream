"""대타가 주간 근로 시간 상한을 넘기지 못하게 (#159).

승인은 근무 담당자를 실제로 바꾼다 — 대타 학생의 그 주 근로 시간이 그만큼 늘어난다.
확정·수동 등록·draft 편집은 모두 같은 상한을 검사하는데 대타 승인만 빠져 있어,
승인 한 번으로 확정 근무표가 HC-TIME-1/2 위반 상태가 됐다.

여기서 고정하는 것:
  1. 상한을 넘길 학생은 **후보 목록에 나오지 않는다** — 승인할 수 없는 사람을
     고르게 두지 않는다
  2. 후보를 거치지 않고 수락 상태가 되더라도 **승인이 400으로 막힌다** — 목록을
     본 시점과 승인 시점 사이에 근무가 늘 수 있다
  3. 여유가 있으면 종전대로 승인된다 (과잉 차단이 아님)
"""

from datetime import time, timedelta

import pytest

from app import models
from tests.test_substitute_requests import (  # noqa: F401
    WORK_DATE,
    _clear_overrides,
    _client_as,
    scenario,
)


def _fill_week(db_session, scenario, student_id, hours):
    """그 학생의 주간 근로 시간을 hours만큼 채운다 (근무일과 다른 날에)."""
    other_day = WORK_DATE + timedelta(days=1)
    db_session.add(models.WorkSchedule(
        batch_id=scenario["schedule"].batch_id, student_id=student_id,
        department_id=scenario["department_id"], work_date=other_day,
        start_time=time(9, 0), end_time=time(9 + int(hours), 0),
    ))
    db_session.commit()


def _accepted_request(db_session, scenario, substitute_id):
    request = models.SubstituteRequest(
        schedule_id=scenario["schedule"].schedule_id,
        requester_id="20221111",
        start_time=scenario["schedule"].start_time,
        end_time=scenario["schedule"].end_time,
        substitute_id=substitute_id,
        status="수락",
    )
    db_session.add(request)
    db_session.commit()
    return request


def _candidate_ids(db_session, scenario):
    client = _client_as(db_session, "STF001", "staff")
    request = models.SubstituteRequest(
        schedule_id=scenario["schedule"].schedule_id,
        requester_id="20221111",
        start_time=scenario["schedule"].start_time,
        end_time=scenario["schedule"].end_time,
        status="대기",
    )
    db_session.add(request)
    db_session.commit()
    res = client.get(f"/api/substitute-requests/{request.request_id}/candidates")
    assert res.status_code == 200, res.json()
    return {c["student_id"] for c in res.json()}


def test_candidate_at_the_weekly_cap_is_not_listed(db_session, scenario):
    """가능 시간이 비어 있어도 그 주 상한에 닿았으면 대타를 설 수 없다."""
    assert "20222222" in _candidate_ids(db_session, scenario)  # 채우기 전에는 후보

    # 근무는 4시간(14:00~18:00). 교비 상한 14시간에서 12시간을 채우면 2시간만 남는다
    _fill_week(db_session, scenario, "20222222", 12)
    assert "20222222" not in _candidate_ids(db_session, scenario)
    assert "20223333" in _candidate_ids(db_session, scenario)  # 여유 있는 학생은 그대로


def test_approving_over_the_cap_is_rejected(db_session, scenario):
    """후보를 거치지 않고 수락 상태가 되어도 승인에서 막힌다."""
    _fill_week(db_session, scenario, "20222222", 12)
    request = _accepted_request(db_session, scenario, "20222222")

    client = _client_as(db_session, "STF001", "staff")
    res = client.patch(f"/api/substitute-requests/{request.request_id}/approve", json={})
    assert res.status_code == 400
    assert "상한" in res.json()["error"]

    # 막혔으면 근무 담당자도 그대로여야 한다
    db_session.refresh(scenario["schedule"])
    assert scenario["schedule"].student_id == "20221111"
    db_session.refresh(request)
    assert request.status == "수락"


def test_approving_within_the_cap_still_works(db_session, scenario):
    """여유가 있으면 종전대로 승인된다 — 과잉 차단이 아니다."""
    _fill_week(db_session, scenario, "20222222", 4)
    request = _accepted_request(db_session, scenario, "20222222")

    client = _client_as(db_session, "STF001", "staff")
    res = client.patch(f"/api/substitute-requests/{request.request_id}/approve", json={})
    assert res.status_code == 200, res.json()

    db_session.refresh(scenario["schedule"])
    assert scenario["schedule"].student_id == "20222222"


def test_the_requesters_own_hours_do_not_block_the_substitute(db_session, scenario):
    """상한은 대타 학생 기준이다 — 요청자가 꽉 차 있어도 대타는 설 수 있다."""
    _fill_week(db_session, scenario, "20221111", 12)
    request = _accepted_request(db_session, scenario, "20222222")

    client = _client_as(db_session, "STF001", "staff")
    assert client.patch(
        f"/api/substitute-requests/{request.request_id}/approve", json={}
    ).status_code == 200


# 교비 상한 14시간, 넘기는 구간 2시간 → 12시간까지는 딱 맞아 통과, 13시간이면 초과
@pytest.mark.parametrize("filled, expected", [(9, 200), (12, 200), (13, 400)])
def test_partial_substitution_is_measured_by_the_requested_segment(
    db_session, scenario, filled, expected
):
    """부분 대타(#123)는 넘기는 구간만큼만 대타 학생 시간이 는다.

    근무는 4시간인데 요청 구간이 2시간이면, 2시간만 들어갈 여유가 있으면 된다.
    """
    _fill_week(db_session, scenario, "20222222", filled)
    request = models.SubstituteRequest(
        schedule_id=scenario["schedule"].schedule_id,
        requester_id="20221111",
        start_time=time(14, 0), end_time=time(16, 0),  # 4시간 근무 중 앞 2시간만
        substitute_id="20222222", status="수락",
    )
    db_session.add(request)
    db_session.commit()

    client = _client_as(db_session, "STF001", "staff")
    res = client.patch(f"/api/substitute-requests/{request.request_id}/approve", json={})
    assert res.status_code == expected, res.json()
