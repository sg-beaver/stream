import logging
from datetime import date, time

import pytest

from app import models
from app.scheduler import review as review_module
from app.scheduler.review import (
    BatchNotDraft,
    BatchNotFound,
    ReviewFinding,
    ReviewResult,
    ReviewUnavailable,
    review_batch,
)


def _make_department(db_session, department_id=1, custom_rules=None):
    db_session.add(models.Department(department_id=department_id, name="정보서비스팀"))
    db_session.add(
        models.DepartmentPolicy(
            department_id=department_id,
            availability_mode="weekly_only",
            custom_rules=custom_rules,
        )
    )
    db_session.commit()


def _make_batch(db_session, department_id=1, status="draft", solver_summary=None):
    batch = models.ScheduleBatch(
        department_id=department_id,
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 7),
        status=status,
        solver_summary=solver_summary,
    )
    db_session.add(batch)
    db_session.commit()
    db_session.refresh(batch)
    return batch


def test_review_batch_not_found_raises(db_session):
    with pytest.raises(BatchNotFound):
        review_batch(db_session, 9999)


def test_review_batch_not_draft_raises(db_session):
    _make_department(db_session)
    batch = _make_batch(db_session, status="confirmed")

    with pytest.raises(BatchNotDraft):
        review_batch(db_session, batch.batch_id)


def test_review_no_rules_skips_ai_call(db_session, monkeypatch):
    _make_department(db_session, custom_rules=None)
    batch = _make_batch(db_session)

    def _fail_if_called(contents):
        raise AssertionError("custom_rules가 없으면 AI를 호출하면 안 된다")

    monkeypatch.setattr(review_module, "_call_gemini", _fail_if_called)

    result = review_batch(db_session, batch.batch_id)

    assert result == {
        "batch_id": batch.batch_id,
        "review_available": False,
        "reason": "no_rules",
    }


def test_review_success_returns_ai_result(db_session, monkeypatch, caplog):
    _make_department(db_session, custom_rules="금요일 마감 시간대엔 경험자가 최소 1명 있어야 한다")
    batch = _make_batch(
        db_session,
        solver_summary={"shortages": [], "penalty_summary": {}, "per_student": []},
    )
    db_session.add(
        models.WorkSchedule(
            batch_id=batch.batch_id,
            student_id="20221234",
            department_id=1,
            work_date=date(2026, 8, 3),
            start_time=time(13, 0),
            end_time=time(17, 0),
        )
    )
    db_session.commit()

    fake_result = ReviewResult(
        summary="전반적으로 규칙을 준수합니다.",
        findings=[
            ReviewFinding(
                severity="critical",
                rule="금요일 마감 시간대엔 경험자가 최소 1명 있어야 한다",
                evidence="2026-08-07(금) 17:00-22:00 배정 없음",
                message="금요일 마감 시간대가 비어 있습니다.",
                suggestion="금요일 마감 시간대 배정 가능 학생 추가를 검토",
            )
        ],
    )
    monkeypatch.setattr(review_module, "_call_gemini", lambda contents: fake_result)

    with caplog.at_level(logging.INFO, logger="app.scheduler.review"):
        result = review_batch(db_session, batch.batch_id)

    # 성공한 검토도 서버 로그에 남아야 한다 — 배치·findings 요약
    assert "검토 완료" in caplog.text and "critical=1" in caplog.text
    assert result["batch_id"] == batch.batch_id
    assert result["review_available"] is True
    assert result["review"]["summary"] == "전반적으로 규칙을 준수합니다."
    finding = result["review"]["findings"][0]
    assert finding["severity"] == "critical"
    assert finding["evidence"] == "2026-08-07(금) 17:00-22:00 배정 없음"
    assert finding["suggestion"]


def test_review_ai_error_returns_quiet_failure(db_session, monkeypatch):
    _make_department(db_session, custom_rules="아무 규칙")
    batch = _make_batch(db_session)

    def _raise_ai_error(contents):
        raise ReviewUnavailable("ai_error")

    monkeypatch.setattr(review_module, "_call_gemini", _raise_ai_error)

    result = review_batch(db_session, batch.batch_id)

    assert result == {
        "batch_id": batch.batch_id,
        "review_available": False,
        "reason": "ai_error",
    }


def test_build_prompt_groups_by_date_with_weekday(db_session):
    """요일 규칙·동시 근무 규칙 판단을 위해 날짜(요일) 아래에 배정을 묶는다."""
    _make_department(db_session, custom_rules="일요일에는 근무를 배정하지 않는다")
    batch = _make_batch(db_session)
    for start, end in [(time(9, 0), time(13, 0)), (time(13, 0), time(17, 0))]:
        db_session.add(
            models.WorkSchedule(
                batch_id=batch.batch_id,
                student_id="20221234",
                department_id=1,
                work_date=date(2026, 8, 3),  # 월요일
                start_time=start,
                end_time=end,
            )
        )
    db_session.commit()
    schedules = (
        db_session.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == batch.batch_id)
        .all()
    )

    prompt = review_module._build_prompt(batch, "일요일에는 근무를 배정하지 않는다", schedules)

    assert "- 2026-08-03(월)" in prompt
    assert "  - 09:00-13:00 20221234" in prompt
    assert "  - 13:00-17:00 20221234" in prompt
    assert "2026-08-01(토) ~ 2026-08-07(금)" in prompt


def test_build_prompt_includes_policy_info(db_session):
    """'마감 시간대'·'최소 인원' 같은 규칙 해석에 필요한 부서 운영 정보를 넣는다."""
    _make_department(db_session, custom_rules="마감 시간대엔 2명이 있어야 한다")
    policy = (
        db_session.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == 1)
        .first()
    )
    policy.opening_hours = {"semester": {"1": [["09:00", "22:00"]]}}
    policy.min_per_slot = 2
    policy.biweekly_max_hours = 200
    db_session.commit()
    batch = _make_batch(db_session)

    prompt = review_module._build_prompt(
        batch, "마감 시간대엔 2명이 있어야 한다", [], policy
    )

    assert "개관 시간" in prompt
    assert '"1": [["09:00", "22:00"]]' in prompt
    assert "시간대별 최소 인원: 2명" in prompt
    assert "2주 근로시간 총합 상한: 200시간" in prompt


def test_build_prompt_without_policy_marks_absent(db_session):
    _make_department(db_session, custom_rules="아무 규칙")
    batch = _make_batch(db_session)

    prompt = review_module._build_prompt(batch, "아무 규칙", [], None)

    assert "## 부서 운영 정보\n(부서 ID: 1 — department 대상 되묻기의 target_id로 이 값을 그대로 쓴다)\n(없음)" in prompt


def test_review_not_configured_when_api_key_missing(db_session, monkeypatch):
    _make_department(db_session, custom_rules="아무 규칙")
    batch = _make_batch(db_session)

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    result = review_batch(db_session, batch.batch_id)

    assert result == {
        "batch_id": batch.batch_id,
        "review_available": False,
        "reason": "not_configured",
    }


# ---------------------------------------------------------------------------
# 학생 자연어 특이사항 (#185)
#
# 격자로는 "언제 되고 언제 안 되는지"밖에 못 낸다. 학생이 적은 사정은 솔버에
# 직접 들어가지 않고 여기(AI 검토)에서 초안과 함께 읽힌다.
# ---------------------------------------------------------------------------


def _hire_student(db_session, student_id, name, department_id=1, posting_id=1):
    db_session.add(models.Student(student_id=student_id, name=name, password_hash="x"))
    if not db_session.query(models.JobPosting).filter(
        models.JobPosting.posting_id == posting_id
    ).first():
        db_session.add(
            models.JobPosting(
                posting_id=posting_id, department_id=department_id, title="공고"
            )
        )
    db_session.add(
        models.Application(student_id=student_id, posting_id=posting_id, status="합격")
    )
    db_session.commit()


def _add_note(db_session, student_id, content, term=None):
    db_session.add(
        models.StudentNote(student_id=student_id, term=term, content=content)
    )
    db_session.commit()


class TestStudentNotes:
    def test_note_is_included_in_prompt(self, db_session, monkeypatch):
        _make_department(db_session, custom_rules="금요일 마감엔 경험자가 있어야 한다")
        _hire_student(db_session, "20221234", "김서강")
        _add_note(db_session, "20221234", "월요일은 3교시가 늦게 끝나 15분쯤 늦습니다")
        batch = _make_batch(
            db_session,
            solver_summary={"shortages": [], "penalty_summary": {}, "per_student": []},
        )

        captured = {}

        def _capture(contents):
            captured["prompt"] = contents
            return ReviewResult(summary="이상 없음", findings=[], clarification_requests=[])

        monkeypatch.setattr(review_module, "_call_gemini", _capture)
        review_batch(db_session, batch.batch_id)

        prompt = captured["prompt"]
        assert "## 학생이 낸 특이사항" in prompt
        # 특이사항 문장은 그대로 들어가되 학번·이름은 별칭으로 나간다 (#200)
        assert "S01: 월요일은 3교시가 늦게 끝나 15분쯤 늦습니다" in prompt
        assert "20221234" not in prompt and "김서강" not in prompt

    def test_note_alone_is_enough_to_review(self, db_session, monkeypatch):
        """부서 규칙이 없어도 학생 사정이 있으면 검토할 것이 있다."""
        _make_department(db_session, custom_rules=None)
        _hire_student(db_session, "20221234", "김서강")
        _add_note(db_session, "20221234", "저녁 근무는 통학 때문에 어렵습니다")
        batch = _make_batch(
            db_session,
            solver_summary={"shortages": [], "penalty_summary": {}, "per_student": []},
        )

        captured = {}

        def _capture(contents):
            captured["prompt"] = contents
            return ReviewResult(summary="이상 없음", findings=[], clarification_requests=[])

        monkeypatch.setattr(review_module, "_call_gemini", _capture)
        result = review_batch(db_session, batch.batch_id)

        assert result["review_available"] is True
        assert "(등록된 부서 규칙 없음)" in captured["prompt"]
        assert "저녁 근무는 통학 때문에 어렵습니다" in captured["prompt"]

    def test_notes_from_every_term_in_the_period_are_read(self, db_session, monkeypatch):
        """한 배치가 두 학기를 걸치면(개강 주) 양쪽 학기 사정이 다 들어와야 한다.

        시작일 학기 하나로 덮으면 8/31(방학)~9/13 배치에서 가을학기에 낸 사정이
        통째로 빠진다 — 가능 시간 전개와 같은 규칙으로 읽는다.
        """
        _make_department(db_session, custom_rules="규칙")
        _hire_student(db_session, "20221234", "김서강")
        _add_note(db_session, "20221234", "가을학기 사정", term="2026-2")
        batch = _make_batch(
            db_session,
            solver_summary={"shortages": [], "penalty_summary": {}, "per_student": []},
        )
        batch.period_start = date(2026, 8, 31)  # 여름학기 마지막 날
        batch.period_end = date(2026, 9, 13)
        db_session.commit()

        captured = {}

        def _capture(contents):
            captured["prompt"] = contents
            return ReviewResult(summary="이상 없음", findings=[], clarification_requests=[])

        monkeypatch.setattr(review_module, "_call_gemini", _capture)
        review_batch(db_session, batch.batch_id)

        assert "가을학기 사정" in captured["prompt"]

    def test_other_departments_note_is_not_included(self, db_session, monkeypatch):
        _make_department(db_session, custom_rules="규칙")
        db_session.add(models.Department(department_id=2, name="다른 부서"))
        db_session.commit()
        _hire_student(db_session, "20221234", "김서강")
        _hire_student(db_session, "20229999", "남의부서", department_id=2, posting_id=2)
        _add_note(db_session, "20229999", "여기 나오면 안 되는 문장")
        batch = _make_batch(
            db_session,
            solver_summary={"shortages": [], "penalty_summary": {}, "per_student": []},
        )

        captured = {}

        def _capture(contents):
            captured["prompt"] = contents
            return ReviewResult(summary="이상 없음", findings=[], clarification_requests=[])

        monkeypatch.setattr(review_module, "_call_gemini", _capture)
        review_batch(db_session, batch.batch_id)

        assert "여기 나오면 안 되는 문장" not in captured["prompt"]
        assert "(등록된 특이사항 없음)" in captured["prompt"]
