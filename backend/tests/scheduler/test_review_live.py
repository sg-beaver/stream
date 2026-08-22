"""실제 Gemini를 호출하는 운영 규칙 위반 검출 통합 테스트 (#80).

GEMINI_API_KEY가 없으면 전부 skip — CI에서는 돌지 않고 로컬 검증용이다.
LLM 출력은 비결정적이므로 assertion은 "위반을 어떤 finding으로든 잡았는가"
수준으로 느슨하게 둔다. 케이스별 검출률을 반복 측정하려면
scripts/eval_review.py를 쓴다.
"""

import os
from datetime import date, time

import pytest

from app import models
from app.scheduler.review import review_batch

pytestmark = pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY", "").strip(),
    reason="GEMINI_API_KEY 없음 — 실제 Gemini 호출 테스트는 키가 있을 때만 돈다",
)

# 2026-08-01(토) ~ 2026-08-07(금). 일요일은 08-02, 월요일은 08-03.
PERIOD_START = date(2026, 8, 1)
PERIOD_END = date(2026, 8, 7)


def _setup(db_session, custom_rules, schedules, per_student=None):
    """부서·배치·배정을 만들고 batch_id를 돌려준다.

    schedules: (student_id, work_date, start, end) 튜플 목록.
    """
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(
        models.DepartmentPolicy(
            department_id=1,
            availability_mode="weekly_only",
            custom_rules=custom_rules,
        )
    )
    batch = models.ScheduleBatch(
        department_id=1,
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        status="draft",
        solver_summary={
            "shortages": [],
            "penalty_summary": {},
            "per_student": per_student or [],
        },
    )
    db_session.add(batch)
    db_session.commit()
    db_session.refresh(batch)
    for student_id, work_date, start, end in schedules:
        db_session.add(
            models.WorkSchedule(
                batch_id=batch.batch_id,
                student_id=student_id,
                department_id=1,
                work_date=work_date,
                start_time=start,
                end_time=end,
            )
        )
    db_session.commit()
    return batch.batch_id


def _finding_text(finding):
    return " ".join(
        str(v)
        for v in (
            finding.get("rule"),
            finding.get("evidence"),
            finding.get("message"),
            finding.get("suggestion"),
        )
        if v
    )


def _violations(review):
    return [f for f in review["findings"] if f["severity"] in ("critical", "warning")]


def test_live_detects_weekly_hours_violation(db_session):
    """주당 상한 규칙 — 16시간 배정된 학생을 위반으로 잡아야 한다."""
    over = [
        ("20221234", date(2026, 8, d), time(9, 0), time(13, 0)) for d in (3, 4, 5, 6)
    ]  # 4시간 × 4일 = 16시간
    ok = [("20225678", date(2026, 8, 3), time(13, 0), time(17, 0))]  # 4시간
    batch_id = _setup(
        db_session,
        custom_rules="한 학생은 주당 12시간을 초과해 근무할 수 없다",
        schedules=over + ok,
        per_student=[
            {"student_id": "20221234", "total_hours": 16},
            {"student_id": "20225678", "total_hours": 4},
        ],
    )

    result = review_batch(db_session, batch_id)

    assert result["review_available"] is True, result
    hits = [f for f in _violations(result["review"]) if "20221234" in _finding_text(f)]
    assert hits, result["review"]
    # 완료 기준: 근거·대안 제시 — 위반 finding에는 evidence/suggestion이 있어야 한다
    assert hits[0]["evidence"], hits[0]
    assert hits[0]["suggestion"], hits[0]


def test_live_detects_forbidden_sunday_assignment(db_session):
    """요일 금지 규칙 — 일요일(08-02) 배정을 위반으로 잡아야 한다."""
    batch_id = _setup(
        db_session,
        custom_rules="일요일에는 근무를 배정하지 않는다",
        schedules=[
            ("20221234", date(2026, 8, 2), time(9, 0), time(13, 0)),  # 일요일
            ("20225678", date(2026, 8, 3), time(9, 0), time(13, 0)),  # 월요일
        ],
    )

    result = review_batch(db_session, batch_id)

    assert result["review_available"] is True, result
    hits = [
        f
        for f in _violations(result["review"])
        if "08-02" in _finding_text(f) or "일요일" in _finding_text(f)
    ]
    assert hits, result["review"]


def test_live_detects_understaffed_morning(db_session):
    """동시 인원 규칙 — 평일 오전에 1명만 배정된 날을 잡아야 한다."""
    batch_id = _setup(
        db_session,
        custom_rules="평일 09:00-13:00에는 최소 2명이 함께 근무해야 한다",
        schedules=[
            # 월요일 오전 1명뿐 (위반), 화요일 오전은 2명 (준수)
            ("20221234", date(2026, 8, 3), time(9, 0), time(13, 0)),
            ("20221234", date(2026, 8, 4), time(9, 0), time(13, 0)),
            ("20225678", date(2026, 8, 4), time(9, 0), time(13, 0)),
        ],
    )

    result = review_batch(db_session, batch_id)

    assert result["review_available"] is True, result
    hits = [
        f
        for f in _violations(result["review"])
        if "08-03" in _finding_text(f) or "월" in _finding_text(f)
    ]
    assert hits, result["review"]


def test_live_clean_schedule_has_no_critical(db_session):
    """위반 없는 근무표 — critical을 만들어내면 안 된다 (오탐 방지)."""
    batch_id = _setup(
        db_session,
        custom_rules="한 학생은 주당 12시간을 초과해 근무할 수 없다",
        schedules=[
            ("20221234", date(2026, 8, 3), time(9, 0), time(13, 0)),
            ("20221234", date(2026, 8, 5), time(9, 0), time(13, 0)),
        ],
        per_student=[{"student_id": "20221234", "total_hours": 8}],
    )

    result = review_batch(db_session, batch_id)

    assert result["review_available"] is True, result
    criticals = [f for f in result["review"]["findings"] if f["severity"] == "critical"]
    assert not criticals, result["review"]


def test_live_unverifiable_rule_goes_to_summary_not_findings(db_session):
    """신입/경력처럼 근거 데이터가 없는 규칙 — 추측 finding 대신 summary에서 확인 불가를 밝힌다."""
    batch_id = _setup(
        db_session,
        custom_rules="금요일 마감 시간대엔 경력자가 최소 1명 있어야 한다",
        schedules=[("20221234", date(2026, 8, 7), time(18, 0), time(22, 0))],
    )

    result = review_batch(db_session, batch_id)

    assert result["review_available"] is True, result
    criticals = [f for f in result["review"]["findings"] if f["severity"] == "critical"]
    assert not criticals, result["review"]
    summary = result["review"]["summary"]
    assert any(kw in summary for kw in ("경력", "신입", "확인")), result["review"]
