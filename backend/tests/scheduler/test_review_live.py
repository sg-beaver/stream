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
from datetime import date, time
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


def _seed_students(db_session, case):
    """부서 소속 학생과 그 부속 데이터를 만든다.

    소속 판정은 services.get_department_student_ids와 같은 규칙이라 공고 + 합격
    지원서가 있어야 한다 — 미배정 후보 조회와 학생 특이사항(#185)이 둘 다 이
    목록을 거친다.
    """
    posting = models.JobPosting(
        posting_id=1, department_id=1, title="근로 공고", status="모집중"
    )
    db_session.add(posting)

    assigned = {student_id for student_id, _, _, _ in case.schedules}
    # 배정된 학생의 가용 시간 — 자기 배정 구간을 덮도록 요일별로 만든다.
    # 없으면 규정 제약 검증(#242)이 배정 전부를 "가용 시간 밖"(HC-CLASS-1)으로
    # 잡는다. 케이스는 자연어 규칙 검출을 재는 것이지 가용 시간 결손을 재는 게 아니다.
    available_by_weekday: dict[str, dict[int, tuple[time, time]]] = {}
    for student_id, work_date, start, end in case.schedules:
        by_weekday = available_by_weekday.setdefault(student_id, {})
        current = by_weekday.get(work_date.isoweekday())
        by_weekday[work_date.isoweekday()] = (
            min(start, current[0]) if current else start,
            max(end, current[1]) if current else end,
        )
    candidates = {c["student_id"]: c for c in case.unassigned_candidates}
    noted = {n["student_id"]: n for n in case.student_notes}

    for student_id in sorted(assigned | set(candidates) | set(noted)):
        candidate = candidates.get(student_id)
        tenure = case.tenure_by_student_id.get(student_id) or (
            candidate.get("tenure_start_date") if candidate else None
        )
        db_session.add(
            models.Student(
                student_id=student_id,
                name=(candidate or noted.get(student_id) or {}).get("name")
                or f"학생{student_id[-4:]}",
                password_hash="x",
                tenure_start_date=date.fromisoformat(tenure) if tenure else None,
            )
        )
        db_session.add(
            models.Application(
                student_id=student_id, posting_id=1, status="합격", cover_letter=""
            )
        )
        for day_of_week, (start, end) in available_by_weekday.get(student_id, {}).items():
            db_session.add(
                models.AvailableTime(
                    student_id=student_id,
                    day_of_week=day_of_week,
                    start_time=start,
                    end_time=end,
                    preference=2,
                )
            )

        if candidate:
            for at in candidate.get("available_times", []):
                db_session.add(
                    models.AvailableTime(
                        student_id=student_id,
                        day_of_week=at["day_of_week"],
                        start_time=time.fromisoformat(at["start"]),
                        end_time=time.fromisoformat(at["end"]),
                        preference=2,
                    )
                )

        note = noted.get(student_id)
        if note:
            # term=None — term_filter가 NULL 행을 어느 학기에서든 함께 읽으므로
            # 케이스마다 학기 키를 맞출 필요가 없다
            db_session.add(
                models.StudentNote(student_id=student_id, term=None, content=note["content"])
            )

    _seed_clarification_answers(db_session, case)


def _seed_clarification_answers(db_session, case):
    """과거 되묻기 답변 — review._get_relevant_clarification_answers가 읽는 형태 그대로."""
    answers = case.clarification_answers or {}
    for student_id, fields in answers.get("student", {}).items():
        for field_name, answer in fields.items():
            db_session.add(
                models.ClarificationAnswer(
                    target_type="student",
                    target_id=student_id,
                    field_name=field_name,
                    question=f"{student_id}의 {field_name}은?",
                    answer=answer,
                    answered_by="STF001",
                )
            )
    for field_name, answer in answers.get("department", {}).items():
        db_session.add(
            models.ClarificationAnswer(
                target_type="department",
                target_id="1",
                field_name=field_name,
                question=f"부서의 {field_name}은?",
                answer=answer,
                answered_by="STF001",
            )
        )
    for entry in answers.get("rule_interpretation", []):
        db_session.add(
            models.ClarificationAnswer(
                target_type="rule_interpretation",
                question=entry["question"],
                answer=entry["answer"],
                answered_by="STF001",
            )
        )


def _setup(db_session, case):
    """케이스 데이터로 부서·정책·배치·배정을 만들고 batch_id를 돌려준다.

    eval_review.py는 _build_prompt에 값을 직접 넘기지만 이 경로는 DB를 거친다 —
    근속·미배정 후보·되묻기 답변·학생 특이사항까지 실제 테이블에 넣어야 두
    경로가 같은 프롬프트를 만든다. 예전엔 학생 행조차 만들지 않아 근속 상대 비교 케이스가
    eval에서는 통과하고 여기서만 실패했다.
    """
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
    db_session.add(
        models.Staff(staff_id="STF001", name="담당자", department_id=1, password_hash="x")
    )
    _seed_students(db_session, case)
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
    # 검출률은 AI가 낸 의견만으로 잰다 — 규정 제약 검증이 붙이는 서버 finding(#242)은
    # 결정적이라 유닛 테스트(test_review.py TestConstraintCheck)에서 고정한다.
    # 섞어 세면 max_findings·forbid_critical 같은 기대치가 AI 성능과 무관하게 흔들린다.
    review = ReviewResult.model_validate(
        {
            **result["review"],
            "findings": [
                f for f in result["review"]["findings"] if f.get("source") != "system"
            ],
        }
    )
    problems = eval_review.check_result(case, review)
    assert not problems, {"problems": problems, "review": result["review"]}
