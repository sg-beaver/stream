"""재확정이 승인된 부분 대타를 되돌리는지 확인하는 재현 테스트 (#178).

부분 대타 승인(#123)은 확정(confirmed) 배치 안의 근무 행을 앞/대타/뒤로 쪼갠다.
그런데 POST /api/schedule/confirm은 기간이 겹치는 confirmed 배치를 통째로
superseded로 내리고 솔버가 낸 배정으로 새 배치를 채운다. 솔버는 대타 승인 이력을
입력으로 받지 않으므로, 재확정 후 대타 구간이 원 근무자에게 돌아가는지 본다.

시나리오는 "2주 확정 → 그 기간에 대타 승인 → 학기 고정으로 재확정"이라는
실제 운영 경로를 최소 형태로 줄인 것이다 (app/routers/schedule.py:1492 주석).

#230에서 확정 배치 생성을 `_materialize_confirmed_rows`(솔버 배정 + 승인된 대타)로
단일화해 고쳤다. 아래 두 테스트는 원래 strict xfail이었고, 지금은 회귀 테스트다.
"""

from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

# 지난 근무는 대타 요청·승인이 막히고, 근무일 D-2 이내인 근무도 요청 자체가
# 막히므로(REQ-SUB-010) 다음 월요일에 2주를 더해 상한을 넉넉히 벗어난다.
WORK_DATE = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7) + timedelta(weeks=2)
NEXT_WEEK = WORK_DATE + timedelta(days=7)


def _client_as(db_session, user_id, role):
    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id=user_id, role=role)

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def scenario(db_session):
    """부서 1곳, 직원 1명, 학생 2명(A=원 근무자, B=대타). 확정 근무는 API로 만든다."""
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()

    db_session.add(
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x")
    )
    db_session.add(models.Student(student_id="20221111", name="학생A", password_hash="x"))
    db_session.add(models.Student(student_id="20222222", name="학생B", password_hash="x"))

    posting = models.JobPosting(department_id=dept.department_id, title="테스트 공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add_all(
        [
            models.Application(student_id=s, posting_id=posting.posting_id, status="합격")
            for s in ("20221111", "20222222")
        ]
    )
    # B는 그 시간대에 근무 가능해야 대타 후보로 잡힌다
    db_session.add(
        models.AvailableTime(
            student_id="20222222", day_of_week=1, start_time=time(13, 0), end_time=time(19, 0),
            preference=2, source="manual",
        )
    )
    db_session.commit()
    return {"department_id": dept.department_id}


def _confirm(db_session, scenario, *, period_end, schedules):
    """솔버 배정을 확정한다 (직원)."""
    client = _client_as(db_session, "STF001", "staff")
    res = client.post(
        "/api/schedule/confirm",
        json={
            "department_id": scenario["department_id"],
            "period_start": WORK_DATE.isoformat(),
            "period_end": period_end.isoformat(),
            "schedules": schedules,
        },
    )
    assert res.status_code == 201, res.json()
    return res.json()


A_SHIFT = {
    "student_id": "20221111", "date": WORK_DATE.isoformat(),
    "start_time": "14:00", "end_time": "18:00",
}


def _active_rows(db_session, scenario):
    """화면이 보는 근무 — draft·superseded 배치는 제외한다."""
    rows = (
        db_session.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.department_id == scenario["department_id"],
            models.WorkSchedule.work_date == WORK_DATE,
            models.ScheduleBatch.status.in_(("confirmed", "manual")),
        )
        .all()
    )
    return sorted((r.start_time, r.end_time, r.student_id) for r in rows)


def _approve_partial_substitute(db_session, scenario):
    """A의 14-18 근무 중 15:00-17:00만 B에게 넘기고 승인까지 마친다."""
    schedule = (
        db_session.query(models.WorkSchedule)
        .filter(models.WorkSchedule.student_id == "20221111")
        .one()
    )
    res = _client_as(db_session, "20221111", "student").post(
        "/api/substitute-requests",
        json={
            "schedule_id": schedule.schedule_id,
            "reason": "시험 일정과 겹침",
            "start_time": "15:00",
            "end_time": "17:00",
        },
    )
    assert res.status_code == 201, res.json()
    request_id = res.json()["request_id"]

    res = _client_as(db_session, "20222222", "student").patch(
        f"/api/substitute-requests/{request_id}/respond",
        json={"substitute_id": "20222222", "response": "수락"},
    )
    assert res.status_code == 200, res.json()

    res = _client_as(db_session, "STF001", "staff").patch(
        f"/api/substitute-requests/{request_id}/approve"
    )
    assert res.status_code == 200, res.json()
    return request_id


def test_partial_substitute_splits_the_confirmed_shift(db_session, scenario):
    """전제 확인 — 승인되면 확정 근무가 앞/대타/뒤 3구간으로 쪼개진다 (#123)."""
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    _approve_partial_substitute(db_session, scenario)

    assert _active_rows(db_session, scenario) == [
        (time(14, 0), time(15, 0), "20221111"),
        (time(15, 0), time(17, 0), "20222222"),
        (time(17, 0), time(18, 0), "20221111"),
    ]


def test_reconfirm_keeps_the_approved_substitute(db_session, scenario):
    """재확정해도 승인된 대타 구간은 대타 학생 소유로 남아야 한다 (#178).

    같은 부서에서 기간이 겹치는 근무표를 다시 확정한다. 솔버 배정은 대타를 모르므로
    분할 전 원 근무(A 14-18) 그대로다.
    """
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    _approve_partial_substitute(db_session, scenario)

    _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[A_SHIFT])

    assert _active_rows(db_session, scenario) == [
        (time(14, 0), time(15, 0), "20221111"),
        (time(15, 0), time(17, 0), "20222222"),
        (time(17, 0), time(18, 0), "20221111"),
    ]


def test_approved_request_still_points_at_an_active_row_after_reconfirm(db_session, scenario):
    """승인된 요청이 가리키는 근무 행이 재확정 후에도 화면에 보이는 배치에 있어야 한다.

    이력 조회('요청 기록')가 superseded 배치의 행을 가리키게 되면 사용자에게
    무엇으로 보이는지가 달라진다 (#178).
    """
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    request_id = _approve_partial_substitute(db_session, scenario)

    _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[A_SHIFT])

    request = db_session.query(models.SubstituteRequest).filter_by(request_id=request_id).one()
    db_session.refresh(request)
    batch_status = (
        db_session.query(models.ScheduleBatch.status)
        .join(models.WorkSchedule)
        .filter(models.WorkSchedule.schedule_id == request.schedule_id)
        .scalar()
    )
    assert batch_status == "confirmed"


# ---- 얹을 자리가 없어진 경우 (#231) ----

B_SHIFT_ELSEWHERE = {
    "student_id": "20221111", "date": WORK_DATE.isoformat(),
    "start_time": "09:00", "end_time": "12:00",
}


def test_release_when_the_new_plan_has_no_slot_for_it(db_session, scenario):
    """새 계획에서 원 근무자가 그 시간에 근무하지 않으면 '해제됨'이 된다 (#231).

    조용히 되돌리는 대신 종결 상태로 만들어야, 근무표에는 없는데 요청 기록에는
    '승인'이라고 뜨는 불일치가 남지 않는다 (#178에서 실제로 관측된 증상).
    """
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    request_id = _approve_partial_substitute(db_session, scenario)

    # A를 오전으로 옮긴 계획으로 재확정 — 15~17시에는 A가 근무하지 않는다
    body = _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[B_SHIFT_ELSEWHERE])

    request = db_session.query(models.SubstituteRequest).filter_by(request_id=request_id).one()
    db_session.refresh(request)
    assert request.status == "해제됨"

    # 담당자가 확정 응답에서 바로 알 수 있어야 한다 — 예전에는 아무 표시가 없었다
    assert [r["request_id"] for r in body["released_substitutes"]] == [request_id]
    assert body["released_substitutes"][0]["substitute_id"] == "20222222"

    # 대타 구간이 B에게 남아 있지 않다 — 새 계획대로 A의 오전 근무만 있다
    assert _active_rows(db_session, scenario) == [(time(9, 0), time(12, 0), "20221111")]


def test_partially_covered_substitute_is_released_not_half_applied(db_session, scenario):
    """일부만 겹치면 얹지 않고 해제한다.

    승인된 것은 "15~17시를 B가 한다"인데 새 계획에서 A가 15~16시만 일한다면,
    겹치는 만큼만 넘기는 것은 B가 동의하지 않은 다른 근무를 만드는 일이다.
    사람이 다시 정하게 둔다.
    """
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    request_id = _approve_partial_substitute(db_session, scenario)

    partial = {
        "student_id": "20221111", "date": WORK_DATE.isoformat(),
        "start_time": "14:00", "end_time": "16:00",  # 요청 구간 15~17 중 15~16만 덮는다
    }
    body = _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[partial])

    request = db_session.query(models.SubstituteRequest).filter_by(request_id=request_id).one()
    db_session.refresh(request)
    assert request.status == "해제됨"
    assert [r["request_id"] for r in body["released_substitutes"]] == [request_id]
    assert _active_rows(db_session, scenario) == [(time(14, 0), time(16, 0), "20221111")]


def test_reconfirm_without_substitutes_reports_nothing(db_session, scenario):
    """되돌려진 대타가 없으면 목록은 비어 있다 — 경고가 상시 뜨지 않는다."""
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    body = _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[A_SHIFT])
    assert body["released_substitutes"] == []


def test_released_request_is_not_revived_by_a_later_reconfirm(db_session, scenario):
    """해제된 요청은 나중에 자리가 생겨도 되살아나지 않는다 — 종결 상태다."""
    _confirm(db_session, scenario, period_end=WORK_DATE, schedules=[A_SHIFT])
    request_id = _approve_partial_substitute(db_session, scenario)
    _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[B_SHIFT_ELSEWHERE])

    # 원래 자리가 그대로인 계획으로 다시 확정해도 대타는 돌아오지 않는다
    _confirm(db_session, scenario, period_end=NEXT_WEEK, schedules=[A_SHIFT])

    request = db_session.query(models.SubstituteRequest).filter_by(request_id=request_id).one()
    db_session.refresh(request)
    assert request.status == "해제됨"
    assert _active_rows(db_session, scenario) == [(time(14, 0), time(18, 0), "20221111")]
