"""챗봇 근무 불가 조건 툴 테스트 (#254, LLM·solver 호출 없음).

generate_schedule과 _replace_draft_batch를 monkeypatch해 solve 없이
조건 파싱·재solve 인자·확인 게이트·되돌리기·중복/범위 거부를 검증한다.
조건이 실제로 슬롯을 막는지는 도메인 쪽(tests/scheduler/test_session_constraints.py)에서 본다.
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

MONDAY = datetime.date(2026, 9, 7)
NEXT_MONDAY = MONDAY + datetime.timedelta(days=7)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀")
    db_session.add(dept)
    db_session.flush()
    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자",
                     department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="김현서",
                       password_hash="x", funding_type="gyobi"),
        models.Student(student_id="20222222", name="조수현",
                       password_hash="x", funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add_all([
        models.Application(student_id="20221111", posting_id=posting.posting_id, status="합격"),
        models.Application(student_id="20222222", posting_id=posting.posting_id, status="합격"),
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END,
        solver_summary={
            "penalty_summary": {"meal_break": 60},
            "penalty_events": [{"name": "meal_break", "amount": 3}],
        },
    )
    db_session.add(draft)
    db_session.flush()
    # 김현서 학생의 월요일 근무 2건 — 조건이 겨냥하는 대상
    db_session.add_all([
        models.WorkSchedule(
            batch_id=draft.batch_id, student_id="20221111",
            department_id=dept.department_id, work_date=day,
            start_time=_t("09:00"), end_time=_t("12:00"),
        )
        for day in (MONDAY, NEXT_MONDAY)
    ])
    db_session.commit()
    return {"dept": dept, "draft": draft}


@pytest.fixture
def fake_resolve(monkeypatch):
    """generate_schedule·_replace_draft_batch를 solve 없이 흉내 낸다.

    재생성 결과에는 배정을 담지 않는다 — 새 배치가 비므로 "조건 구간에 남은
    배정 0건"이 자연스럽게 성립한다.
    """
    calls = {"requests": [], "replaced": 0, "infeasible": False}

    def _fake_generate(req, db):
        calls["requests"].append(req)
        if calls["infeasible"]:
            from app.scheduler.service import ScheduleInfeasible

            raise ScheduleInfeasible("제약조건을 만족하는 근무표를 생성할 수 없습니다.")
        return {
            "status": "OPTIMAL",
            "solve_time_seconds": 7.0,
            "objective_value": 2100,
            "best_objective_bound": 2080,
            "schedules": [],
            "shortages": [],
            "penalty_summary": {"meal_break": 90},
            "penalty_events": [{"name": "meal_break", "amount": 5}],
            "per_student": [],
        }

    def _fake_replace(db, *, department_id, period_start, period_end,
                      created_by, schedules, solver_summary):
        calls["replaced"] += 1
        old = (
            db.query(models.ScheduleBatch)
            .filter_by(department_id=department_id, status="draft",
                       period_start=period_start, period_end=period_end)
            .first()
        )
        if old is not None:
            db.query(models.WorkSchedule).filter_by(batch_id=old.batch_id).delete()
            db.delete(old)
            db.flush()
        new_batch = models.ScheduleBatch(
            department_id=department_id, status="draft",
            period_start=period_start, period_end=period_end,
            solver_summary=solver_summary,
        )
        db.add(new_batch)
        db.flush()
        return new_batch.batch_id, len(schedules)

    import app.routers.schedule as schedule_router
    import app.scheduler.service as service_mod

    monkeypatch.setattr(service_mod, "generate_schedule", _fake_generate)
    monkeypatch.setattr(schedule_router, "_replace_draft_batch", _fake_replace)
    return calls


def _create_session(db_session, scenario):
    client = _client_as(db_session, "STF001", "staff")
    res = client.post("/api/schedule/chat/sessions", json={
        "department_id": scenario["dept"].department_id,
        "period_start": MONDAY.isoformat(),
        "period_end": PERIOD_END.isoformat(),
    })
    assert res.status_code == 201, res.json()
    return client, res.json()["session_id"]


def _mock_steps(monkeypatch, steps):
    queue = list(steps)
    monkeypatch.setattr(chat, "_llm_step", lambda contents: queue.pop(0))


def _send(client, session_id, content):
    return client.post(
        f"/api/schedule/chat/sessions/{session_id}/messages",
        json={"content": content},
    )


class TestAddConstraint:
    def test_weekday_request_resolves_with_constraint(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """'월요일에 근무하지 않도록' → 조건을 얹고 다시 푼다 (지우기가 아니다)."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="월요일을 빼고 다시 짰습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "김현서 학생은 월요일에 근무하지 않도록 해줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "applied"

        result = body["tool_calls"][0]["result"]
        assert result["ok"] is True
        assert result["constraint"] == "김현서 학생 월요일 종일 근무 불가"
        # 조건 구간에 있던 배정 2건이 재생성 후 0건 — 조건이 먹었다는 근거
        assert result["blocked_window_assignments"] == {"before": 2, "after": 0}
        assert result["violation_diff"] == {
            "before": {"meal_break": 3}, "after": {"meal_break": 5}
        }
        assert result["solver"]["status"] == "OPTIMAL"

        # 솔버에 조건이 실제로 전달됐다
        [req] = fake_resolve["requests"]
        [sent] = req.extra_student_constraints
        assert (sent.student_id, sent.weekday) == ("20221111", 1)
        assert sent.days_within(MONDAY, PERIOD_END) == [MONDAY, NEXT_MONDAY]

        # 세션에 남아 다음 재생성에도 따라간다
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert row.session_constraints == [{
            "student_id": "20221111", "student_name": "김현서", "weekday": 1,
            "dates": [], "start_time": "00:00", "end_time": "24:00",
        }]
        assert row.batch_id == db_session.query(models.ScheduleBatch).filter_by(
            status="draft"
        ).one().batch_id

    def test_time_range_constraint(self, db_session, scenario, fake_resolve, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("add_constraint", {
                "student_name": "김현서", "weekday": "월",
                "start_time": "09:00", "end_time": "12:00",
            })]),
            LlmStep(text="오전만 뺐습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "김현서 학생 월요일 오전은 빼줘")
        assert res.status_code == 201
        result = res.json()["tool_calls"][0]["result"]
        assert result["constraint"] == "김현서 학생 월요일 09:00~12:00 근무 불가"

    def test_weight_scales_ride_along(self, db_session, scenario, fake_resolve, monkeypatch):
        """배율을 먼저 조정한 뒤 조건을 걸어도 배율이 풀리지 않는다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("adjust_weight", {"category": "meal_break", "direction": "up"})
            ]),
            LlmStep(text="올렸습니다."),
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="조건을 걸었습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "식사 올려줘").status_code == 201
        assert _send(client, session_id, "김현서 학생 월요일 빼줘").status_code == 201
        second = fake_resolve["requests"][1]
        assert second.extra_weight_scales == {"meal_break": 1.5}
        assert len(second.extra_student_constraints) == 1

    def test_duplicate_is_rejected_without_solving(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="걸었습니다."),
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="이미 걸려 있습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "월요일 빼줘").status_code == 201
        res = _send(client, session_id, "월요일 빼줘")
        assert "이미 적용 중인 조건" in res.json()["tool_calls"][0]["result"]["error"]
        assert fake_resolve["replaced"] == 1  # 두 번째는 solve가 돌지 않았다

    def test_date_outside_period_is_rejected(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("add_constraint", {
                "student_name": "김현서", "dates": ["2026-01-05"],
            })]),
            LlmStep(text="그 날짜는 이 근무표 기간이 아닙니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "1월 5일 빼줘")
        assert "해당하는 날짜가 없습니다" in res.json()["tool_calls"][0]["result"]["error"]
        assert fake_resolve["replaced"] == 0

    def test_unknown_student_is_rejected(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "없는학생", "weekday": "월"})
            ]),
            LlmStep(text="그런 학생이 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "없는학생 월요일 빼줘")
        assert "학생이 없습니다" in res.json()["tool_calls"][0]["result"]["error"]
        assert fake_resolve["replaced"] == 0

    def test_infeasible_leaves_session_unchanged(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """조건까지 얹으면 해가 없는 경우 — 조건이 세션에 남으면 안 된다."""
        fake_resolve["infeasible"] = True
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="그 조건으로는 근무표를 만들 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "월요일 빼줘")
        assert "재생성에 실패" in res.json()["tool_calls"][0]["result"]["error"]
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert not row.session_constraints

    def test_manual_edit_requires_confirmation(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """수동 편집이 남아 있으면 solve를 돌리지 않고 확인부터 받는다."""
        row = db_session.query(models.WorkSchedule).filter_by(work_date=MONDAY).one()
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("remove_schedule", {"schedule_ids": [row.schedule_id]})
            ]),
            LlmStep(text="지웠습니다."),
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="수동 수정 1건이 사라집니다. 진행할까요?"),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "9월 7일 근무 빼줘").status_code == 201
        res = _send(client, session_id, "김현서 학생 월요일은 아예 빼줘")
        result = res.json()["tool_calls"][0]["result"]
        assert result["confirmation_required"] is True
        assert result["pending_manual_edits"] == 1
        assert fake_resolve["replaced"] == 0


class TestRemoveAndRevert:
    def _add(self, db_session, scenario, monkeypatch, extra_steps=()):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("add_constraint", {"student_name": "김현서", "weekday": "월"})
            ]),
            LlmStep(text="걸었습니다."),
            *extra_steps,
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "김현서 학생 월요일 빼줘")
        assert res.status_code == 201, res.json()
        return client, session_id, res.json()

    def test_remove_by_number(self, db_session, scenario, fake_resolve, monkeypatch):
        client, session_id, _ = self._add(db_session, scenario, monkeypatch, [
            LlmStep(function_calls=[("remove_constraint", {"constraint_number": 1})]),
            LlmStep(text="조건을 걷었습니다."),
        ])
        res = _send(client, session_id, "아까 그 조건 취소해줘")
        result = res.json()["tool_calls"][0]["result"]
        assert result["ok"] is True
        assert result["action"] == "removed"
        assert result["active_constraints"] == []
        assert fake_resolve["requests"][-1].extra_student_constraints == []
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert not row.session_constraints

    def test_bad_number_lists_current_constraints(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        client, session_id, _ = self._add(db_session, scenario, monkeypatch, [
            LlmStep(function_calls=[("remove_constraint", {"constraint_number": 7})]),
            LlmStep(text="그런 번호는 없습니다."),
        ])
        res = _send(client, session_id, "7번 조건 걷어줘")
        error = res.json()["tool_calls"][0]["result"]["error"]
        assert "1~1" in error and "김현서 학생 월요일 종일 근무 불가" in error
        assert fake_resolve["replaced"] == 1  # 추가 때 1회뿐

    def test_revert_drops_the_constraint(
        self, db_session, scenario, fake_resolve, monkeypatch
    ):
        """되돌리기 = 조건을 걷고 다시 푼다 (#135와 같은 경로)."""
        client, session_id, body = self._add(db_session, scenario, monkeypatch)
        assert body["tool_calls"][0]["inverses"] == [{
            "op": "remove_constraint",
            "constraint": {
                "student_id": "20221111", "student_name": "김현서", "weekday": 1,
                "dates": [], "start_time": "00:00", "end_time": "24:00",
            },
            "confirm_loss": True,
        }]
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}"
            f"/messages/{body['message_id']}/revert"
        )
        assert res.status_code == 200, res.json()
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        assert not row.session_constraints
        assert fake_resolve["requests"][-1].extra_student_constraints == []
