"""substitute_check.get_ai_check() 단위 테스트 — LLM 호출 없이 mock/DB로 검증
가능한 부분 우선 (설계문서 8번 섹션 / 구현가이드 5단계).

캐시 재사용·무효화·404/409·verdict 강제 규칙을 다룬다. 실제 Gemini가 어떤
findings/clarification_requests를 만드는지는 이 테스트의 범위가 아니다.
"""

from datetime import date, time, timedelta

import pytest

from app import models
from app.scheduler import substitute_check
from app.scheduler.review import ClarificationRequest
from app.scheduler.substitute_check import (
    RequestNotAccepted,
    RequestNotFound,
    SubstituteCheckFinding,
    SubstituteCheckResult,
    get_ai_check,
)

DEPT_ID = 1


def _setup(
    db_session,
    *,
    status="수락",
    substitute_id="20220002",
    custom_rules="금요일 마감 시간대엔 경험자가 최소 1명 있어야 한다",
):
    db_session.add(models.Department(department_id=DEPT_ID, name="정보서비스팀"))
    db_session.add(
        models.DepartmentPolicy(
            department_id=DEPT_ID, availability_mode="weekly_only", custom_rules=custom_rules
        )
    )
    db_session.add(models.Student(student_id="20220001", name="원래근무자", password_hash="x"))
    db_session.add(models.Student(student_id=substitute_id, name="대타학생", password_hash="x"))
    db_session.commit()

    batch = models.ScheduleBatch(
        department_id=DEPT_ID,
        period_start=date(2026, 8, 10),
        period_end=date(2026, 8, 10),
        status="confirmed",
    )
    db_session.add(batch)
    db_session.commit()
    db_session.refresh(batch)

    schedule = models.WorkSchedule(
        batch_id=batch.batch_id,
        student_id="20220001",
        department_id=DEPT_ID,
        work_date=date(2026, 8, 10),
        start_time=time(18, 0),
        end_time=time(22, 0),
    )
    db_session.add(schedule)
    db_session.commit()
    db_session.refresh(schedule)

    request = models.SubstituteRequest(
        schedule_id=schedule.schedule_id,
        requester_id="20220001",
        substitute_id=substitute_id if status != "대기" else None,
        status=status,
        reason="시험 일정과 겹침",
    )
    db_session.add(request)
    db_session.commit()
    db_session.refresh(request)
    return request.request_id


FAKE_OK_RESULT = SubstituteCheckResult(
    summary="규칙을 준수합니다.", overall_verdict="적합", findings=[], clarification_requests=[]
)


class TestPreconditions:
    def test_nonexistent_request_raises_not_found(self, db_session):
        with pytest.raises(RequestNotFound):
            get_ai_check(db_session, 9999)

    def test_pending_request_without_substitute_raises_not_accepted(self, db_session):
        request_id = _setup(db_session, status="대기")
        with pytest.raises(RequestNotAccepted):
            get_ai_check(db_session, request_id)

    def test_no_custom_rules_returns_unavailable_without_calling_gemini(self, db_session, monkeypatch):
        request_id = _setup(db_session, custom_rules=None)

        def _fail_if_called(contents):
            raise AssertionError("custom_rules가 없으면 Gemini를 호출하면 안 된다")

        monkeypatch.setattr(substitute_check, "_call_gemini_check", _fail_if_called)

        result = get_ai_check(db_session, request_id)
        assert result["ai_check_available"] is False
        assert result["reason"] == "no_rules"


class TestCaching:
    def test_second_call_is_cached_and_skips_gemini(self, db_session, monkeypatch):
        request_id = _setup(db_session)
        call_count = {"n": 0}

        def _fake_call(contents):
            call_count["n"] += 1
            return FAKE_OK_RESULT

        monkeypatch.setattr(substitute_check, "_call_gemini_check", _fake_call)

        first = get_ai_check(db_session, request_id)
        assert first["cached"] is False
        assert call_count["n"] == 1

        second = get_ai_check(db_session, request_id)
        assert second["cached"] is True
        assert call_count["n"] == 1  # Gemini 재호출 없음
        assert second["overall_verdict"] == "적합"

        cache_row = db_session.query(models.SubstituteAiCheckCache).one()
        assert cache_row.request_id == request_id

    def test_new_student_clarification_answer_invalidates_cache(self, db_session, monkeypatch):
        request_id = _setup(db_session)
        call_count = {"n": 0}

        def _fake_call(contents):
            call_count["n"] += 1
            return FAKE_OK_RESULT

        monkeypatch.setattr(substitute_check, "_call_gemini_check", _fake_call)

        get_ai_check(db_session, request_id)
        assert call_count["n"] == 1

        cached_again = get_ai_check(db_session, request_id)
        assert cached_again["cached"] is True
        assert call_count["n"] == 1

        cache_row = db_session.query(models.SubstituteAiCheckCache).one()
        # sqlite CURRENT_TIMESTAMP는 초 단위로 잘려 같은 초 안의 두 커밋이 동률일 수
        # 있다 (Postgres는 마이크로초 정밀도라 실사용에서는 이 문제가 훨씬 드묾) —
        # 무효화 비교(answered_at > computed_at)가 확실히 성립하도록 명시적으로 이후
        # 시각을 준다.
        db_session.add(
            models.ClarificationAnswer(
                target_type="student",
                target_id="20220002",
                field_name="tenure_start_date",
                question="q",
                answer="2023-03-02",
                answered_by="STF001",
                answered_at=cache_row.computed_at + timedelta(seconds=1),
            )
        )
        db_session.commit()

        recomputed = get_ai_check(db_session, request_id)
        assert recomputed["cached"] is False
        assert call_count["n"] == 2  # 무효화되어 재계산됨

    def test_department_answer_for_this_department_invalidates_cache(self, db_session, monkeypatch):
        request_id = _setup(db_session)
        call_count = {"n": 0}

        def _fake_call(contents):
            call_count["n"] += 1
            return FAKE_OK_RESULT

        monkeypatch.setattr(substitute_check, "_call_gemini_check", _fake_call)

        get_ai_check(db_session, request_id)
        assert call_count["n"] == 1
        cache_row = db_session.query(models.SubstituteAiCheckCache).one()

        db_session.add(
            models.ClarificationAnswer(
                target_type="department",
                target_id=str(DEPT_ID),
                field_name="biweekly_max_hours",
                question="q",
                answer="190",
                answered_by="STF001",
                answered_at=cache_row.computed_at + timedelta(seconds=1),
            )
        )
        db_session.commit()

        recomputed = get_ai_check(db_session, request_id)
        assert recomputed["cached"] is False
        assert call_count["n"] == 2

    def test_department_answer_for_other_department_does_not_invalidate_cache(
        self, db_session, monkeypatch
    ):
        request_id = _setup(db_session)
        call_count = {"n": 0}

        def _fake_call(contents):
            call_count["n"] += 1
            return FAKE_OK_RESULT

        monkeypatch.setattr(substitute_check, "_call_gemini_check", _fake_call)

        get_ai_check(db_session, request_id)
        assert call_count["n"] == 1
        cache_row = db_session.query(models.SubstituteAiCheckCache).one()

        db_session.add(
            models.ClarificationAnswer(
                target_type="department",
                target_id=str(DEPT_ID + 999),  # 이 요청과 무관한 다른 부서
                field_name="biweekly_max_hours",
                question="q",
                answer="190",
                answered_by="STF001",
                answered_at=cache_row.computed_at + timedelta(seconds=1),
            )
        )
        db_session.commit()

        still_cached = get_ai_check(db_session, request_id)
        assert still_cached["cached"] is True
        assert call_count["n"] == 1

    def test_rule_interpretation_answer_invalidates_cache(self, db_session, monkeypatch):
        """rule_interpretation은 target_id 개념이 없어(review.py와 동일 원칙 —
        _get_relevant_clarification_answers가 전부 조회) 부서와 무관하게 모든
        ai-check 캐시에 영향을 준다."""
        request_id = _setup(db_session)
        call_count = {"n": 0}

        def _fake_call(contents):
            call_count["n"] += 1
            return FAKE_OK_RESULT

        monkeypatch.setattr(substitute_check, "_call_gemini_check", _fake_call)

        get_ai_check(db_session, request_id)
        assert call_count["n"] == 1
        cache_row = db_session.query(models.SubstituteAiCheckCache).one()

        db_session.add(
            models.ClarificationAnswer(
                target_type="rule_interpretation",
                target_id=None,
                field_name=None,
                question="'경험자'의 기준이 뭔가요?",
                answer="근속 1년 이상",
                answered_by="STF001",
                answered_at=cache_row.computed_at + timedelta(seconds=1),
            )
        )
        db_session.commit()

        recomputed = get_ai_check(db_session, request_id)
        assert recomputed["cached"] is False
        assert call_count["n"] == 2


class TestVerdictEnforcement:
    def test_server_forces_pending_verdict_when_clarification_requests_present(
        self, db_session, monkeypatch
    ):
        # AI가 지시를 어기고 clarification_requests를 채우면서도 "적합"을 반환했다고 가정
        misbehaving_result = SubstituteCheckResult(
            summary="근속 정보가 없어 일부 판단이 어렵습니다.",
            overall_verdict="적합",
            findings=[],
            clarification_requests=[
                ClarificationRequest(
                    target_type="student",
                    target_id="20220002",
                    field_name="tenure_start_date",
                    question="근속 시작일을 알 수 있을까요?",
                    reason="경력자 배치 규칙 판단에 필요합니다.",
                )
            ],
        )
        request_id = _setup(db_session)
        monkeypatch.setattr(
            substitute_check, "_call_gemini_check", lambda contents: misbehaving_result
        )

        result = get_ai_check(db_session, request_id)

        assert result["overall_verdict"] == "판단불가"
        cache_row = db_session.query(models.SubstituteAiCheckCache).one()
        assert cache_row.overall_verdict == "판단불가"  # 캐시에도 강제된 값이 저장됨

    def test_critical_finding_without_clarification_keeps_ai_verdict(self, db_session, monkeypatch):
        result_with_finding = SubstituteCheckResult(
            summary="위반이 확인됩니다.",
            overall_verdict="판단불가",
            findings=[
                SubstituteCheckFinding(
                    severity="critical",
                    rule="규칙",
                    evidence="근거",
                    message="위반",
                    suggestion="대안",
                )
            ],
            clarification_requests=[],
        )
        request_id = _setup(db_session)
        monkeypatch.setattr(
            substitute_check, "_call_gemini_check", lambda contents: result_with_finding
        )

        result = get_ai_check(db_session, request_id)

        assert result["overall_verdict"] == "판단불가"
        assert len(result["findings"]) == 1
