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


def test_review_success_returns_ai_result(db_session, monkeypatch):
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
                severity="info",
                rule="금요일 마감 시간대엔 경험자가 최소 1명 있어야 한다",
                message="금요일 배정이 없어 판단할 근거가 부족합니다.",
                suggestion=None,
            )
        ],
    )
    monkeypatch.setattr(review_module, "_call_gemini", lambda contents: fake_result)

    result = review_batch(db_session, batch.batch_id)

    assert result["batch_id"] == batch.batch_id
    assert result["review_available"] is True
    assert result["review"]["summary"] == "전반적으로 규칙을 준수합니다."
    assert result["review"]["findings"][0]["severity"] == "info"


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
