"""GET /api/substitute-requests/{id}/ai-check API 레벨 테스트 (LLM 호출 없음).

404/409/403 및 approve와의 독립성(is_stale)만 다룬다 — 서비스 로직 자체의
캐싱/verdict 강제는 tests/scheduler/test_substitute_check.py에서 다룬다.
"""

from app import models
from app.scheduler import substitute_check
from app.scheduler.substitute_check import SubstituteCheckResult
from tests.test_substitute_requests import _client_as, _create_request, scenario  # noqa: F401

FAKE_OK_RESULT = SubstituteCheckResult(
    summary="규칙을 준수합니다.", overall_verdict="적합", findings=[], clarification_requests=[]
)


def _add_custom_rules(db_session, department_id, custom_rules="금요일엔 경험자가 필요하다"):
    db_session.add(
        models.DepartmentPolicy(
            department_id=department_id, availability_mode="weekly_only", custom_rules=custom_rules
        )
    )
    db_session.commit()


class TestAiCheckPreconditions:
    def test_nonexistent_request_is_404(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = client.get("/api/substitute-requests/9999/ai-check")
        assert res.status_code == 404

    def test_not_yet_accepted_is_409(self, db_session, scenario):
        request_id = _create_request(db_session, scenario)
        client = _client_as(db_session, "STF001", "staff")
        res = client.get(f"/api/substitute-requests/{request_id}/ai-check")
        assert res.status_code == 409

    def test_other_department_staff_is_403(self, db_session, scenario):
        request_id = _create_request(db_session, scenario)
        client = _client_as(db_session, "20222222", "student")
        client.patch(
            f"/api/substitute-requests/{request_id}/respond",
            json={"substitute_id": "20222222", "response": "수락"},
        )

        other_staff_client = _client_as(db_session, "STF002", "staff")
        res = other_staff_client.get(f"/api/substitute-requests/{request_id}/ai-check")
        assert res.status_code == 403

    def test_student_role_is_403(self, db_session, scenario):
        request_id = _create_request(db_session, scenario)
        client = _client_as(db_session, "20221111", "student")
        res = client.get(f"/api/substitute-requests/{request_id}/ai-check")
        assert res.status_code == 403


class TestAiCheckIndependentFromApprove(object):
    def test_success_and_is_stale_flag(self, db_session, scenario, monkeypatch):
        monkeypatch.setattr(
            substitute_check, "_call_gemini_check", lambda contents: FAKE_OK_RESULT
        )
        _add_custom_rules(db_session, scenario["department_id"])

        request_id = _create_request(db_session, scenario)
        student_client = _client_as(db_session, "20222222", "student")
        student_client.patch(
            f"/api/substitute-requests/{request_id}/respond",
            json={"substitute_id": "20222222", "response": "수락"},
        )

        staff_client = _client_as(db_session, "STF001", "staff")
        res = staff_client.get(f"/api/substitute-requests/{request_id}/ai-check")
        assert res.status_code == 200, res.json()
        body = res.json()
        assert body["overall_verdict"] == "적합"
        assert body["substitute_student_id"] == "20222222"
        assert body["cached"] is False
        assert body["is_stale"] is False

        # ai-check 호출과 무관하게 approve는 정상 동작해야 한다 (설계문서 결정 8번)
        approve_res = staff_client.patch(f"/api/substitute-requests/{request_id}/approve")
        assert approve_res.status_code == 200, approve_res.json()

        # 승인 이후에도 ai-check는 과거 기록 조회 목적으로 계속 호출 가능하며,
        # is_stale=True로 참고용임을 알린다. 캐시된 결과라 Gemini는 다시 안 부른다.
        after_approve = staff_client.get(f"/api/substitute-requests/{request_id}/ai-check")
        assert after_approve.status_code == 200, after_approve.json()
        assert after_approve.json()["is_stale"] is True
        assert after_approve.json()["cached"] is True
