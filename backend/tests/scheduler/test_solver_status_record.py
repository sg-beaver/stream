"""#84 — Solver status·solve_time 기록 보강.

CP-SAT는 시간 제한으로 최적해(OPTIMAL)가 아닌 중간 해(FEASIBLE)를 반환할 수
있으므로, 확정된 시간표가 어떤 상태로 풀렸는지 사후 추적할 수 있어야 한다.
- Solver 실행 시 status·solve_time이 서버 로그에 남는지
- DB에 저장되는 solver_summary에 status·solve_time_seconds가 포함되는지
"""

import logging
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app
from app.routers import schedule as schedule_router
from app.scheduler.config import (
    load_academic_calendar,
    load_department_policy,
    load_sample_students,
)
from app.scheduler.engine import ScheduleSolver


def test_solve_logs_status_and_solve_time(caplog):
    policy = load_department_policy("library_info_service")
    students, start_date, _ = load_sample_students("students_sample")
    calendar = load_academic_calendar(start_date.year)
    solver = ScheduleSolver(
        policy=policy,
        calendar=calendar,
        students=students,
        start_date=start_date,
        num_days=2,  # 로깅 확인 목적이라 기간을 짧게 잡아 풀이 시간을 줄인다
    )

    with caplog.at_level(logging.INFO, logger="app.scheduler.engine.solver"):
        result, _ = solver.solve(time_limit_seconds=10.0)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert "Solver 종료" in caplog.text
    assert f"status={result.status}" in caplog.text
    assert "solve_time=" in caplog.text


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


def test_generate_stores_status_in_solver_summary(staff_client, db_session, monkeypatch):
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(
        models.Staff(staff_id="STF001", name="박정보", department_id=1, password_hash="x")
    )
    db_session.commit()

    fake_response = {
        "policy_id": "library_info_service",
        "status": "FEASIBLE",
        "generated_count": 1,
        "schedules": [
            {
                "student_id": "20221234",
                "date": "2026-09-01",
                "start_time": "09:00",
                "end_time": "13:00",
            }
        ],
        "shortages": [],
        "penalty_summary": {},
        "per_student": [],
        "solve_time_seconds": 30.0,
        "alternatives": [],
        "num_alternatives_found": 1,
    }
    monkeypatch.setattr(
        schedule_router, "generate_schedule", lambda req, db: dict(fake_response)
    )

    res = staff_client.post(
        "/api/schedule/generate",
        json={"department_id": 1, "start_date": "2026-09-01", "num_days": 14},
    )
    assert res.status_code == 200

    batch = db_session.query(models.ScheduleBatch).one()
    # OPTIMAL/FEASIBLE 여부와 풀이 시간이 남아야 사후에 조기 종료 여부를 추적할 수 있다
    assert batch.solver_summary["status"] == "FEASIBLE"
    assert batch.solver_summary["solve_time_seconds"] == 30.0
