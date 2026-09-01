"""근무표 생성은 월요일에만 시작할 수 있다 (HC-TIME-2 보호).

주 상한은 ISO 주(월~일) 전체가 기준인데, 기간이 주 중간에 시작하면 그 주가 기간
안팎으로 쪼개진다. 제약은 그리드 안의 슬롯만 세므로 **안쪽 조각만으로도 상한을
통째로** 받는다 — 2026-09-01(화) 시작 1주로 생성하니 연속 7일에 조수현 29.5h가
잡혔다 (상한 20h). ISO 주로는 16.5h + 13.0h라 솔버는 OPTIMAL로 통과시킨다.

`prior_weekly_hours` 차감(test_weekly_carryover.py)은 **이미 잡혀 있는** 근무만
빼므로, 그 주의 나머지가 아직 비어 있는 첫 회차는 막지 못한다. 그래서 시작일
자체를 ISO 주 경계에 맞추는 가드를 함께 둔다.
"""

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app
from app.routers import schedule as schedule_router

MONDAY = "2026-09-07"
TUESDAY = "2026-09-01"


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


def _stub_solver(monkeypatch, start_date):
    """솔버는 이 테스트의 관심사가 아니다 — 가드가 솔버 앞에서 걸리는지만 본다."""
    called = []

    def _fake(req, db):
        called.append(req)
        return {
            "policy_id": "library_info_service",
            "status": "OPTIMAL",
            "generated_count": 1,
            "schedules": [{
                "student_id": "20221234", "date": start_date,
                "start_time": "09:00", "end_time": "13:00",
            }],
            "shortages": [], "penalty_summary": {}, "per_student": [],
            "solve_time_seconds": 1.0, "alternatives": [], "num_alternatives_found": 1,
        }

    monkeypatch.setattr(schedule_router, "generate_schedule", _fake)
    return called


def test_monday_start_is_accepted(staff_client, department, monkeypatch):
    # 1주(7일)로 본다 — 2주는 격주 블록 경계까지 봐야 해서 월요일 규칙만 보기엔 섞인다
    # (그쪽은 test_biweekly_blocks.py가 담당한다).
    _stub_solver(monkeypatch, MONDAY)
    res = staff_client.post(
        "/api/schedule/generate",
        json={"department_id": 1, "start_date": MONDAY, "num_days": 7},
    )
    assert res.status_code == 200


def test_non_monday_start_is_rejected(staff_client, department, monkeypatch):
    called = _stub_solver(monkeypatch, TUESDAY)
    res = staff_client.post(
        "/api/schedule/generate",
        json={"department_id": 1, "start_date": TUESDAY, "num_days": 7},
    )
    assert res.status_code == 400
    # 담당자가 무엇을 고쳐야 하는지 알아야 한다 — 요일과 이유가 문구에 있어야 한다
    # (app.main의 예외 핸들러가 detail을 error 키로 감싼다)
    detail = res.json()["error"]
    assert "월요일" in detail
    assert "화요일" in detail
    # 솔버까지 가지 않고 막힌다 — 30초를 쓰고 나서 거부하면 안 된다
    assert called == []


def test_rejected_generation_leaves_no_batch(staff_client, department, monkeypatch, db_session):
    """거부된 생성이 draft를 남기면 다음 생성의 기근무로 잘못 집계된다."""
    _stub_solver(monkeypatch, TUESDAY)
    staff_client.post(
        "/api/schedule/generate",
        json={"department_id": 1, "start_date": TUESDAY, "num_days": 7},
    )
    assert db_session.query(models.ScheduleBatch).count() == 0
