"""챗봇 쓰기 툴·턴 되돌리기 테스트 (#135, LLM 호출 없음).

핵심 회귀 두 가지 —
① 쓰기 툴이 draft 배치만 바꾸고 confirmed·manual(학생 노출 경로)은 불변,
② 턴 되돌리기는 역순 일괄 취소이며 도중 실패 시 전체 롤백(부분 복구 없음).
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

MONDAY = datetime.date(2026, 9, 7)
TUESDAY = datetime.date(2026, 9, 8)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀", weekly_hour_limit=14)
    db_session.add(dept)
    db_session.flush()

    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x", funding_type="gyobi"),
        models.Student(student_id="20222222", name="학생B", password_hash="x", funding_type="gyobi"),
    ])
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    db_session.add(posting)
    db_session.flush()
    db_session.add_all([
        models.Application(student_id=s, posting_id=posting.posting_id, status="합격")
        for s in ("20221111", "20222222")
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END, solver_summary={},
    )
    confirmed = models.ScheduleBatch(
        department_id=dept.department_id, status="confirmed",
        period_start=MONDAY, period_end=PERIOD_END,
    )
    manual = models.ScheduleBatch(department_id=dept.department_id, status="manual")
    db_session.add_all([draft, confirmed, manual])
    db_session.flush()

    def _row(batch, student_id, day, start, end):
        row = models.WorkSchedule(
            batch_id=batch.batch_id, student_id=student_id,
            department_id=dept.department_id, work_date=day,
            start_time=_t(start), end_time=_t(end),
        )
        db_session.add(row)
        return row

    draft_a = _row(draft, "20221111", MONDAY, "09:00", "12:00")
    confirmed_row = _row(confirmed, "20221111", TUESDAY, "14:00", "16:00")
    manual_row = _row(manual, "20222222", TUESDAY, "14:00", "16:00")
    db_session.commit()
    return {
        "dept": dept, "draft": draft, "draft_a": draft_a,
        "confirmed_row": confirmed_row, "manual_row": manual_row,
    }


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


class TestWriteTools:
    def test_move_applies_and_records_inverse(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("find_schedules", {"student_id": "20221111"})]),
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="월요일 근무를 13:00-16:00로 옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생A 월요일 근무 오후로 옮겨줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "applied"

        move = body["tool_calls"][1]
        assert move["tool"] == "move_schedule"
        assert move["result"]["ok"] is True
        assert move["result"]["applied_count"] == 1
        assert len(move["inverses"]) == 1
        assert move["inverses"][0]["op"] == "move"
        assert move["inverses"][0]["start_time"] == "09:00:00"
        # 읽기 호출에는 역연산이 없다
        assert "inverses" not in body["tool_calls"][0]

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")

    def test_add_uses_session_batch_not_model_args(self, db_session, scenario, monkeypatch):
        """모델이 batch_id를 지정할 수 없다 — 세션의 현재 draft에만 추가된다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("add_schedule", {
                "student_id": "20222222", "work_date": MONDAY.isoformat(),
                "start_time": "13:00", "end_time": "15:00",
                "batch_id": 99999,  # 모델이 멋대로 넣어도 무시된다
            })]),
            LlmStep(text="추가했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생B 월요일 오후 추가해줘")
        assert res.status_code == 201, res.json()
        added_id = res.json()["tool_calls"][0]["result"]["applied"][0]["schedule_id"]
        row = db_session.get(models.WorkSchedule, added_id)
        assert row.batch_id == scenario["draft"].batch_id

    def test_validation_failure_is_partial_failed_and_draft_unchanged(
        self, db_session, scenario, monkeypatch
    ):
        """겹침 이동 실패 — 사유가 결과에 남고 turn_status=partial_failed.

        겹침 대상은 **같은 draft의 다른 배정**이어야 한다. 원래는 confirmed 화 14-16을
        썼는데, 그 확정본은 이 draft를 확정하면 내려가는 배치라 이제 겹침으로 보지
        않는다 (draft 편집 겹침 검사가 to-be-superseded 확정본을 제외한다).
        """
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=TUESDAY,
            start_time=_t("14:00"), end_time=_t("16:00"),
        ))
        db_session.commit()
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "work_date": TUESDAY.isoformat(),
                "start_time": "15:00", "end_time": "17:00",  # 같은 draft 화 14-16과 겹침
            })]),
            LlmStep(text="그 시간은 기존 배정과 겹쳐 옮길 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "화요일 오후로 옮겨줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "partial_failed"
        assert "겹칩니다" in body["tool_calls"][0]["result"]["error"]
        db_session.expire_all()
        assert scenario["draft_a"].work_date == MONDAY  # 변경 없음

    def test_writes_never_touch_confirmed_or_manual(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["confirmed_row"].schedule_id,
                "start_time": "10:00", "end_time": "12:00",
            })]),
            LlmStep(text="확정 배정은 고칠 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "화요일 확정 근무 옮겨줘")
        assert res.status_code == 201, res.json()
        assert "draft" in res.json()["tool_calls"][0]["result"]["error"]
        db_session.expire_all()
        assert scenario["confirmed_row"].start_time == _t("14:00")
        assert scenario["manual_row"].start_time == _t("14:00")

    def test_move_scoped_to_session_batch(self, db_session, scenario, monkeypatch):
        """같은 부서의 다른 draft 배치는 편집 불가 — add와 대칭 스코프
        (spec-reviewer Medium 반영)."""
        other_draft = models.ScheduleBatch(
            department_id=scenario["dept"].department_id, status="draft",
            period_start=MONDAY + datetime.timedelta(days=14),
            period_end=MONDAY + datetime.timedelta(days=27),
        )
        db_session.add(other_draft)
        db_session.flush()
        outside_row = models.WorkSchedule(
            batch_id=other_draft.batch_id, student_id="20222222",
            department_id=scenario["dept"].department_id,
            work_date=MONDAY + datetime.timedelta(days=14),
            start_time=_t("09:00"), end_time=_t("12:00"),
        )
        db_session.add(outside_row)
        db_session.commit()

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": outside_row.schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="이 세션 범위 밖 배정입니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "다음 기간 근무 옮겨줘")
        assert res.status_code == 201, res.json()
        assert "밖의 배정" in res.json()["tool_calls"][0]["result"]["error"]
        db_session.expire_all()
        assert outside_row.start_time == _t("09:00")  # 변경 없음

    def test_student_schedule_me_unchanged_after_chat_edit(self, db_session, scenario, monkeypatch):
        student = _client_as(db_session, "20221111", "student")
        before = student.get("/api/schedule/me").json()

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        assert _send(client, session_id, "옮겨줘").status_code == 201

        student = _client_as(db_session, "20221111", "student")
        assert student.get("/api/schedule/me").json() == before


class TestRevert:
    def _turn_with_move(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
            LlmStep(text="옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "옮겨줘")
        assert res.status_code == 201
        return client, session_id, res.json()["message_id"]

    def test_revert_restores_and_marks_reverted(self, db_session, scenario, monkeypatch):
        client, session_id, message_id = self._turn_with_move(db_session, scenario, monkeypatch)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 200, res.json()
        assert res.json()["turn_status"] == "reverted"
        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("09:00")  # 원상 복구

    def test_revert_twice_is_409(self, db_session, scenario, monkeypatch):
        client, session_id, message_id = self._turn_with_move(db_session, scenario, monkeypatch)
        assert client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        ).status_code == 200
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 409
        assert "이미" in res.json()["error"]

    def test_revert_turn_without_writes_is_400(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [LlmStep(text="그냥 답변입니다.")])
        client, session_id = _create_session(db_session, scenario)
        message_id = _send(client, session_id, "안녕").json()["message_id"]
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 400

    def test_revert_multi_write_turn_reverses_in_order(self, db_session, scenario, monkeypatch):
        """move → add 턴의 되돌리기: add 취소(remove) → move 복원 순서."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[
                ("move_schedule", {
                    "schedule_id": scenario["draft_a"].schedule_id,
                    "start_time": "13:00", "end_time": "16:00",
                }),
                ("add_schedule", {
                    "student_id": "20222222", "work_date": MONDAY.isoformat(),
                    "start_time": "09:00", "end_time": "12:00",
                }),
            ]),
            LlmStep(text="옮기고 추가했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "옮기고 그 자리에 학생B 넣어줘")
        assert res.status_code == 201, res.json()
        message_id = res.json()["message_id"]
        added_id = res.json()["tool_calls"][1]["result"]["applied"][0]["schedule_id"]

        assert client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        ).status_code == 200

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("09:00")
        assert db_session.get(models.WorkSchedule, added_id) is None

    def test_revert_works_even_when_original_exceeds_weekly_limit(
        self, db_session, scenario, monkeypatch
    ):
        """부서 상한을 이미 넘는 배정도 삭제 후 되돌릴 수 있어야 한다 (#137).

        generate는 department.weekly_hour_limit을 제약으로 쓰지 않으므로 그
        상한을 넘는 draft가 나올 수 있다. 되돌리기가 이를 새 배정처럼 검증하면
        "삭제는 되는데 복원은 안 되는" 상태에 갇힌다 — 되돌리기 보장이 깨진다.
        """
        # 부서 상한(14h)을 이미 넘긴 draft 상태를 만든다 (월 3h + 화 12h = 15h)
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=TUESDAY,
            start_time=_t("08:00"), end_time=_t("20:00"),
        ))
        db_session.commit()

        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("remove_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
            })]),
            LlmStep(text="삭제했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "월요일 근무 빼줘")
        assert res.status_code == 201, res.json()
        message_id = res.json()["message_id"]

        res2 = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res2.status_code == 200, res2.json()
        restored = db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id, work_date=MONDAY,
        ).all()
        assert len(restored) == 1
        assert restored[0].start_time == _t("09:00")

    def test_revert_conflict_rolls_back_everything(self, db_session, scenario, monkeypatch):
        """되돌릴 자리를 그 사이 다른 편집이 차지 — 전체 실패, 부분 복구 없음."""
        client, session_id, message_id = self._turn_with_move(db_session, scenario, monkeypatch)

        # 되돌리기가 복원할 자리(월 09-12)에 다른 배정을 끼워 넣는다
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            department_id=scenario["dept"].department_id, work_date=MONDAY,
            start_time=_t("10:00"), end_time=_t("11:00"),
        ))
        db_session.commit()

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 409
        assert "취소했습니다" in res.json()["error"]

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")  # 이동 상태 그대로 유지
        # 메시지도 reverted로 바뀌지 않았다 — 다시 시도 가능
        msg = db_session.get(models.ChatMessage, message_id)
        assert msg.turn_status == "applied"


class TestBudgetWithWrites:
    def test_budget_exceeded_keeps_applied_writes_revertable(self, db_session, scenario, monkeypatch):
        """예산 초과로 끊겨도 적용된 쓰기는 남고, 그 턴을 되돌릴 수 있다 (§6.4)."""
        steps = [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
                "start_time": "13:00", "end_time": "16:00",
            })]),
        ] + [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET + 1)
        ]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "이것저것 다 해줘")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "budget_exceeded"
        assert "되돌릴 수 있습니다" in body["content"]

        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("13:00")  # 쓰기는 적용됨

        res2 = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{body['message_id']}/revert"
        )
        assert res2.status_code == 200
        db_session.expire_all()
        assert scenario["draft_a"].start_time == _t("09:00")


class TestBatchWrites:
    """쓰기 툴 다건화 (#222).

    회귀 대상은 이 이슈의 실제 증상이다 — 한 학생의 같은 요일 배정이 5건 이상일 때
    remove_schedule을 한 건씩 부르면 턴당 툴 호출 예산(STEP_BUDGET=5)에 걸려
    앞 4건만 지워진 채 turn_status=budget_exceeded로 끝났다.
    """

    @pytest.fixture
    def five_wednesdays(self, db_session, scenario):
        """학생A의 수요일 배정 5건 — 예산(5회)으로는 한 건씩 못 지우는 크기."""
        rows = []
        for week in range(5):
            row = models.WorkSchedule(
                batch_id=scenario["draft"].batch_id, student_id="20221111",
                department_id=scenario["dept"].department_id,
                work_date=MONDAY + datetime.timedelta(days=2 + week * 7),
                start_time=_t("09:00"), end_time=_t("11:00"),
            )
            db_session.add(row)
            rows.append(row)
        db_session.commit()
        return [r.schedule_id for r in rows]

    def test_five_removes_fit_in_one_call(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        """#222의 원래 증상 — 조회 1 + 삭제 1, 예산 5회 안에서 5건이 전부 지워진다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("find_schedules", {"student_name": "학생A", "weekday": "수"})]),
            LlmStep(function_calls=[("remove_schedule", {"schedule_ids": five_wednesdays})]),
            LlmStep(text="학생A의 수요일 근무 5건을 모두 뺐습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생A 수요일 근무 다 빼줘")
        assert res.status_code == 201, res.json()
        body = res.json()

        assert body["turn_status"] == "applied"  # budget_exceeded가 아니다
        remove = body["tool_calls"][1]
        assert remove["result"]["applied_count"] == 5
        assert len(remove["inverses"]) == 5
        # 결과에 요일이 담겨 모델이 날짜→요일을 다시 계산하지 않는다 (#213)
        assert {a["day"] for a in remove["result"]["applied"]} == {"수"}

        assert db_session.query(models.WorkSchedule).filter(
            models.WorkSchedule.schedule_id.in_(five_wednesdays)
        ).count() == 0

    def test_batch_removes_are_all_or_nothing(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        """한 건이라도 실패하면 그 호출은 아무것도 지우지 않는다 — 부분 삭제 상태를
        남기지 않는 것이 #222 수정의 목적이다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("remove_schedule", {
                "schedule_ids": five_wednesdays[:3] + [999999],  # 마지막이 없는 id
            })]),
            LlmStep(text="일부 대상을 찾지 못해 아무것도 지우지 않았습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생A 수요일 근무 다 빼줘")
        assert res.status_code == 201, res.json()
        body = res.json()

        call = body["tool_calls"][0]
        assert "하나도 적용하지 않았습니다" in call["result"]["error"]
        assert "4번째" in call["result"]["error"]  # 몇 번째가 실패했는지 알려준다
        assert "inverses" not in call  # 되돌릴 것이 없다
        # 앞 3건은 실제로 지워졌다가 SAVEPOINT로 되감겼다 — id까지 그대로다
        assert db_session.query(models.WorkSchedule).filter(
            models.WorkSchedule.schedule_id.in_(five_wednesdays)
        ).count() == 5

    def test_revert_restores_every_item_of_a_batch(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("remove_schedule", {"schedule_ids": five_wednesdays})]),
            LlmStep(text="5건을 뺐습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        message_id = _send(client, session_id, "다 빼줘").json()["message_id"]

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages/{message_id}/revert"
        )
        assert res.status_code == 200, res.json()
        assert res.json()["turn_status"] == "reverted"
        # remove의 복원은 add라 새 id가 발급된다 — 건수·내용으로 확인한다
        restored = db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id, student_id="20221111",
            start_time=_t("09:00"), end_time=_t("11:00"),
        ).all()
        assert len(restored) == 5

    def test_singular_arg_still_works(self, db_session, scenario, monkeypatch):
        """모델이 학습된 형태대로 schedule_id 하나를 보내도 막지 않는다 — 막으면
        예산만 태우고 아무것도 못 고친다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("remove_schedule", {
                "schedule_id": scenario["draft_a"].schedule_id,
            })]),
            LlmStep(text="뺐습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "월요일 근무 빼줘")
        assert res.status_code == 201, res.json()
        assert res.json()["tool_calls"][0]["result"]["applied_count"] == 1

    def test_duplicate_ids_are_folded_not_failed(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        """같은 id를 두 번 담아도 두 번째가 404로 호출 전체를 무산시키지 않는다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("remove_schedule", {
                "schedule_ids": [five_wednesdays[0], five_wednesdays[0], five_wednesdays[1]],
            })]),
            LlmStep(text="2건을 뺐습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "다 빼줘")
        assert res.status_code == 201, res.json()
        assert res.json()["tool_calls"][0]["result"]["applied_count"] == 2

    def test_batch_over_limit_is_refused_before_touching_draft(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("remove_schedule", {
                "schedule_ids": list(range(1, chat.MAX_EDIT_ITEMS + 2)),
            })]),
            LlmStep(text="한 번에 처리할 수 있는 양을 넘어 나눠 요청해주세요."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "근무표 다 비워줘")
        assert res.status_code == 201, res.json()
        assert "나눠서" in res.json()["tool_calls"][0]["result"]["error"]
        assert db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id
        ).count() == 6  # draft_a + 수요일 5건, 그대로

    def test_move_many_keeps_each_own_date(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        """여러 건 이동은 각자 날짜에 그대로 두고 시각만 바꾼다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_ids": five_wednesdays, "start_time": "13:00", "end_time": "15:00",
            })]),
            LlmStep(text="수요일 근무 5건을 오후로 옮겼습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생A 수요일 근무 다 오후로 옮겨줘")
        assert res.status_code == 201, res.json()
        assert res.json()["tool_calls"][0]["result"]["applied_count"] == 5

        db_session.expire_all()
        rows = db_session.query(models.WorkSchedule).filter(
            models.WorkSchedule.schedule_id.in_(five_wednesdays)
        ).all()
        assert all(r.start_time == _t("13:00") for r in rows)
        assert len({r.work_date for r in rows}) == 5  # 날짜는 제각각 그대로

    def test_move_many_to_one_date_is_refused(
        self, db_session, scenario, monkeypatch, five_wednesdays
    ):
        """여러 건을 같은 날 같은 시각으로 보내면 서로 겹친다 — 시도 전에 막는다."""
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("move_schedule", {
                "schedule_ids": five_wednesdays,
                "work_date": TUESDAY.isoformat(),
                "start_time": "13:00", "end_time": "15:00",
            })]),
            LlmStep(text="여러 건을 같은 날로는 옮길 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "수요일 근무 다 화요일로 옮겨줘")
        assert res.status_code == 201, res.json()
        assert "겹칩니다" in res.json()["tool_calls"][0]["result"]["error"]
        db_session.expire_all()
        assert db_session.get(models.WorkSchedule, five_wednesdays[0]).start_time == _t("09:00")

    def test_add_many_dates_in_one_call(self, db_session, scenario, monkeypatch):
        dates = [(MONDAY + datetime.timedelta(days=2 + w * 7)).isoformat() for w in range(3)]
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("add_schedule", {
                "student_id": "20222222", "work_dates": dates,
                "start_time": "13:00", "end_time": "15:00",
            })]),
            LlmStep(text="학생B를 수요일 3주치에 넣었습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = _send(client, session_id, "학생B 매주 수요일 오후에 넣어줘")
        assert res.status_code == 201, res.json()
        result = res.json()["tool_calls"][0]["result"]
        assert result["applied_count"] == 3
        assert [a["work_date"] for a in result["applied"]] == dates
        assert db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id, student_id="20222222"
        ).count() == 3
