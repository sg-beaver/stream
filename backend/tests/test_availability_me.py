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


class TestSlotPreferences:
    """슬롯별 선호도 — 1=피하고 싶음 / 2=가능 / 3=희망 (#185).

    체크/해제 이진값만 받던 탓에 학생은 "가능하긴 한데 피하고 싶다"를 표현할 수
    없었다. 그 시간을 아예 빼면 가용 시간이 줄고, 가능으로 두면 회피 의사가 사라진다.
    """

    def test_preferences_are_stored_per_slot(self, client, student, db_session):
        res = client.put(
            "/api/availability/me",
            json={
                "slots": ["화-09:00", "화-09:30", "목-14:00"],
                "slot_preferences": {"화-09:30": 1, "목-14:00": 3},
            },
        )
        assert res.status_code == 200

        rows = db_session.query(models.AvailableTime).all()
        stored = {(r.day_of_week, r.start_time, r.end_time, r.preference) for r in rows}
        assert stored == {
            (2, time(9, 0), time(9, 30), 2),  # 지정 안 함 → 기본 2(가능)
            (2, time(9, 30), time(10, 0), 1),  # 피하고 싶음
            (4, time(14, 0), time(14, 30), 3),  # 희망
        }

    def test_adjacent_slots_with_different_preference_are_not_merged(
        self, client, student, db_session
    ):
        """맞닿아도 강도가 다르면 한 구간으로 뭉개지 않는다 — 뭉치면 강도가 사라진다."""
        client.put(
            "/api/availability/me",
            json={
                "slots": ["화-09:00", "화-09:30", "화-10:00"],
                "slot_preferences": {"화-10:00": 1},
            },
        )
        rows = sorted(
            db_session.query(models.AvailableTime).all(), key=lambda r: r.start_time
        )
        assert [(r.start_time, r.end_time, r.preference) for r in rows] == [
            (time(9, 0), time(10, 0), 2),
            (time(10, 0), time(10, 30), 1),
        ]

    def test_get_restores_preferences(self, client, student):
        client.put(
            "/api/availability/me",
            json={
                "slots": ["화-09:00", "화-09:30"],
                "slot_preferences": {"화-09:30": 1},
            },
        )
        body = client.get("/api/availability/me").json()
        assert sorted(body["slots"]) == ["화-09:00", "화-09:30"]
        # 기본값(2)인 슬롯은 담지 않는다 — 화면이 복원할 것은 지정된 강도뿐이다
        assert body["slot_preferences"] == {"화-09:30": 1}

    def test_preferences_default_to_available(self, client, student, db_session):
        """선호도를 안 보내면 기존 동작 그대로 — 전부 2(가능)."""
        client.put("/api/availability/me", json={"slots": ["화-09:00", "화-09:30"]})
        rows = db_session.query(models.AvailableTime).all()
        assert [r.preference for r in rows] == [2]
        assert client.get("/api/availability/me").json()["slot_preferences"] == {}

    def test_preference_for_unchecked_slot_is_rejected(self, client, student):
        """체크하지 않은 시간에 강도만 지정하면 어느 쪽이 맞는지 알 수 없다."""
        res = client.put(
            "/api/availability/me",
            json={"slots": ["화-09:00"], "slot_preferences": {"목-14:00": 1}},
        )
        assert res.status_code == 422

    def test_unknown_preference_value_is_rejected(self, client, student):
        res = client.put(
            "/api/availability/me",
            json={"slots": ["화-09:00"], "slot_preferences": {"화-09:00": 5}},
        )
        assert res.status_code == 422
