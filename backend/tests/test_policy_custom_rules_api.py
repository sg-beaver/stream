"""부서 정책 API의 AI 검토 규칙(custom_rules) 테스트.

REQ-SCHED-016: custom_rules는 AI 검토의 기준이 되는 자연어 운영 규칙.
PATCH로 전체 교체하며, 빈 문자열(공백 포함)은 규칙 삭제(null)로 저장돼
검토가 no_rules로 건너뛰게 된다. GET 응답에 그대로 노출된다.
"""

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1
RULES = "금요일 마감 시간대에는 경험자가 최소 1명 있어야 한다.\n시험기간 전 주에는 신입을 혼자 배치하지 않는다."


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
        )
    )
    db_session.add(
        models.DepartmentPolicy(department_id=DEPT_ID, availability_mode="weekly_only")
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


class TestCustomRules:
    def test_default_is_null(self, staff_client):
        res = staff_client.get(f"/api/schedule/policy/{DEPT_ID}")
        assert res.status_code == 200
        assert res.json()["custom_rules"] is None

    def test_patch_and_get_roundtrip(self, staff_client, db_session):
        res = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}", json={"custom_rules": RULES}
        )
        assert res.status_code == 200, res.json()
        assert res.json()["custom_rules"] == RULES

        row = db_session.query(models.DepartmentPolicy).one()
        assert row.custom_rules == RULES

    def test_blank_clears_rules(self, staff_client, db_session):
        """공백만 보내면 규칙 삭제(null) — AI 검토가 no_rules로 건너뛴다."""
        staff_client.patch(f"/api/schedule/policy/{DEPT_ID}", json={"custom_rules": RULES})
        res = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}", json={"custom_rules": "  \n  "}
        )
        assert res.status_code == 200
        assert res.json()["custom_rules"] is None
        assert db_session.query(models.DepartmentPolicy).one().custom_rules is None

    def test_too_long_rejected(self, staff_client):
        res = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}", json={"custom_rules": "가" * 5001}
        )
        assert res.status_code == 422

    def test_rules_alone_is_a_valid_update(self, staff_client):
        """custom_rules만 보내도 '수정할 항목 없음' 422가 나지 않아야 한다."""
        res = staff_client.patch(
            f"/api/schedule/policy/{DEPT_ID}", json={"custom_rules": "규칙 하나"}
        )
        assert res.status_code == 200
