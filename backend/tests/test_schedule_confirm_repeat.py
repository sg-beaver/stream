"""학기 고정 확정(repeat_until) API 테스트.

POST /api/schedule/confirm에 repeat_until을 주면 서버가 대표 기간 배정을
주 단위로 복제해 저장한다 — 공휴일 단축·폐관을 실제 학사 일정으로 반영하고,
조정된 날짜를 adjusted_dates로 돌려준다. 2026 캘린더 실데이터 기준:
추석 폐관 9/24-26, 한글날 10/9(금) 단축 09-17, 2학기 9/1~12/21.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1
PERIOD_START = "2026-09-07"  # 월요일
PERIOD_END = "2026-09-20"    # 2주


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
        )
    )
    db_session.add(
        models.Student(student_id="20220001", name="학생A", password_hash="x")
    )
    db_session.commit()

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


def confirm(client, *, schedules, repeat_until=None, period_start=PERIOD_START, period_end=PERIOD_END):
    payload = {
        "department_id": DEPT_ID,
        "period_start": period_start,
        "period_end": period_end,
        "schedules": schedules,
    }
    if repeat_until is not None:
        payload["repeat_until"] = repeat_until
    return client.post("/api/schedule/confirm", json=payload)


MONDAY_ITEM = {
    "student_id": "20220001", "date": PERIOD_START,
    "start_time": "09:00", "end_time": "12:00",
}


class TestRepeatConfirm:
    def test_expands_weekly_until_repeat_until(self, staff_client, db_session):
        res = confirm(staff_client, schedules=[MONDAY_ITEM], repeat_until="2026-10-18")
        assert res.status_code == 201, res.json()
        body = res.json()
        # 월요일 배정이 9/7·9/21·10/5로 복제 (10/19는 초과)
        assert body["confirmed_count"] == 3
        batch = db_session.query(models.ScheduleBatch).one()
        assert batch.status == "confirmed"
        assert batch.period_end == date(2026, 10, 18)
        dates = sorted(
            r.work_date for r in db_session.query(models.WorkSchedule).all()
        )
        assert dates == [date(2026, 9, 7), date(2026, 9, 21), date(2026, 10, 5)]

    def test_closure_and_holiday_adjustments_reported(self, staff_client, db_session):
        """추석 폐관(9/24 목)과 한글날 단축(10/9 금 09-17)이 실제로 반영된다."""
        items = [
            # 목요일 09-12 → 9/24(추석 폐관)에 제거
            {"student_id": "20220001", "date": "2026-09-10",
             "start_time": "09:00", "end_time": "12:00"},
            # 금요일 08-10 → 10/9(한글날, 09-17 단축)에 09-10으로 클리핑
            {"student_id": "20220001", "date": "2026-09-11",
             "start_time": "08:00", "end_time": "10:00"},
        ]
        res = confirm(staff_client, schedules=items, repeat_until="2026-10-11")
        assert res.status_code == 201, res.json()
        adjusted = {a["date"]: a["reason"] for a in res.json()["adjusted_dates"]}
        assert adjusted["2026-09-24"] == "폐관 제외"
        assert adjusted["2026-10-09"] == "개관 시간에 맞춰 조정"

        rows = {
            (r.work_date.isoformat(), r.start_time.strftime("%H:%M"), r.end_time.strftime("%H:%M"))
            for r in db_session.query(models.WorkSchedule).all()
        }
        assert ("2026-10-09", "09:00", "10:00") in rows   # 클리핑 결과
        assert not any(d == "2026-09-24" for d, *_ in rows)  # 폐관 제거

    def test_promotes_existing_draft_with_different_period_end(self, staff_client, db_session):
        """학기 확정은 period_end가 draft와 달라도 시작일 기준으로 draft를 승격한다."""
        draft = models.ScheduleBatch(
            department_id=DEPT_ID,
            period_start=date(2026, 9, 7),
            period_end=date(2026, 9, 20),
            status="draft",
            created_by="STF001",
        )
        db_session.add(draft)
        db_session.commit()
        draft_id = draft.batch_id

        res = confirm(staff_client, schedules=[MONDAY_ITEM], repeat_until="2026-10-18")
        assert res.status_code == 201
        assert res.json()["batch_id"] == draft_id
        assert db_session.query(models.ScheduleBatch).count() == 1  # 고아 draft 없음

    def test_reconfirm_supersedes_overlapping_confirmed(self, staff_client, db_session):
        """2주 확정 후 같은 계획을 학기 고정으로 재확정하면 이전 확정본이 내려간다."""
        first = confirm(staff_client, schedules=[MONDAY_ITEM])
        assert first.status_code == 201
        second = confirm(staff_client, schedules=[MONDAY_ITEM], repeat_until="2026-10-18")
        assert second.status_code == 201

        statuses = sorted(b.status for b in db_session.query(models.ScheduleBatch).all())
        assert statuses == ["confirmed", "superseded"]

    def test_repeat_until_before_period_end_rejected(self, staff_client):
        res = confirm(staff_client, schedules=[MONDAY_ITEM], repeat_until="2026-09-14")
        assert res.status_code == 400
        assert "빠릅니다" in res.json()["error"]

    def test_cross_year_repeat_rejected(self, staff_client):
        res = confirm(staff_client, schedules=[MONDAY_ITEM], repeat_until="2027-03-01")
        assert res.status_code == 400
        assert "같은 해" in res.json()["error"]

    def test_without_repeat_until_unchanged(self, staff_client, db_session):
        """repeat_until 없이는 기존 동작 그대로 — 기간 내 행만, adjusted 없음."""
        res = confirm(staff_client, schedules=[MONDAY_ITEM])
        assert res.status_code == 201
        body = res.json()
        assert body["confirmed_count"] == 1
        assert body["adjusted_dates"] == []
        assert db_session.query(models.WorkSchedule).count() == 1
