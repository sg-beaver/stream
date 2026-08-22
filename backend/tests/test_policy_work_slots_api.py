"""부서 정책 API의 근무 슬롯(work_slots) 확장 테스트 (#89).

GET /api/schedule/policy/{id}: work_slots·work_slots_source 병합 응답
PATCH /api/schedule/policy/{id}:
- 저장된 기간은 통째 교체, 목록에 없는 요일은 자유 그리드(미정의)
- 형식 오류는 422(pydantic), 개관 시간과의 타일링 위반은 400
"""

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import get_db
from app.main import app

DEPT_ID = 1

# 정보서비스팀 학기 평일 개관(08-22)을 정확히 타일링하는 이슈 #89 예시 블록 11개
WEEKDAY_BLOCKS = [
    ["08:00", "09:00"],
    ["09:00", "10:30"],
    ["10:30", "12:00"],
    ["12:00", "13:30"],
    ["13:30", "15:00"],
    ["15:00", "16:30"],
    ["16:30", "18:00"],
    ["18:00", "19:00"],
    ["19:00", "20:00"],
    ["20:00", "21:00"],
    ["21:00", "22:00"],
]


def day_entry(day_of_week: int, blocks: list[list[str]]) -> dict:
    return {
        "day_of_week": day_of_week,
        "ranges": [{"start_time": s, "end_time": e} for s, e in blocks],
    }


@pytest.fixture
def staff_client(db_session):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(
        models.Staff(
            staff_id="STF001", name="박정보", department_id=DEPT_ID, password_hash="x"
        )
    )
    db_session.add(
        models.DepartmentPolicy(
            department_id=DEPT_ID, availability_mode="weekly_only"
        )
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


def patch_policy(client, payload):
    return client.patch(f"/api/schedule/policy/{DEPT_ID}", json=payload)


class TestGet:
    def test_default_has_work_slots_from_policy_file(self, staff_client):
        res = staff_client.get(f"/api/schedule/policy/{DEPT_ID}")
        assert res.status_code == 200
        body = res.json()
        assert body["work_slots_source"] == "policy_file"
        assert set(body["work_slots"]) == {"semester", "vacation"}

    def test_stored_work_slots_take_precedence(self, staff_client):
        res = patch_policy(
            staff_client, {"work_slots": {"semester": [day_entry(1, WEEKDAY_BLOCKS)]}}
        )
        assert res.status_code == 200, res.json()

        body = staff_client.get(f"/api/schedule/policy/{DEPT_ID}").json()
        assert body["work_slots_source"] == "department"
        semester = body["work_slots"]["semester"]
        assert [d["day_of_week"] for d in semester] == [1]
        assert semester[0]["ranges"][1] == {
            "start_time": "09:00",
            "end_time": "10:30",
        }


class TestPatchValid:
    def test_saves_tiling_work_slots(self, staff_client):
        res = patch_policy(
            staff_client,
            {
                "work_slots": {
                    "semester": [day_entry(d, WEEKDAY_BLOCKS) for d in (1, 2, 3, 4, 5)]
                }
            },
        )
        assert res.status_code == 200, res.json()
        assert res.json()["work_slots_source"] == "department"

    def test_period_replaced_wholesale(self, staff_client):
        patch_policy(
            staff_client,
            {"work_slots": {"semester": [day_entry(d, WEEKDAY_BLOCKS) for d in (1, 2)]}},
        )
        # 월요일만 남기고 다시 저장 → 화요일 블록은 사라져야 한다 (기간 통째 교체)
        patch_policy(
            staff_client, {"work_slots": {"semester": [day_entry(1, WEEKDAY_BLOCKS)]}}
        )
        body = staff_client.get(f"/api/schedule/policy/{DEPT_ID}").json()
        assert [d["day_of_week"] for d in body["work_slots"]["semester"]] == [1]

    def test_empty_period_clears_blocks(self, staff_client):
        """기간을 빈 목록으로 보내면 그 기간 전체가 자유 그리드로 돌아간다."""
        patch_policy(
            staff_client, {"work_slots": {"semester": [day_entry(1, WEEKDAY_BLOCKS)]}}
        )
        res = patch_policy(staff_client, {"work_slots": {"semester": []}})
        assert res.status_code == 200, res.json()
        body = staff_client.get(f"/api/schedule/policy/{DEPT_ID}").json()
        assert body["work_slots"]["semester"] == []

    def test_opening_and_work_slots_together(self, staff_client):
        """개관 시간과 근무 슬롯을 한 번에 바꾸면 함께 검증되어 통과한다."""
        res = patch_policy(
            staff_client,
            {
                "opening_hours": {
                    "semester": [
                        {
                            "day_of_week": 1,
                            "ranges": [{"start_time": "09:00", "end_time": "12:00"}],
                        }
                    ]
                },
                "work_slots": {
                    "semester": [
                        day_entry(1, [["09:00", "10:30"], ["10:30", "12:00"]])
                    ]
                },
            },
        )
        assert res.status_code == 200, res.json()


class TestPatch422:
    def test_non_half_hour_boundary(self, staff_client):
        res = patch_policy(
            staff_client,
            {"work_slots": {"semester": [day_entry(1, [["09:15", "10:00"]])]}},
        )
        assert res.status_code == 422

    def test_reversed_range(self, staff_client):
        res = patch_policy(
            staff_client,
            {"work_slots": {"semester": [day_entry(1, [["10:00", "09:00"]])]}},
        )
        assert res.status_code == 422

    def test_overlapping_ranges(self, staff_client):
        res = patch_policy(
            staff_client,
            {
                "work_slots": {
                    "semester": [day_entry(1, [["09:00", "11:00"], ["10:00", "12:00"]])]
                }
            },
        )
        assert res.status_code == 422

    def test_duplicate_day(self, staff_client):
        res = patch_policy(
            staff_client,
            {
                "work_slots": {
                    "semester": [
                        day_entry(1, WEEKDAY_BLOCKS),
                        day_entry(1, WEEKDAY_BLOCKS),
                    ]
                }
            },
        )
        assert res.status_code == 422

    def test_empty_ranges_day(self, staff_client):
        """빈 ranges 요일은 미정의(요일 빼기)와 모호해 금지한다."""
        res = patch_policy(staff_client, {"work_slots": {"semester": [day_entry(1, [])]}})
        assert res.status_code == 422

    def test_empty_payload(self, staff_client):
        res = patch_policy(staff_client, {})
        assert res.status_code == 422


class TestPatch400Tiling:
    def test_gap_rejected(self, staff_client):
        """개관(08-22)의 일부만 덮는 블록은 빈틈으로 400."""
        res = patch_policy(
            staff_client,
            {"work_slots": {"semester": [day_entry(1, [["08:00", "09:00"]])]}},
        )
        assert res.status_code == 400
        assert "개관 시간과 맞지 않습니다" in res.json()["error"]

    def test_beyond_opening_rejected(self, staff_client):
        blocks = WEEKDAY_BLOCKS + [["22:00", "23:00"]]
        res = patch_policy(
            staff_client, {"work_slots": {"semester": [day_entry(1, blocks)]}}
        )
        assert res.status_code == 400

    def test_closed_day_rejected(self, staff_client):
        """일요일(폐관)에 블록 정의는 400."""
        res = patch_policy(
            staff_client,
            {"work_slots": {"semester": [day_entry(7, [["09:00", "12:00"]])]}},
        )
        assert res.status_code == 400

    def test_opening_change_orphaning_work_slots_rejected(self, staff_client):
        """저장된 근무 슬롯과 어긋나는 개관 시간 변경은 400 — 함께 수정해야 한다."""
        assert (
            patch_policy(
                staff_client,
                {"work_slots": {"semester": [day_entry(1, WEEKDAY_BLOCKS)]}},
            ).status_code
            == 200
        )
        res = patch_policy(
            staff_client,
            {
                "opening_hours": {
                    "semester": [
                        {
                            "day_of_week": 1,
                            "ranges": [{"start_time": "09:00", "end_time": "17:00"}],
                        }
                    ]
                }
            },
        )
        assert res.status_code == 400
        assert "함께 수정" in res.json()["error"]
        # 거부된 변경이 저장되지 않았어야 한다
        body = staff_client.get(f"/api/schedule/policy/{DEPT_ID}").json()
        assert body["opening_hours_source"] == "policy_file"
