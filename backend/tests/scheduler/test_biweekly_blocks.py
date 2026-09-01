"""격주 배정 블록 경계 (app/biweekly.py).

부서는 2주씩 끊어서 계속 돌리고, 그 2주가 어디서 끊기는지는 학년도마다 고정이다 —
3월 개강 첫날이 든 주가 1주차. 2026학년도는 개강이 2026-03-03(화)이므로 1주차 월요일이
2026-03-02이고, 블록 시작은 거기서 14일 간격이다.

담당자가 준 기준: 08-31·09-14·09-28은 되고 09-07·09-21은 안 된다.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth, biweekly, models
from app.database import get_db
from app.main import app
from app.routers import schedule as schedule_router

# 2026학년도 1주차 월요일 (개강 2026-03-03 화요일이 든 주)
ANCHOR = date(2026, 3, 2)


def test_anchor_is_the_monday_of_the_march_opening_week():
    assert biweekly.anchor_monday(date(2026, 9, 1)) == ANCHOR
    # 개강일 자신도 같은 앵커를 가리킨다
    assert biweekly.anchor_monday(date(2026, 3, 3)) == ANCHOR


def test_academic_year_runs_march_to_february():
    """남는 날짜는 2월 말에 처리하므로 학년도는 3월에 시작해 다음 해 2월에 끝난다."""
    assert biweekly.academic_year_of(date(2026, 3, 1)) == 2026
    assert biweekly.academic_year_of(date(2026, 12, 31)) == 2026
    assert biweekly.academic_year_of(date(2027, 2, 28)) == 2026
    assert biweekly.academic_year_of(date(2027, 3, 1)) == 2027


@pytest.mark.parametrize("iso, index", [
    ("2026-03-02", 1),    # 개강 주
    ("2026-08-31", 27),
    ("2026-09-07", 28),
    ("2026-09-14", 29),
    ("2026-09-21", 30),
    ("2026-09-28", 31),
])
def test_week_index_counts_from_the_opening_week(iso, index):
    assert biweekly.week_index(date.fromisoformat(iso)) == index


@pytest.mark.parametrize("iso", ["2026-03-02", "2026-08-31", "2026-09-14", "2026-09-28"])
def test_block_starts(iso):
    assert biweekly.is_block_start(date.fromisoformat(iso))


@pytest.mark.parametrize("iso", ["2026-09-07", "2026-09-21", "2026-03-09"])
def test_mid_block_mondays_are_not_block_starts(iso):
    """짝수 주차 월요일은 블록 한가운데다 — 여기서 시작하면 이후 주기가 통째로 밀린다."""
    assert not biweekly.is_block_start(date.fromisoformat(iso))


def test_non_monday_is_never_a_block_start():
    assert not biweekly.is_block_start(date(2026, 9, 1))  # 화요일


def test_unknown_academic_year_falls_back_to_monday_only():
    """학사 캘린더가 없는 해를 기준 없이 막으면 아무 날짜도 못 고른다."""
    assert biweekly.anchor_monday(date(2030, 9, 2)) is None
    assert biweekly.is_block_start(date(2030, 9, 2))       # 월요일
    assert not biweekly.is_block_start(date(2030, 9, 3))   # 화요일


@pytest.mark.parametrize("iso, expected", [
    ("2026-09-07", ("2026-08-31", "2026-09-14")),   # 블록 중간 → 앞뒤 블록 시작
    ("2026-09-10", ("2026-08-31", "2026-09-14")),   # 주중이어도 그 주가 속한 블록 기준
    ("2026-09-14", ("2026-09-14", "2026-09-28")),   # 이미 블록 시작이면 자신과 다음
])
def test_surrounding_block_starts(iso, expected):
    previous, following = biweekly.surrounding_block_starts(date.fromisoformat(iso))
    assert (previous.isoformat(), following.isoformat()) == expected


# ---- 라우터 가드 ----


@pytest.fixture
def staff_client(db_session):
    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id="STF001", role="staff")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def department(db_session):
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(
        models.Staff(staff_id="STF001", name="박정보", department_id=1, password_hash="x")
    )
    db_session.commit()


@pytest.fixture
def stub_solver(monkeypatch):
    calls = []

    def _fake(req, db):
        calls.append(req)
        return {
            "policy_id": "library_info_service", "status": "OPTIMAL", "generated_count": 0,
            "schedules": [], "shortages": [], "penalty_summary": {}, "per_student": [],
            "solve_time_seconds": 1.0, "alternatives": [], "num_alternatives_found": 1,
        }

    monkeypatch.setattr(schedule_router, "generate_schedule", _fake)
    return calls


def _generate(client, start, num_days):
    return client.post(
        "/api/schedule/generate",
        json={"department_id": 1, "start_date": start, "num_days": num_days},
    )


def test_two_week_run_from_a_block_start_is_accepted(staff_client, department, stub_solver):
    assert _generate(staff_client, "2026-08-31", 14).status_code == 200


def test_two_week_run_from_mid_block_is_rejected(staff_client, department, stub_solver):
    res = _generate(staff_client, "2026-09-07", 14)
    assert res.status_code == 400
    error = res.json()["error"]
    # 안 되는 이유와 쓸 수 있는 날짜가 함께 있어야 담당자가 달력을 세지 않는다
    assert "28주차" in error
    assert "2026-08-31" in error and "2026-09-14" in error
    assert stub_solver == []


def test_four_week_run_also_follows_the_block_grid(staff_client, department, stub_solver):
    """4주는 블록 두 개다 — 블록 중간에서 시작하면 두 블록 다 어긋난다."""
    assert _generate(staff_client, "2026-09-07", 28).status_code == 400
    assert _generate(staff_client, "2026-08-31", 28).status_code == 200


@pytest.mark.parametrize("num_days", [7, 21])
def test_odd_week_runs_only_need_a_monday(staff_client, department, stub_solver, num_days):
    """1주·3주는 애초에 격주 주기에 얹히지 않는다 — 월요일 검사까지만 한다."""
    assert _generate(staff_client, "2026-09-07", num_days).status_code == 200
    assert _generate(staff_client, "2026-09-08", num_days).status_code == 400
