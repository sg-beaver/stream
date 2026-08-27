"""POST /api/schedule/review/clarifications 단위 테스트 (LLM 호출 없음).

되묻기 답변 로그 API의 요청 검증(400/422)과 저장 결과만 확인한다 — AI가
실제로 어떤 clarification_requests를 만드는지는 이 테스트의 범위가 아니다
(그건 eval_review.py/test_review_live.py가 실제 Gemini로 확인한다).
"""

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
        )
    )
    db_session.add(
        models.Student(student_id="20221234", name="학생A", password_hash="x")
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


def post_clarification(client, payload):
    return client.post("/api/schedule/review/clarifications", json=payload)


class TestCreateClarificationAnswer:
    def test_student_target_succeeds_and_persists(self, staff_client, db_session):
        res = post_clarification(
            staff_client,
            {
                "target_type": "student",
                "target_id": "20221234",
                "field_name": "tenure_start_date",
                "question": "근속 시작일을 알 수 있을까요?",
                "answer": "2023-03-02",
            },
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["target_type"] == "student"
        assert body["target_id"] == "20221234"
        assert body["field_name"] == "tenure_start_date"

        row = db_session.query(models.ClarificationAnswer).one()
        assert row.answer == "2023-03-02"
        assert row.answered_by == "STF001"
        assert row.applied_at is None  # 실제 컬럼 반영은 사람 몫 — 자동 채움 없음

    def test_department_target_succeeds(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "department",
                "target_id": str(DEPT_ID),
                "field_name": "biweekly_max_hours",
                "question": "부서 2주 상한이 몇 시간인가요?",
                "answer": "190",
            },
        )
        assert res.status_code == 201, res.json()

    def test_rule_interpretation_target_succeeds_without_target_id(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "rule_interpretation",
                "question": "'인접한 근무'가 서로 다른 학생 간 교대도 포함하나요?",
                "answer": "포함하지 않습니다. 같은 학생의 연속 근무만 해당합니다.",
            },
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["target_id"] is None
        assert body["field_name"] is None

    def test_student_target_without_target_id_is_400(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "student",
                "field_name": "tenure_start_date",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 400, res.json()

    def test_student_target_without_field_name_is_400(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "student",
                "target_id": "20221234",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 400, res.json()

    def test_department_target_without_target_id_is_400(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "department",
                "field_name": "biweekly_max_hours",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 400, res.json()

    def test_rule_interpretation_with_target_id_is_400(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "rule_interpretation",
                "target_id": "20221234",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 400, res.json()

    def test_rule_interpretation_with_field_name_is_400(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "rule_interpretation",
                "field_name": "tenure_start_date",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 400, res.json()

    def test_nonexistent_student_target_id_is_404(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "student",
                "target_id": "99999999",
                "field_name": "tenure_start_date",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 404, res.json()

    def test_nonexistent_department_target_id_is_404(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "department",
                "target_id": "999",
                "field_name": "biweekly_max_hours",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 404, res.json()

    def test_non_numeric_department_target_id_is_404(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "department",
                "target_id": "not-a-number",
                "field_name": "biweekly_max_hours",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 404, res.json()

    def test_invalid_target_type_is_422(self, staff_client):
        res = post_clarification(
            staff_client,
            {
                "target_type": "gender",  # 정책적 판단 사안은 애초에 유효한 target_type이 아니다
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 422, res.json()

    def test_student_role_is_forbidden(self, staff_client):
        app.dependency_overrides[auth.get_current_user] = lambda: auth.CurrentUser(
            id="20220001", role="student"
        )
        res = post_clarification(
            staff_client,
            {
                "target_type": "rule_interpretation",
                "question": "q",
                "answer": "a",
            },
        )
        assert res.status_code == 403, res.json()
