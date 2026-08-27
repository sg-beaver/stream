"""GET/PUT /api/availability/me — 학생 본인 가능 시간 조회·통째 교체 (REQ-SCHED-014)."""

from datetime import time

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app


@pytest.fixture
def client(db_session):
    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id="20221234", role="student")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def student(db_session):
    s = models.Student(student_id="20221234", name="김서강", password_hash="x")
    db_session.add(s)
    db_session.commit()
    return s


def test_get_my_availability_empty(client, student):
    res = client.get("/api/availability/me")
    assert res.status_code == 200
    body = res.json()
    assert body["slots"] == []
    # 학기를 지정하지 않으면 서버가 오늘 기준 학기를 골라 알려준다 (#89 후속)
    assert body["term"]


def test_put_replaces_and_get_reflects_it(client, student):
    slots = ["화-09:00", "화-10:00", "목-14:00"]
    res = client.put("/api/availability/me", json={"slots": slots})
    assert res.status_code == 200
    assert sorted(res.json()["slots"]) == sorted(slots)

    # 붙어있는 화-09:00/10:00은 한 구간(09:00~11:00)으로 병합돼 저장됐는지 확인
    rows = client.get("/api/availability/me")
    assert sorted(rows.json()["slots"]) == sorted(slots)


def test_put_does_not_accumulate_on_resave(client, student, db_session):
    client.put("/api/availability/me", json={"slots": ["화-09:00"]})
    client.put("/api/availability/me", json={"slots": ["목-14:00"]})

    res = client.get("/api/availability/me")
    assert res.json()["slots"] == ["목-14:00"]
    assert db_session.query(models.AvailableTime).count() == 1


def test_put_overwrites_application_imported_rows(client, student, db_session):
    # 지원서 연동으로 이미 들어와 있던 가능 시간
    db_session.add(
        models.AvailableTime(
            student_id="20221234",
            day_of_week=1,
            start_time=time(9, 0),
            end_time=time(10, 0),
            preference=2,
            source="application",
        )
    )
    db_session.commit()

    res = client.put("/api/availability/me", json={"slots": ["금-13:00"]})
    assert res.json()["slots"] == ["금-13:00"]
    assert db_session.query(models.AvailableTime).count() == 1
    assert db_session.query(models.AvailableTime).first().source == "manual"


def test_staff_cannot_access(db_session):
    def _override_get_db():
        yield db_session

    def _override_current_user():
        return auth.CurrentUser(id="STF001", role="staff")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = _override_current_user
    try:
        c = TestClient(app)
        assert c.get("/api/availability/me").status_code == 403
        assert c.put("/api/availability/me", json={"slots": []}).status_code == 403
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 학기별 가능 시간 (#89 후속) — 봄학기에 낸 시간이 가을학기에 그대로 쓰이면 안 된다
# ---------------------------------------------------------------------------


class TestTerms:
    def test_saving_one_term_leaves_others_alone(self, client, student):
        client.put("/api/availability/me", json={"term": "2026-1", "slots": ["월-09:00"]})
        client.put("/api/availability/me", json={"term": "2026-2", "slots": ["화-13:00"]})

        assert client.get("/api/availability/me?term=2026-1").json()["slots"] == ["월-09:00"]
        assert client.get("/api/availability/me?term=2026-2").json()["slots"] == ["화-13:00"]

    def test_resaving_a_term_replaces_only_that_term(self, client, student, db_session):
        client.put("/api/availability/me", json={"term": "2026-1", "slots": ["월-09:00"]})
        client.put("/api/availability/me", json={"term": "2026-2", "slots": ["화-13:00"]})
        client.put("/api/availability/me", json={"term": "2026-2", "slots": ["수-10:00"]})

        assert client.get("/api/availability/me?term=2026-1").json()["slots"] == ["월-09:00"]
        assert client.get("/api/availability/me?term=2026-2").json()["slots"] == ["수-10:00"]
        assert db_session.query(models.AvailableTime).count() == 2

    def test_legacy_rows_without_term_apply_everywhere(self, client, student, db_session):
        """학기 도입 전 데이터는 어느 학기를 보든 함께 보인다 — 기존 수합이 사라지면 안 된다."""
        db_session.add(
            models.AvailableTime(
                student_id="20221234",
                day_of_week=1,
                start_time=time(9, 0),
                end_time=time(10, 0),
                preference=2,
            )
        )
        db_session.commit()

        # 09:00~10:00은 30분 슬롯 두 개로 펼쳐진다
        assert client.get("/api/availability/me?term=2026-1").json()["slots"] == ["월-09:00", "월-09:30"]
        assert client.get("/api/availability/me?term=2026-2").json()["slots"] == ["월-09:00", "월-09:30"]

    def test_saving_a_term_cleans_up_legacy_rows(self, client, student, db_session):
        db_session.add(
            models.AvailableTime(
                student_id="20221234",
                day_of_week=1,
                start_time=time(9, 0),
                end_time=time(10, 0),
                preference=2,
            )
        )
        db_session.commit()

        client.put("/api/availability/me", json={"term": "2026-2", "slots": ["수-10:00"]})

        # 레거시 행이 정리돼 다른 학기에는 더 이상 나타나지 않는다
        assert client.get("/api/availability/me?term=2026-1").json()["slots"] == []
        assert client.get("/api/availability/me?term=2026-2").json()["slots"] == ["수-10:00"]
        assert db_session.query(models.AvailableTime).count() == 1
