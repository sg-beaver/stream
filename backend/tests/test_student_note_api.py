"""GET/PUT /api/availability/me/note · GET /api/availability/department/{id}/notes (#185).

학생 가능 시간 격자는 "언제 되고 언제 안 되는지"밖에 못 담는다. "월요일은 3교시가
늦게 끝나 15분쯤 늦어요" 같은 사정은 갈 곳이 없어, 학생이 그 시간을 통째로 빼거나
아무 말 없이 넘어가는 수밖에 없었다. 여기서 고정하는 것은 **누가 쓰고 누가 읽는가**다.
"""

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPARTMENT_ID = 1


@pytest.fixture
def student(db_session):
    db_session.add(models.Department(department_id=DEPARTMENT_ID, name="정보서비스팀"))
    db_session.add(
        models.JobPosting(posting_id=1, department_id=DEPARTMENT_ID, title="공고")
    )
    db_session.add(models.Student(student_id="20221234", name="김서강", password_hash="x"))
    db_session.add(
        models.Application(student_id="20221234", posting_id=1, status="합격")
    )
    db_session.commit()


def _client(db_session, user):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[auth.get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def client(db_session, student):
    try:
        yield _client(db_session, auth.CurrentUser(id="20221234", role="student"))
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def staff_client(db_session, student):
    db_session.add(
        models.Staff(
            staff_id="STF001",
            name="박정보",
            password_hash="x",
            department_id=DEPARTMENT_ID,
        )
    )
    db_session.commit()
    try:
        yield _client(db_session, auth.CurrentUser(id="STF001", role="staff"))
    finally:
        app.dependency_overrides.clear()


class TestMyNote:
    def test_empty_note_reads_as_null(self, client):
        body = client.get("/api/availability/me/note").json()
        assert body["content"] is None
        assert body["term"]

    def test_put_then_get(self, client):
        res = client.put(
            "/api/availability/me/note",
            json={"content": "  월요일은 3교시가 늦게 끝나 15분쯤 늦습니다  "},
        )
        assert res.status_code == 200
        # 앞뒤 공백은 다듬어 저장한다
        assert res.json()["content"] == "월요일은 3교시가 늦게 끝나 15분쯤 늦습니다"
        assert client.get("/api/availability/me/note").json()["content"] == (
            "월요일은 3교시가 늦게 끝나 15분쯤 늦습니다"
        )

    def test_resave_replaces_and_does_not_accumulate(self, client, db_session):
        client.put("/api/availability/me/note", json={"content": "첫 번째"})
        client.put("/api/availability/me/note", json={"content": "두 번째"})

        assert client.get("/api/availability/me/note").json()["content"] == "두 번째"
        assert db_session.query(models.StudentNote).count() == 1

    def test_blank_deletes(self, client, db_session):
        client.put("/api/availability/me/note", json={"content": "지워질 문장"})
        res = client.put("/api/availability/me/note", json={"content": "   "})

        assert res.json()["content"] is None
        assert db_session.query(models.StudentNote).count() == 0

    def test_too_long_is_rejected(self, client):
        res = client.put("/api/availability/me/note", json={"content": "가" * 1001})
        assert res.status_code == 422

    def test_terms_are_independent(self, client):
        """학기마다 사정이 다르다 — 봄학기 문장이 가을학기에 그대로 남으면 안 된다."""
        client.put(
            "/api/availability/me/note", json={"term": "2026-1", "content": "봄 사정"}
        )
        client.put(
            "/api/availability/me/note", json={"term": "2026-2", "content": "가을 사정"}
        )

        assert client.get("/api/availability/me/note?term=2026-1").json()["content"] == "봄 사정"
        assert client.get("/api/availability/me/note?term=2026-2").json()["content"] == "가을 사정"


class TestStaffAccess:
    def test_staff_cannot_write_student_note(self, staff_client):
        """특이사항은 학생 본인이 쓴 문장이다 — 담당자가 대신 쓰면 출처가 흐려진다."""
        assert staff_client.get("/api/availability/me/note").status_code == 403
        assert (
            staff_client.put(
                "/api/availability/me/note", json={"content": "직원이 씀"}
            ).status_code
            == 403
        )

    def test_department_notes_list(self, staff_client, db_session):
        db_session.add(
            models.StudentNote(
                student_id="20221234", term="2026-2", content="저녁은 통학 때문에 어렵습니다"
            )
        )
        db_session.commit()

        rows = staff_client.get(
            f"/api/availability/department/{DEPARTMENT_ID}/notes?term=2026-2"
        ).json()
        assert rows == [
            {
                "student_id": "20221234",
                "student_name": "김서강",
                "term": "2026-2",
                "content": "저녁은 통학 때문에 어렵습니다",
                "updated_at": rows[0]["updated_at"],
            }
        ]

    def test_other_department_is_blocked(self, staff_client, db_session):
        db_session.add(models.Department(department_id=2, name="다른 부서"))
        db_session.commit()

        assert staff_client.get("/api/availability/department/2/notes").status_code == 403

    def test_student_cannot_read_department_notes(self, client):
        """남이 쓴 사정은 담당자·학생팀장만 본다."""
        res = client.get(f"/api/availability/department/{DEPARTMENT_ID}/notes")
        assert res.status_code == 403
