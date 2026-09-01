"""시간표 검토 챗봇 API·툴 루프 테스트 (#134, LLM 호출 없음).

chat._llm_step을 monkeypatch해 툴 루프를 mock으로 돈다 — Gemini 응답 한
스텝(LlmStep)만 바꿔치기하므로 루프·툴 실행·기록·저장 경로는 전부 실제
코드가 돈다. 실제 LLM 판단 품질은 tests/scheduler/test_chat_live.py에서
다룬다.
"""

import datetime

import pytest

from app import models
from app.scheduler import chat
from app.scheduler.chat import LlmStep
from tests.test_substitute_requests import _client_as, _clear_overrides  # noqa: F401

MONDAY = datetime.date(2026, 9, 7)
PERIOD_END = MONDAY + datetime.timedelta(days=13)


def _t(hhmm):
    return datetime.time(*map(int, hhmm.split(":")))


@pytest.fixture
def scenario(db_session):
    dept = models.Department(name="정보서비스팀")
    other_dept = models.Department(name="다른 부서")
    db_session.add_all([dept, other_dept])
    db_session.flush()

    db_session.add_all([
        models.Staff(staff_id="STF001", name="담당자", department_id=dept.department_id, password_hash="x"),
        models.Staff(staff_id="STF003", name="같은 부서 동료", department_id=dept.department_id, password_hash="x"),
        models.Staff(staff_id="STF002", name="타부서 담당자", department_id=other_dept.department_id, password_hash="x"),
        models.Student(student_id="20221111", name="학생A", password_hash="x"),
        models.Student(student_id="20229999", name="타부서 학생", password_hash="x"),
    ])
    db_session.add(models.DepartmentPolicy(
        department_id=dept.department_id, availability_mode="weekly_only",
        custom_rules="금요일 오전엔 경험자가 필요하다",
    ))

    # 부서 소속 판정은 "그 부서 공고에 합격"으로 본다 (get_department_student_ids)
    posting = models.JobPosting(department_id=dept.department_id, title="공고", status="모집중")
    other_posting = models.JobPosting(department_id=other_dept.department_id, title="타부서 공고", status="모집중")
    db_session.add_all([posting, other_posting])
    db_session.flush()
    db_session.add_all([
        models.Application(student_id="20221111", posting_id=posting.posting_id, status="합격"),
        models.Application(student_id="20229999", posting_id=other_posting.posting_id, status="합격"),
    ])

    draft = models.ScheduleBatch(
        department_id=dept.department_id, status="draft",
        period_start=MONDAY, period_end=PERIOD_END,
        solver_summary={
            "penalty_summary": {"meal_break": 40, "preference_match": 6},
            "penalty_events": [
                {"name": "meal_break", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": MONDAY.isoformat(), "minute": None},
                {"name": "meal_break", "cost": 20, "amount": 1,
                 "student_id": "20221111", "day": (MONDAY + datetime.timedelta(days=1)).isoformat(), "minute": None},
                {"name": "preference_match", "cost": 6, "amount": 2,
                 "student_id": None, "day": None, "minute": None},
            ],
        },
    )
    db_session.add(draft)
    db_session.flush()

    db_session.add(models.WorkSchedule(
        batch_id=draft.batch_id, student_id="20221111",
        department_id=dept.department_id, work_date=MONDAY,
        start_time=_t("09:00"), end_time=_t("12:00"),
    ))
    db_session.add(models.AvailableTime(
        term="2026-2", student_id="20221111", day_of_week=1,
        start_time=_t("09:00"), end_time=_t("15:00"), preference=1,
    ))
    db_session.add(models.ClassTime(
        term="2026-2", student_id="20221111", day_of_week=2,
        start_time=_t("10:00"), end_time=_t("12:00"),
    ))
    db_session.commit()
    return {"dept": dept, "draft": draft}


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
    """스텝 목록을 순서대로 돌려주는 _llm_step mock."""
    queue = list(steps)
    monkeypatch.setattr(chat, "_llm_step", lambda contents: queue.pop(0))


class TestSessionLifecycle:
    def test_create_session_caches_draft_batch(self, db_session, scenario):
        _, session_id = _create_session(db_session, scenario)
        row = db_session.query(models.ChatSession).get(session_id)
        assert row.batch_id == scenario["draft"].batch_id

    def test_create_without_draft_is_400(self, db_session, scenario):
        client = _client_as(db_session, "STF001", "staff")
        res = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": "2027-01-04", "period_end": "2027-01-17",
        })
        assert res.status_code == 400
        assert "draft" in res.json()["error"]

    def test_other_department_staff_is_403(self, db_session, scenario):
        client = _client_as(db_session, "STF002", "staff")
        res = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": MONDAY.isoformat(), "period_end": PERIOD_END.isoformat(),
        })
        assert res.status_code == 403

    def test_student_role_is_403(self, db_session, scenario):
        client = _client_as(db_session, "20221111", "student")
        res = client.post("/api/schedule/chat/sessions", json={
            "department_id": scenario["dept"].department_id,
            "period_start": MONDAY.isoformat(), "period_end": PERIOD_END.isoformat(),
        })
        assert res.status_code == 403

    def test_colleague_cannot_use_others_session(self, db_session, scenario):
        """같은 부서라도 세션은 시작한 직원 전용이다 (결정 3)."""
        _, session_id = _create_session(db_session, scenario)
        colleague = _client_as(db_session, "STF003", "staff")
        res = colleague.get(f"/api/schedule/chat/sessions/{session_id}/messages")
        assert res.status_code == 403


class TestToolLoop:
    def test_plain_answer_records_no_tools(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [LlmStep(text="이 기간 근무표는 2주 단위입니다.")])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "이 근무표 기간이 어떻게 돼?"},
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["role"] == "assistant"
        assert body["tool_calls"] is None
        assert body["turn_status"] is None

    def test_tool_call_executes_and_is_recorded(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("find_schedules", {"student_id": "20221111"})]),
            LlmStep(text="학생A는 9/7 월요일 09:00-12:00 근무입니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "학생A 근무 언제야?"},
        )
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert len(calls) == 1
        assert calls[0]["tool"] == "find_schedules"
        assert calls[0]["result"]["count"] == 1
        assert calls[0]["result"]["schedules"][0]["student_id"] == "20221111"
        # 읽기 툴에는 역연산이 없다 — 되돌릴 것이 없다
        assert not chat.call_inverses(calls[0])

    def test_hallucinated_delete_leaves_no_applied_marker(
        self, db_session, scenario, monkeypatch
    ):
        """모델이 텍스트로만 "삭제했다"고 해도 화면의 "변경 반영됨" 배지·되돌리기
        버튼은 뜨지 않아야 한다 (#213 확인사항 2).

        배지는 turn_status, 되돌리기 버튼은 tool_calls[]의 역연산 기록으로 판정한다
        (ScheduleChatPanel.MessageBubble) — 둘 다 실제 쓰기 성공에만 붙는다.
        즉 이 두 표식이 떴다면 그 턴에서 진짜 삭제가 일어난 것이다.
        """
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("find_schedules", {"student_name": "학생A", "weekday": "수"})]),
            LlmStep(text="학생A의 수요일 근무 2건을 모두 삭제했습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "학생A 수요일 근무 다 빼줘"},
        )
        assert res.status_code == 201, res.json()
        body = res.json()

        assert body["turn_status"] is None  # 배지 없음
        assert not any(chat.call_inverses(c) for c in body["tool_calls"])  # 되돌리기 버튼 없음
        # 조회 결과도 실제로 비어 있었다 — 모델이 지어낸 2건은 어디에도 없다
        assert body["tool_calls"][0]["result"]["count"] == 0
        # 그리고 무엇도 삭제되지 않았다
        remaining = db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id
        ).count()
        assert remaining == 1

    def test_tool_error_returns_to_model_and_loop_continues(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("get_student_availability", {"student_id": "99999999"})]),
            LlmStep(text="해당 학생을 찾을 수 없습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "99999999 학생 가능 시간 알려줘"},
        )
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        assert "error" in calls[0]["result"]
        assert res.json()["turn_status"] is None  # 턴은 정상 종료

    def test_unknown_tool_is_refused_not_crashed(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=[("regenerate_schedule", {})]),  # 존재하지 않는 툴
            LlmStep(text="그 기능은 지원하지 않습니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "근무표 통째로 다시 만들어줘"},
        )
        assert res.status_code == 201, res.json()
        assert "알 수 없는 툴" in res.json()["tool_calls"][0]["result"]["error"]

    def test_budget_counts_tool_calls_and_allows_final_answer(self, db_session, scenario, monkeypatch):
        """예산 소진 후에도 모델이 텍스트로 마무리하면 정상 턴이다 —
        예산은 툴 호출 수 상한이지 턴을 강제 종료하는 장치가 아니다."""
        steps = [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET + 1)  # 마지막 1건은 예산 초과로 거부됨
        ] + [LlmStep(text="여기까지 조회한 결과로 답하면...")]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "전부 다 보여줘"},
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] is None  # 텍스트로 끝났으니 정상
        executed = [c for c in body["tool_calls"] if "예산" not in str(c["result"].get("error", ""))]
        refused = [c for c in body["tool_calls"] if "예산" in str(c["result"].get("error", ""))]
        assert len(executed) == chat.STEP_BUDGET
        assert len(refused) == 1

    def test_parallel_calls_count_individually(self, db_session, scenario, monkeypatch):
        """한 스텝의 병렬 호출도 예산에 각각 계산된다 (spec-reviewer Medium 반영)."""
        many = [("find_schedules", {})] * (chat.STEP_BUDGET + 2)
        _mock_steps(monkeypatch, [
            LlmStep(function_calls=many),
            LlmStep(text="조회 결과입니다."),
        ])
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "전부 다 보여줘"},
        )
        assert res.status_code == 201, res.json()
        calls = res.json()["tool_calls"]
        executed = [c for c in calls if "예산" not in str(c["result"].get("error", ""))]
        assert len(executed) == chat.STEP_BUDGET  # 병렬이어도 상한을 못 넘는다

    def test_budget_exceeded_when_model_insists_on_tools(self, db_session, scenario, monkeypatch):
        """예산 소진 통보 후에도 툴 호출만 반복하면 budget_exceeded로 끊는다."""
        steps = [
            LlmStep(function_calls=[("find_schedules", {})])
            for _ in range(chat.STEP_BUDGET + 2)
        ]
        _mock_steps(monkeypatch, steps)
        client, session_id = _create_session(db_session, scenario)
        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "전부 다 보여줘"},
        )
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["turn_status"] == "budget_exceeded"
        assert "나눠서" in body["content"]


class TestReadTools:
    def test_explain_penalty_returns_events(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        result = chat._tool_explain_penalty(db_session, session, {"category": "meal_break"})
        assert result["label"] == "식사 시간 미확보"
        assert result["total_cost"] == 40
        assert len(result["events"]) == 2
        assert result["events"][0]["student_id"] == "20221111"

    def test_explain_penalty_absent_category_notes_no_violation(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        result = chat._tool_explain_penalty(db_session, session, {"category": "exam_proximity"})
        assert result["events"] == []
        assert "없습니다" in result["note"]

    def test_get_student_availability_scopes_to_term(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        result = chat._tool_get_student_availability(
            db_session, session, {"student_id": "20221111"}
        )
        assert result["term"] == "2026-2"  # 9/7은 2026-2 학기
        assert result["available_times"][0]["day"] == "월"
        assert result["class_times"][0]["day"] == "화"

    def test_availability_refuses_other_department_student(self, db_session, scenario):
        """spec-reviewer Critical 반영 — 타부서 학생 시간표는 대화로 유출되면 안 된다."""
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        with pytest.raises(ValueError, match="부서 소속이 아닙니다"):
            chat._tool_get_student_availability(
                db_session, session, {"student_id": "20229999"}
            )

    def test_find_schedules_by_student_name(self, db_session, scenario):
        """담당자는 이름으로 말한다 — 이름 필터가 없으면 모델이 학번을 찍어보다
        스텝 예산을 소진한다 (#137 화면 검증에서 관측)."""
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        hit = chat._tool_find_schedules(db_session, session, {"student_name": "학생A"})
        assert hit["count"] == 1
        assert hit["schedules"][0]["student_name"] == "학생A"  # 결과에도 이름이 있다

        with pytest.raises(ValueError, match="찾을 수 없습니다"):
            chat._tool_find_schedules(db_session, session, {"student_name": "없는사람"})

    def test_find_schedules_date_filter(self, db_session, scenario):
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        hit = chat._tool_find_schedules(db_session, session, {"work_date": MONDAY.isoformat()})
        miss = chat._tool_find_schedules(db_session, session, {"work_date": "2026-09-08"})
        assert hit["count"] == 1
        assert miss["count"] == 0

    def test_find_schedules_labels_weekday(self, db_session, scenario):
        """결과에 요일이 함께 온다 — 모델이 날짜→요일을 직접 계산하면 틀린다 (#213)."""
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        result = chat._tool_find_schedules(db_session, session, {})
        assert result["schedules"][0]["work_date"] == MONDAY.isoformat()
        assert result["schedules"][0]["day"] == "월"

    def test_find_schedules_weekday_filter(self, db_session, scenario):
        """요일 필터는 서버가 건다 — "수요일 근무 다 빼줘"가 월요일 배정을 물어오면
        모델이 그걸 수요일 근무로 착각한다 (#213)."""
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        hit = chat._tool_find_schedules(db_session, session, {"weekday": "월"})
        assert hit["count"] == 1

        # 수요일 근무는 없다 — 빈 결과로 정직하게 나와야 한다
        for value in ("수", "수요일"):
            miss = chat._tool_find_schedules(db_session, session, {"weekday": value})
            assert miss["count"] == 0, value
            assert miss["schedules"] == []

        with pytest.raises(ValueError, match="요일을 알 수 없습니다"):
            chat._tool_find_schedules(db_session, session, {"weekday": "Wednesday"})

    def test_find_schedules_rejects_unknown_arg(self, db_session, scenario):
        """모르는 필터를 무시하면 결과가 조건 없이 넓어지는데 모델은 걸러진 줄 안다 —
        "수요일 근무"라며 월요일 배정을 받아 드는 경로다 (#213)."""
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        with pytest.raises(ValueError, match="모르는 인자입니다: day_of_week"):
            chat._tool_find_schedules(db_session, session, {"day_of_week": "수"})

    def _add_gukga_assignment(self, db_session, scenario):
        """둘째 주에 국가근로 배정 4시간을 더한다."""
        db_session.add(models.Student(
            student_id="20222222", name="국가학생", password_hash="x",
            funding_type="gukga",
        ))
        db_session.add(models.WorkSchedule(
            batch_id=scenario["draft"].batch_id, student_id="20222222",
            department_id=scenario["dept"].department_id,
            work_date=MONDAY + datetime.timedelta(days=7),
            start_time=_t("13:00"), end_time=_t("17:00"),
        ))
        db_session.commit()

    def test_find_schedules_totals_split_by_funding(self, db_session, scenario):
        """재원 구분도 합계도 없으면 "2주 교비 총 시간"에 옳게 답할 수 없다 (#260).

        실사용에서 모델이 배정 60건을 눈으로 더해 국가근로까지 섞은 214시간을
        답하고, 교비 상한 190시간과 비교해 "24시간 초과"라고 결론냈다 — 실제
        교비 합계는 185.5시간으로 상한 안이었다.
        """
        self._add_gukga_assignment(db_session, scenario)
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        result = chat._tool_find_schedules(db_session, session, {})

        assert {r["student_name"]: r["funding_type"] for r in result["schedules"]} == {
            "학생A": "gyobi",  # funding_type이 비면 교비로 폴백 (솔버와 같은 규칙)
            "국가학생": "gukga",
        }
        totals = result["batch_totals"]
        assert (totals["hours"], totals["gyobi_hours"], totals["gukga_hours"]) == (7, 3, 4)
        # 상한과 견줄 수 있는 값은 gyobi_hours 하나뿐이다
        assert totals["gyobi_biweekly_limit_hours"] == 190
        assert [
            (w["week"], w["gyobi_hours"], w["gukga_hours"]) for w in totals["by_week"]
        ] == [(1, 3, 0), (2, 0, 4)]

    def test_find_schedules_totals_ignore_filters(self, db_session, scenario):
        """필터를 걸어도 batch_totals는 근무표 전체 기준이다 (#260).

        부분 합계를 부서 상한과 나란히 두면 모델이 그걸 비교한다 — 상한과 견줄
        수 있는 값은 처음부터 전체 기준 하나만 준다.
        """
        self._add_gukga_assignment(db_session, scenario)
        session = models.ChatSession(
            department_id=scenario["dept"].department_id,
            period_start=MONDAY, period_end=PERIOD_END,
            batch_id=scenario["draft"].batch_id, created_by="STF001",
        )
        result = chat._tool_find_schedules(db_session, session, {"student_name": "학생A"})

        assert result["count"] == 1
        assert result["result_hours"] == 3  # 이번 조회분만
        assert result["batch_totals"]["hours"] == 7  # 근무표 전체


class TestBatchFollowing:
    def test_session_follows_regenerated_draft(self, db_session, scenario, monkeypatch):
        """재생성으로 draft가 삭제·재생성돼도 세션이 새 배치를 따라간다 (사실 F)."""
        _mock_steps(monkeypatch, [LlmStep(text="확인했습니다.")])
        client, session_id = _create_session(db_session, scenario)

        old_batch_id = scenario["draft"].batch_id
        db_session.query(models.WorkSchedule).filter_by(batch_id=old_batch_id).delete()
        db_session.delete(scenario["draft"])
        new_draft = models.ScheduleBatch(
            department_id=scenario["dept"].department_id, status="draft",
            period_start=MONDAY, period_end=PERIOD_END, solver_summary={},
        )
        db_session.add(new_draft)
        db_session.commit()

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "새 근무표 어때?"},
        )
        assert res.status_code == 201, res.json()
        row = db_session.get(models.ChatSession, session_id)
        db_session.refresh(row)
        # sqlite는 삭제된 autoincrement id를 재사용할 수 있어 old != new 비교는
        # 무의미하다 — 세션이 "현재 존재하는 draft"를 가리키는지만 확인한다
        assert row.batch_id == new_draft.batch_id

    def test_message_without_any_draft_is_409(self, db_session, scenario):
        client, session_id = _create_session(db_session, scenario)
        db_session.query(models.WorkSchedule).filter_by(
            batch_id=scenario["draft"].batch_id
        ).delete()
        db_session.delete(scenario["draft"])
        db_session.commit()

        res = client.post(
            f"/api/schedule/chat/sessions/{session_id}/messages",
            json={"content": "근무표 어때?"},
        )
        assert res.status_code == 409
        assert "재생성" in res.json()["error"]


class TestHistory:
    def test_history_restores_after_reload(self, db_session, scenario, monkeypatch):
        _mock_steps(monkeypatch, [LlmStep(text="첫 답변"), LlmStep(text="두 번째 답변")])
        client, session_id = _create_session(db_session, scenario)
        client.post(f"/api/schedule/chat/sessions/{session_id}/messages", json={"content": "질문1"})
        client.post(f"/api/schedule/chat/sessions/{session_id}/messages", json={"content": "질문2"})

        res = client.get(f"/api/schedule/chat/sessions/{session_id}/messages")
        assert res.status_code == 200
        roles = [(m["role"], m["content"]) for m in res.json()]
        assert roles == [
            ("user", "질문1"), ("assistant", "첫 답변"),
            ("user", "질문2"), ("assistant", "두 번째 답변"),
        ]
