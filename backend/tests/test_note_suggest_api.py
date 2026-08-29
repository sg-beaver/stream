"""POST /api/availability/me/note/suggest — 자연어 특이사항 → 슬롯 선호도 제안 (#185).

제안까지가 전부다. 저장은 학생이 확인한 뒤 `PUT /api/availability/me`로 직접 한다 —
잘못 읽은 문장이 배정에 바로 들어가면 학생도 담당자도 원인을 추적할 수 없다.
여기서 고정하는 것은 **AI가 무엇을 돌려주든 서버가 무엇만 통과시키는가**다.
"""

from datetime import time

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app
from app.scheduler import note_suggest as note_suggest_module
from app.scheduler.note_suggest import (
    NoteSuggestResult,
    SlotPreferenceSuggestion,
    UnstructuredSentence,
)
from app.scheduler.review import ReviewUnavailable

DEPARTMENT_ID = 1
STUDENT_ID = "20221234"


@pytest.fixture
def client(db_session):
    db_session.add(models.Department(department_id=DEPARTMENT_ID, name="정보서비스팀"))
    db_session.add(
        models.JobPosting(posting_id=1, department_id=DEPARTMENT_ID, title="공고")
    )
    db_session.add(models.Student(student_id=STUDENT_ID, name="김서강", password_hash="x"))
    db_session.add(
        models.Application(student_id=STUDENT_ID, posting_id=1, status="합격")
    )
    db_session.commit()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
        id=STUDENT_ID, role="student"
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def availability(db_session):
    """금요일 17:00~22:00 가능 — 30분 슬롯 10개."""
    db_session.add(
        models.AvailableTime(
            student_id=STUDENT_ID,
            day_of_week=5,
            start_time=time(17, 0),
            end_time=time(22, 0),
            preference=2,
        )
    )
    db_session.commit()


def _note(db_session, content):
    db_session.add(models.StudentNote(student_id=STUDENT_ID, content=content))
    db_session.commit()


def _fake_ai(monkeypatch, result, captured=None):
    def _call(contents):
        if captured is not None:
            captured["prompt"] = contents
        return result

    monkeypatch.setattr(note_suggest_module, "_call_gemini_suggest", _call)


class TestSuggest:
    def test_suggestion_is_returned_but_not_saved(
        self, client, db_session, availability, monkeypatch
    ):
        _note(db_session, "금요일 저녁은 통학 막차 때문에 되도록 피하고 싶습니다.")
        _fake_ai(
            monkeypatch,
            NoteSuggestResult(
                suggestions=[
                    SlotPreferenceSuggestion(
                        slots=["금-19:00", "금-19:30"],
                        preference="avoid",
                        quote="금요일 저녁은 통학 막차 때문에 되도록 피하고 싶습니다.",
                        reason="막차 때문에 금요일 저녁을 피하고 싶다고 적었습니다.",
                    )
                ]
            ),
        )

        body = client.post("/api/availability/me/note/suggest", json={}).json()

        assert body["suggest_available"] is True
        assert body["suggestions"][0]["slots"] == ["금-19:00", "금-19:30"]
        assert body["suggestions"][0]["preference"] == 1
        # 제안만 한다 — DB의 선호도는 그대로 2다
        assert [r.preference for r in db_session.query(models.AvailableTime).all()] == [2]

    def test_slots_outside_availability_are_dropped(
        self, client, db_session, availability, monkeypatch
    ):
        """학생이 내지 않은 시간은 제안될 수 없다 — 그대로 두면 저장에서 422로 튕긴다."""
        _note(db_session, "저녁은 피하고 싶어요")
        _fake_ai(
            monkeypatch,
            NoteSuggestResult(
                suggestions=[
                    SlotPreferenceSuggestion(
                        slots=["금-19:00", "월-09:00", "금-23:00"],
                        preference="avoid",
                        quote="저녁은 피하고 싶어요",
                        reason="저녁 회피",
                    )
                ]
            ),
        )

        body = client.post("/api/availability/me/note/suggest", json={}).json()
        assert body["suggestions"][0]["slots"] == ["금-19:00"]

    def test_suggestion_with_no_valid_slot_is_removed(
        self, client, db_session, availability, monkeypatch
    ):
        _note(db_session, "아침이 좋아요")
        _fake_ai(
            monkeypatch,
            NoteSuggestResult(
                suggestions=[
                    SlotPreferenceSuggestion(
                        slots=["월-08:00"], preference="prefer", quote="아침이 좋아요", reason="아침 선호"
                    )
                ]
            ),
        )

        body = client.post("/api/availability/me/note/suggest", json={}).json()
        assert body["suggestions"] == []

    def test_conflicting_suggestions_keep_the_first(
        self, client, db_session, availability, monkeypatch
    ):
        """같은 슬롯에 1과 3이 동시에 오면 화면이 무엇을 보여줄지 정할 수 없다."""
        _note(db_session, "금요일 저녁은 피하고 싶지만 가끔은 괜찮아요")
        _fake_ai(
            monkeypatch,
            NoteSuggestResult(
                suggestions=[
                    SlotPreferenceSuggestion(
                        slots=["금-19:00"], preference="avoid", quote="피하고 싶지만", reason="회피"
                    ),
                    SlotPreferenceSuggestion(
                        slots=["금-19:00", "금-20:00"],
                        preference="prefer",
                        quote="가끔은 괜찮아요",
                        reason="희망",
                    ),
                ]
            ),
        )

        body = client.post("/api/availability/me/note/suggest", json={}).json()
        assert [(s["slots"], s["preference"]) for s in body["suggestions"]] == [
            (["금-19:00"], 1),
            (["금-20:00"], 3),
        ]

    def test_unstructured_sentences_pass_through(
        self, client, db_session, availability, monkeypatch
    ):
        _note(db_session, "성실히 하겠습니다")
        _fake_ai(
            monkeypatch,
            NoteSuggestResult(
                unstructured=[
                    UnstructuredSentence(quote="성실히 하겠습니다", reason="시간과 무관합니다.")
                ]
            ),
        )

        body = client.post("/api/availability/me/note/suggest", json={}).json()
        assert body["suggestions"] == []
        assert body["unstructured"][0]["quote"] == "성실히 하겠습니다"

    def test_draft_content_in_body_is_used(
        self, client, db_session, availability, monkeypatch
    ):
        """저장 전 초안도 미리 볼 수 있어야 한다 — 저장해야만 제안이 되면 순서가 꼬인다."""
        captured = {}
        _fake_ai(monkeypatch, NoteSuggestResult(), captured)

        client.post(
            "/api/availability/me/note/suggest", json={"content": "저장 안 한 문장"}
        )
        assert "저장 안 한 문장" in captured["prompt"]
        assert db_session.query(models.StudentNote).count() == 0

    def test_available_slots_are_given_to_the_model(
        self, client, db_session, availability, monkeypatch
    ):
        captured = {}
        _fake_ai(monkeypatch, NoteSuggestResult(), captured)
        _note(db_session, "저녁은 피하고 싶어요")

        client.post("/api/availability/me/note/suggest", json={})
        prompt = captured["prompt"]
        assert "금-17:00" in prompt and "금-21:30" in prompt
        assert "금-22:00" not in prompt  # 종료 시각은 슬롯이 아니다
        assert "- 금: 17:00~22:00" in prompt


class TestQuietFailure:
    def test_no_note(self, client, availability):
        body = client.post("/api/availability/me/note/suggest", json={}).json()
        assert body == {
            "suggest_available": False,
            "term": body["term"],
            "reason": "no_note",
            "suggestions": [],
            "unstructured": [],
        }

    def test_no_availability(self, client, db_session):
        """선호도는 가능 시간 위에만 붙는다 — 붙일 슬롯이 없으면 제안할 것도 없다."""
        _note(db_session, "저녁은 피하고 싶어요")
        body = client.post("/api/availability/me/note/suggest", json={}).json()
        assert body["suggest_available"] is False
        assert body["reason"] == "no_availability"

    def test_ai_error_does_not_break_the_screen(
        self, client, db_session, availability, monkeypatch
    ):
        _note(db_session, "저녁은 피하고 싶어요")

        def _boom(contents):
            raise ReviewUnavailable("ai_error")

        monkeypatch.setattr(note_suggest_module, "_call_gemini_suggest", _boom)

        res = client.post("/api/availability/me/note/suggest", json={})
        assert res.status_code == 200
        assert res.json()["reason"] == "ai_error"


def test_staff_cannot_use_it(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
        id="STF001", role="staff"
    )
    try:
        c = TestClient(app)
        assert c.post("/api/availability/me/note/suggest", json={}).status_code == 403
    finally:
        app.dependency_overrides.clear()
