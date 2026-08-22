"""실제 Gemini를 호출하는 운영 규칙 위반 검출 통합 테스트 (#80).

케이스와 기대 결과는 scripts/eval_review_cases.json 한 곳에서 관리한다 —
검출률 측정 스크립트(scripts/eval_review.py)와 같은 케이스·판정 기준을
공유하고, 이 테스트는 거기에 더해 DB → review_batch 경로를 end-to-end로
태운다는 점만 다르다.

GEMINI_API_KEY가 없으면 전부 skip — CI에서는 돌지 않고 로컬 검증용이다.
LLM 출력은 비결정적이므로 개별 실패는 재실행으로 확인하고, 반복 검출률
측정은 scripts/eval_review.py --repeat를 쓴다.
"""

import importlib.util
import os
from pathlib import Path

import pytest

from app import models
from app.scheduler.review import ReviewResult, review_batch

# scripts/는 패키지가 아니라 경로로 직접 불러온다.
_EVAL_PATH = Path(__file__).resolve().parents[2] / "scripts" / "eval_review.py"
_spec = importlib.util.spec_from_file_location("eval_review", _EVAL_PATH)
eval_review = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eval_review)

pytestmark = pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY", "").strip(),
    reason="GEMINI_API_KEY 없음 — 실제 Gemini 호출 테스트는 키가 있을 때만 돈다",
)

CASES = eval_review.load_cases()


def _setup(db_session, case):
    """케이스 데이터로 부서·정책·배치·배정을 만들고 batch_id를 돌려준다."""
    db_session.add(models.Department(department_id=1, name="정보서비스팀"))
    db_session.add(
        models.DepartmentPolicy(
            department_id=1,
            availability_mode="weekly_only",
            custom_rules=case.custom_rules,
            opening_hours=case.policy.get("opening_hours"),
            min_per_slot=case.policy.get("min_per_slot"),
            max_per_slot=case.policy.get("max_per_slot"),
            biweekly_max_hours=case.policy.get("biweekly_max_hours"),
        )
    )
    batch = models.ScheduleBatch(
        department_id=1,
        period_start=case.period_start,
        period_end=case.period_end,
        status="draft",
        solver_summary={
            "shortages": [],
            "penalty_summary": {},
            "per_student": case.per_student,
        },
    )
    db_session.add(batch)
    db_session.commit()
    db_session.refresh(batch)
    for student_id, work_date, start, end in case.schedules:
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


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.id)
def test_live_detection(db_session, case):
    batch_id = _setup(db_session, case)

    result = review_batch(db_session, batch_id)

    assert result["review_available"] is True, result
    review = ReviewResult.model_validate(result["review"])
    problems = eval_review.check_result(case, review)
    assert not problems, {"problems": problems, "review": result["review"]}
