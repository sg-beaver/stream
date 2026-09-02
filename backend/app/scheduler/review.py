"""근무표 draft 배치에 대한 AI 검토 (Gemini).

AI는 검토 의견만 내고, 확정은 항상 사람이 한다 — 이 모듈은 지시적 표현
("확정하세요", "이대로 진행하세요")을 만들지 않도록 프롬프트에서 명시한다.

Gemini 연동은 ai/crawler/refine/gemini.py의 패턴(구조화 출력 강제, 429 1회
재시도)을 따른다. ai/는 backend와 별개의 패키지·가상환경이라 직접 import할
수 없어 여기서 패턴만 다시 구현했다. 단, 원본은 GEMINI_API_KEY가 없으면
RuntimeError로 죽는데, 이 API는 "조용한 실패"가 우선이라 그 지점만 다르게
동작한다 — 예외 대신 ReviewUnavailable("not_configured")로 처리한다.
"""

import json
import logging
import os
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Literal, Optional

from google import genai
from google.genai import errors, types
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sqlalchemy import or_

from app import models
from app.scheduler import deidentify, verify
from app.services import (
    get_department_student_ids,
    term_filter,
    term_segments,
)

logger = logging.getLogger(__name__)

# 기본 모델 (#177): 18케이스 × 2라운드 실측에서 3.7-flash 36/36 vs 3.5-flash 35/36,
# 응답 4.1s vs 5.3s, 호출당 토큰 4,124 vs 4,567. provider는 REQ-SCHED-016대로 Gemini 고정.
# getenv의 기본값이 아니라 `or`를 쓴다 — .env에 REVIEW_MODEL=만 빈 값으로 남아 있으면
# 기본값이 무시돼 모델명이 ""가 되고 SDK가 "model is required."로 죽는다.
MODEL = os.getenv("REVIEW_MODEL") or "gemini-3.7-flash"
RATE_LIMIT_RETRY_DELAY = float(os.getenv("REVIEW_RETRY_DELAY", "40.0"))

# 마지막 _call_gemini 호출의 토큰 사용량 — {"input_tokens", "output_tokens",
# "total_tokens"} 또는 실패 시 None. 함수 시그니처(ReviewResult 단일 반환)는
# 기존 호출부(review_batch 등) 호환을 위해 그대로 두고, 비용 추적용으로만
# 이 모듈 변수를 side channel로 쓴다 (eval_review.py --provider 비교, #114).
LAST_USAGE: Optional[dict] = None

# 검토 시스템 프롬프트 원문은 review_system_prompt.md에서 관리한다 —
# 프롬프트만 고칠 때 코드 변경이 필요 없도록 분리.
SYSTEM_PROMPT = (
    Path(__file__).with_name("review_system_prompt.md").read_text(encoding="utf-8")
)


class ReviewFinding(BaseModel):
    severity: Literal["critical", "warning", "info"]
    rule: Optional[str] = None
    evidence: Optional[str] = None
    message: str
    suggestion: Optional[str] = None


class ClarificationRequest(BaseModel):
    target_type: Literal["student", "department", "rule_interpretation"]
    target_id: Optional[str] = None
    field_name: Optional[str] = None
    question: str
    reason: str


class ReviewResult(BaseModel):
    summary: str
    findings: list[ReviewFinding]
    clarification_requests: list[ClarificationRequest] = []


class BatchNotFound(Exception):
    pass


class BatchNotDraft(Exception):
    pass


class ReviewUnavailable(Exception):
    """조용한 실패 — 라우터는 이 reason을 그대로 response에 담아 200으로 응답한다."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def review_batch(db: Session, batch_id: int) -> dict:
    batch = (
        db.query(models.ScheduleBatch)
        .filter(models.ScheduleBatch.batch_id == batch_id)
        .first()
    )
    if batch is None:
        raise BatchNotFound()
    if batch.status != "draft":
        raise BatchNotDraft()

    policy = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == batch.department_id)
        .first()
    )
    custom_rules = policy.custom_rules if policy else None
    # 학생이 자연어로 낸 특이사항도 검토 근거다 (#185) — 부서 규칙이 없어도
    # 학생 사정이 있으면 검토할 것이 있다
    student_notes = _get_student_notes(
        db, batch.department_id, batch.period_start, batch.period_end
    )
    # 규정 제약(SPEC 3장 Hard Constraint)은 LLM이 아니라 verify.py가 결정적으로
    # 채점한다 (#242). 자연어 규칙이 하나도 없어도 규정 위반은 검토 대상이고,
    # 손으로 고친 draft는 솔버 제약 밖으로 나갈 수 있어 확정 전에 여기서 걸러야 한다.
    hard_check = _hard_constraint_check(db, batch_id)
    hard_violations = (hard_check or {}).get("violations", [])
    soft_penalties = _soft_penalty_rows(batch)
    # 검토를 시작할 이유로는 critical 위반만 센다 — 최소 인원 미달(SC-UNDER-1)은
    # 완화 정책상 "가능 시간이 모자라다"는 리포트라 거의 모든 초안에 warning으로
    # 깔리고, 화면에는 이미 부족 슬롯으로 나온다. 검토가 실제로 돌 때는 warning도
    # 프롬프트·findings에 그대로 들어간다.
    blocking_violations = [v for v in hard_violations if v["severity"] == "critical"]
    if (
        not custom_rules
        and not student_notes
        and not blocking_violations
        and not soft_penalties
    ):
        logger.info(
            "batch %s 검토 건너뜀 — 부서 운영 규칙·학생 특이사항·제약 위반·페널티 없음",
            batch_id,
        )
        return {"batch_id": batch_id, "review_available": False, "reason": "no_rules"}

    work_schedules = (
        db.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == batch_id)
        .all()
    )
    assigned_student_ids = {ws.student_id for ws in work_schedules}

    summary = batch.solver_summary or {}
    per_student_ids = {
        s["student_id"] for s in summary.get("per_student", []) if s.get("student_id")
    }
    tenure_by_student_id = {
        s.student_id: s.tenure_start_date
        for s in db.query(models.Student)
        .filter(models.Student.student_id.in_(assigned_student_ids | per_student_ids))
        .all()
    }
    unassigned_candidates = _unassigned_candidates(db, batch.department_id, assigned_student_ids)

    relevant_student_ids = (
        assigned_student_ids
        | per_student_ids
        | {c["student"].student_id for c in unassigned_candidates}
        # 부서 명단 밖 학생(MEMBERSHIP 위반)처럼 위 집합에 없는 학번이 제약 검증·
        # 페널티 이벤트에 나올 수 있다 — 별칭을 못 받으면 학번이 그대로 나간다
        | {v["student_id"] for v in hard_violations if v.get("student_id")}
        | {
            ev["student_id"]
            for _, _, events in soft_penalties
            for ev in events
            if ev.get("student_id")
        }
    )
    clarification_answers = _get_relevant_clarification_answers(
        db, batch.department_id, relevant_student_ids
    )

    contents = _build_prompt(
        batch,
        custom_rules,
        work_schedules,
        policy,
        tenure_by_student_id,
        unassigned_candidates,
        clarification_answers,
        student_notes,
        hard_check,
        soft_penalties,
    )

    # 프롬프트가 완성된 다음 한 번에 비식별화한다 (#200) — 섹션마다 치환하면
    # 새 섹션이 늘 때 빠뜨리기 쉽다. 부서 학생 전원을 매핑에 넣고(특이사항·부서
    # 규칙 원문에 배정되지 않은 학생 이름이 나올 수 있다), 부서 밖 학번(과거
    # 배정이 solver_summary에 남은 경우)도 별칭을 받게 한다.
    deid = deidentify.build_for_department(db, batch.department_id)
    for student_id in sorted(relevant_student_ids):
        deid.alias(student_id)
    contents = deid.mask(contents)

    started = time.monotonic()
    try:
        result = _restore_result(_call_gemini(contents), deid)
    except ReviewUnavailable as exc:
        logger.info("batch %s 검토 불가 — reason=%s", batch_id, exc.reason)
        return {"batch_id": batch_id, "review_available": False, "reason": exc.reason}

    # 규정 위반은 LLM이 빠뜨려도 화면에서 사라지면 안 된다 — 서버가 직접 finding으로
    # 붙이고(source="system"), AI에게는 같은 건을 중복해 적지 말라고 지시한다.
    review = result.model_dump()
    system_findings = _violation_findings(hard_violations)
    # 심각도 순으로 섞는다 — 규정 위반이라도 최소 인원 미달(warning)이 먼저 뜨면
    # 담당자가 정작 급한 위반을 아래에서 찾게 된다. 같은 심각도면 서버 판정이 먼저다
    # (sorted가 안정 정렬이라 아래 이어붙인 순서가 그대로 유지된다).
    review["findings"] = sorted(
        system_findings + [{**f, "source": "ai"} for f in review["findings"]],
        key=lambda f: _SEVERITY_ORDER.get(f["severity"], len(_SEVERITY_ORDER)),
    )

    severities = [f["severity"] for f in review["findings"]]
    logger.info(
        "batch %s 검토 완료 — model=%s findings=%d (critical=%d warning=%d info=%d) "
        "system=%d clarification_requests=%d %.1fs",
        batch_id,
        MODEL,
        len(severities),
        severities.count("critical"),
        severities.count("warning"),
        severities.count("info"),
        len(system_findings),
        len(result.clarification_requests),
        time.monotonic() - started,
    )
    return {
        "batch_id": batch_id,
        "review_available": True,
        "review": review,
    }


def _restore_result(result: ReviewResult, deid) -> ReviewResult:
    """응답 속 별칭을 실제 학생 표기로 되돌린다 (#200).

    사람이 읽는 문장은 `이름(학번)`으로 되돌린다 — 프롬프트에 학번과 이름이
    함께 들어가던 때와 같은 정보량이고, 동명이인도 구분된다. 반면 target_id는
    ClarificationAnswer의 키로 그대로 저장되므로 학번만 넣는다.
    """

    def _text(value: Optional[str]) -> Optional[str]:
        return deid.restore(value, style="name_id") if value else value

    return ReviewResult(
        summary=_text(result.summary) or "",
        findings=[
            ReviewFinding(
                severity=f.severity,
                # rule에는 부서 규칙 원문이 인용된다 — 규칙 문장 자체에 학생
                # 이름이 들어 있을 수 있어 여기도 되돌린다
                rule=_text(f.rule),
                evidence=_text(f.evidence),
                message=_text(f.message) or "",
                suggestion=_text(f.suggestion),
            )
            for f in result.findings
        ],
        clarification_requests=[
            ClarificationRequest(
                target_type=c.target_type,
                target_id=(
                    deid.to_student_id(c.target_id)
                    if c.target_type == "student"
                    else c.target_id
                ),
                field_name=c.field_name,
                question=_text(c.question) or "",
                reason=_text(c.reason) or "",
            )
            for c in result.clarification_requests
        ],
    )


WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]


def _format_date(d) -> str:
    return f"{d.isoformat()}({WEEKDAY_KO[d.weekday()]})"


def _policy_section(policy: Optional["models.DepartmentPolicy"]) -> str:
    """규칙 해석에 필요한 부서 운영 정보 — '마감 시간대', '최소 인원' 같은
    표현을 AI가 개관 시간·정원 설정과 대조할 수 있게 한다."""
    if policy is None:
        return "(없음)"
    lines = []
    if policy.opening_hours:
        lines.append(
            "- 개관 시간 (학사 기간별, 요일 키는 월=1~일=7, 값은 [시작, 종료] 구간 "
            f"목록이며 빈 목록이면 폐관): {json.dumps(policy.opening_hours, ensure_ascii=False)}"
        )
    if policy.min_per_slot is not None:
        lines.append(f"- 시간대별 최소 인원: {policy.min_per_slot}명")
    if policy.max_per_slot is not None:
        lines.append(f"- 시간대별 최대 인원: {policy.max_per_slot}명")
    if policy.biweekly_max_hours is not None:
        lines.append(f"- 부서 전체 2주 근로시간 총합 상한: {policy.biweekly_max_hours}시간")
    return "\n".join(lines) or "(없음)"


def _unassigned_candidates(
    db: Session, department_id: int, assigned_student_ids: set[str]
) -> list[dict]:
    """이 부서 소속(공고 합격)이면서 AvailableTime이 등록돼 있지만, 이번 batch에는
    배정되지 않은 학생 — "경력자 배치" 같은 규칙에서 대안으로 제시할 후보군.

    tenure_start_date가 NULL인 학생(신규 지원자 등 근속 정보가 없는 경우)은
    상대 비교 자체가 성립하지 않으므로 제외한다.
    """
    dept_student_ids = set(get_department_student_ids(db, department_id))
    candidate_ids = dept_student_ids - assigned_student_ids
    if not candidate_ids:
        return []

    students = (
        db.query(models.Student)
        .filter(
            models.Student.student_id.in_(candidate_ids),
            models.Student.tenure_start_date.isnot(None),
        )
        .all()
    )
    if not students:
        return []

    availabilities = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id.in_([s.student_id for s in students]))
        .all()
    )
    by_student: dict[str, list["models.AvailableTime"]] = {}
    for at in availabilities:
        by_student.setdefault(at.student_id, []).append(at)

    # AvailableTime이 아예 없는 학생은 "가능시간이 등록된 학생"이 아니므로 제외
    return [
        {"student": s, "available_times": by_student[s.student_id]}
        for s in students
        if s.student_id in by_student
    ]


def _get_relevant_clarification_answers(
    db: Session, department_id: int, student_ids: set[str]
) -> dict:
    """이전에 답변된 되묻기를 다음 review에 재활용하기 위한 조회 (설계문서 5번 섹션).

    student/department는 현재 배치와 관련된 ID로만 좁혀 구조화된 키로 매칭한다.
    rule_interpretation은 대상 ID 개념이 없어 저장된 전부를 가져온다 — 규칙 해석
    답변은 많지 않을 것으로 가정한다(#79 설계문서 5번 섹션 참고, 많아지면 재검토).
    """
    student_answers: dict[str, dict[str, str]] = {}
    department_answers: dict[str, str] = {}
    rule_interpretation_answers: list[dict[str, str]] = []

    if student_ids:
        for row in (
            db.query(models.ClarificationAnswer)
            .filter(
                models.ClarificationAnswer.target_type == "student",
                models.ClarificationAnswer.target_id.in_(student_ids),
            )
            .order_by(models.ClarificationAnswer.answered_at.asc())
            .all()
        ):
            student_answers.setdefault(row.target_id, {})[row.field_name] = row.answer

    for row in (
        db.query(models.ClarificationAnswer)
        .filter(
            models.ClarificationAnswer.target_type == "department",
            models.ClarificationAnswer.target_id == str(department_id),
        )
        .order_by(models.ClarificationAnswer.answered_at.asc())
        .all()
    ):
        department_answers[row.field_name] = row.answer

    for row in (
        db.query(models.ClarificationAnswer)
        .filter(models.ClarificationAnswer.target_type == "rule_interpretation")
        .order_by(models.ClarificationAnswer.answered_at.asc())
        .all()
    ):
        rule_interpretation_answers.append({"question": row.question, "answer": row.answer})

    return {
        "student": student_answers,
        "department": department_answers,
        "rule_interpretation": rule_interpretation_answers,
    }


def _confirmed_info_section(clarification_answers: dict) -> str:
    lines = []
    for student_id, fields in clarification_answers.get("student", {}).items():
        for field_name, answer in fields.items():
            lines.append(f"- {student_id}의 {field_name}: {answer}")
    for field_name, answer in clarification_answers.get("department", {}).items():
        lines.append(f"- 부서의 {field_name}: {answer}")
    return "\n".join(lines) or "(없음)"


def _confirmed_rule_interpretation_section(clarification_answers: dict) -> str:
    entries = clarification_answers.get("rule_interpretation", [])
    if not entries:
        return "(없음)"
    return "\n".join(f"- Q: {e['question']}\n  A: {e['answer']}" for e in entries)


def _tenure_label(tenure_start_date) -> str:
    return tenure_start_date.isoformat() if tenure_start_date else "근속 정보 없음"


def _unassigned_section(unassigned_candidates: list[dict]) -> str:
    if not unassigned_candidates:
        return "(없음)"
    lines = []
    for c in unassigned_candidates:
        student = c["student"]
        slots = ", ".join(
            f"{WEEKDAY_KO[at.day_of_week - 1]} {at.start_time.strftime('%H:%M')}-"
            f"{at.end_time.strftime('%H:%M')}"
            for at in sorted(c["available_times"], key=lambda a: (a.day_of_week, a.start_time))
        )
        lines.append(
            f"- {student.student_id} {student.name} "
            f"(근속 시작일: {_tenure_label(student.tenure_start_date)}): {slots or '(없음)'}"
        )
    return "\n".join(lines)


def _student_hours_section(work_schedules: list) -> str:
    """배정 결과에서 학생별 '하루'·'주(월~일)' 근무시간을 서버가 미리 계산해 넣는다.

    #114 모델 비교 실험에서, 측정한 9개 모델 중 7개가 per_student(배치 기간
    전체 합계)를 "주당 N시간" 상한과 그대로 비교하는 오탐을 냈다. 기간 합계와
    주간 합계를 가르는 건 서버가 확정적으로 계산할 수 있는 값이므로 LLM에
    맡기지 않는다 — LLM은 규칙 해석만 하게 두고 산술은 여기서 끝낸다.
    """
    if not work_schedules:
        return "(배정 없음)"

    per_day: dict = {}
    for ws in work_schedules:
        minutes = (ws.end_time.hour * 60 + ws.end_time.minute) - (
            ws.start_time.hour * 60 + ws.start_time.minute
        )
        by_date = per_day.setdefault(ws.student_id, {})
        by_date[ws.work_date] = by_date.get(ws.work_date, 0.0) + minutes / 60

    lines = []
    for student_id in sorted(per_day):
        lines.append(f"- {student_id}")
        by_week: dict = {}
        for d, hours in per_day[student_id].items():
            monday = d - timedelta(days=d.weekday())
            by_week.setdefault(monday, []).append((d, hours))
        for monday in sorted(by_week):
            days = sorted(by_week[monday])
            total = sum(h for _, h in days)
            detail = ", ".join(f"{_format_date(d)} {h:g}시간" for d, h in days)
            lines.append(
                f"  - 주({monday.isoformat()}~{(monday + timedelta(days=6)).isoformat()}) "
                f"합계 {total:g}시간 — {detail}"
            )
    return "\n".join(lines)


def _get_student_notes(
    db: Session, department_id: int, period_start: date, period_end: date
) -> list[tuple[str, str, str]]:
    """부서 소속 학생이 낸 자연어 특이사항 (#185) — (학번, 이름, 내용).

    학기마다 사정이 달라 학기별로 저장되므로, 근무표 기간에 걸치는 학기를 모두
    읽는다. 개강 주(8/31 방학, 9/1 학기)처럼 한 배치가 두 학기를 걸치면 시작일
    학기 하나로 덮을 때 가을학기에 낸 사정이 통째로 빠진다 — 가능 시간 전개
    (services.term_segments)와 같은 규칙이다.
    """
    student_ids = get_department_student_ids(db, department_id)
    if not student_ids:
        return []
    terms = {term for term, _, _ in term_segments(period_start, period_end)}
    rows = (
        db.query(models.StudentNote, models.Student.name)
        .join(models.Student, models.Student.student_id == models.StudentNote.student_id)
        .filter(
            models.StudentNote.student_id.in_(student_ids),
            or_(*[term_filter(models.StudentNote.term, term) for term in terms]),
        )
        .all()
    )
    return [(row.student_id, name, row.content) for row, name in rows]


def _student_notes_section(notes: list[tuple[str, str, str]]) -> str:
    if not notes:
        return "(등록된 특이사항 없음)"
    return "\n".join(
        f"- {student_id} {name}: {content}" for student_id, name, content in notes
    )


# ---- 규정 제약(Hard) · 소프트 제약 페널티 (#242) ----

# verify.py가 내는 규칙 ID → 무엇이 잘못됐는지 한 마디로. 여러 건을 한 finding으로
# 묶을 때 그대로 message가 되므로("개관 시간 밖 배정 3건이 확인됩니다") 제약 이름이
# 아니라 문제를 가리키는 말로 적는다. 판정 기준은 SCHEDULER_SPEC 3장이다.
_HARD_RULE_LABELS = {
    "HC-OPEN": "개관 시간 밖 배정",
    "HC-CLASS-1": "학생 가능 시간 밖 배정",
    "HC-CLASS-6": "근로 활동 기간 밖 배정",
    "HC-STAFF-1": "시간대별 최대 인원 초과",
    "HC-STAFF-2": "시간대별 최소 인원 미달",
    "HC-TIME-1": "교비 주당 근로 상한 초과",
    "HC-TIME-2": "국가 주당 근로 상한 초과",
    "HC-TIME-3": "국가 월별 근로 상한 초과",
    "HC-TIME-4": "부서 2주 교비 총합 상한 초과",
    "SC-UNDER-1": "최소 인원 미달",
    "OVERLAP": "동일 학생 중복 배정",
    "BATCH-RANGE": "배치 기간 밖 배정",
    "MEMBERSHIP": "부서 명단 밖 학생 배정",
    "PROVENANCE": "솔버 산출물 아님",
}

# 규정 위반 finding의 suggestion — 프롬프트가 critical/warning에 조정 방향을 요구하므로
# 서버가 만드는 finding도 같은 형식을 지킨다. 규칙별로 조치가 정해져 있어 고정 문장이다.
_HARD_RULE_SUGGESTIONS = {
    "HC-OPEN": "개관 시간 밖 배정을 지우거나, 부서 설정의 개관 시간이 실제 운영과 맞는지 확인",
    "HC-CLASS-1": "해당 학생의 가능 시간 안으로 옮기거나, 같은 시간대에 가능한 다른 학생으로 교체 검토",
    "HC-CLASS-6": "학생의 활동 기간(중도 합류·종료)을 확인하고 기간 밖 배정을 지우는 방안 검토",
    "HC-STAFF-1": "초과한 시간대의 배정 하나를 다른 시간대로 옮기는 방안 검토",
    "HC-STAFF-2": "그 시간대에 가능한 학생 추가 배정 검토, 또는 최소 인원 설정 재확인",
    "HC-TIME-1": "상한을 넘은 주의 배정 일부를 다른 학생에게 옮기는 방안 검토",
    "HC-TIME-2": "상한을 넘은 주의 배정 일부를 다른 학생에게 옮기는 방안 검토",
    "HC-TIME-3": "그 달의 다른 배치 근무까지 합산되는 상한이므로, 이번 기간 배정을 줄이는 방안 검토",
    "HC-TIME-4": "2주 창 안의 부서 교비 배정을 줄이거나, 부서 2주 총합 상한 설정 재확인",
    "SC-UNDER-1": "그 시간대에 가능한 미배정 학생이 있는지 확인, 없으면 가능 시간 추가 수합 검토",
    "OVERLAP": "같은 학생의 중복 배정 중 하나를 삭제",
    "BATCH-RANGE": "배치 기간 밖 배정을 삭제하거나, 그 날짜를 포함하는 기간으로 다시 생성",
    "MEMBERSHIP": "그 학생이 이 부서 합격자 명단에 있는지 확인",
    "PROVENANCE": "규정 준수를 보장하려면 솔버로 다시 생성하는 방안 검토",
}

# 페널티 카테고리(= Constraint 클래스의 name) → (SPEC의 SC ID, 설명)
_SOFT_LABELS = {
    "understaffing": ("SC-UNDER-1", "최소 인원 미달"),
    "preferred_staffing": ("SC-STAFF-1/2", "시간대별 선호 인원 미달"),
    "preference_match": ("SC-PREF-1", "희망하지 않은 시간대 배정"),
    "contiguity": ("SC-CONT-1", "조각 근무 — 연속 근무 선호 위배"),
    "meal_break": ("SC-MEAL-1/2", "식사 시간 미확보"),
    "morning_rules": ("SC-MORN-1/2/3", "아침 근무 규칙 — 마감 다음 날·주당 일수·연속 일수"),
    "exam_proximity": ("SC-EXAM-1", "시험 시작 전 버퍼 침범"),
    "avoid_range": ("SC-AVOID-1", "피하고 싶다고 낸 시간대 배정"),
    "fair_hours": ("SC-FAIR-1", "근무 시간 공평 배분 미달"),
    "non_campus_day": ("SC-COMMUTE-1", "등교하지 않는 요일 배정"),
}

# 프롬프트에 넣는 페널티 이벤트 상세 — 카테고리마다 비싼 순으로 이만큼만.
# 전부 넣으면 슬롯 수만큼 늘어나 프롬프트가 배정 결과보다 커진다.
_SOFT_EVENTS_PER_CATEGORY = 3
# 규정 위반 finding의 evidence에 나열할 최대 건수 (나머지는 "외 N건")
_EVIDENCE_LIMIT = 5

# findings 정렬 기준 — 심각한 것부터 위로
_SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


def _hard_constraint_check(db: Session, batch_id: int) -> Optional[dict]:
    """verify.verify_batch로 규정 제약을 결정적으로 채점한다 (#242).

    정책 파일·캘린더 로딩이 실패할 수 있어(부서 정책 미등록 등) 여기서 검토
    전체를 막지 않는다 — 조용한 실패 원칙대로 이 절만 비우고 자연어 규칙 검토는
    그대로 진행한다.
    """
    try:
        return verify.verify_batch(db, batch_id)
    except Exception:
        logger.warning(
            "batch %s 규정 제약 검증 실패 — 이 절을 비우고 검토는 계속한다",
            batch_id,
            exc_info=True,
        )
        return None


def _violation_where(violation: dict) -> str:
    """위반 1건의 '누구·언제·몇 시' — 날짜에는 요일을 붙인다(프롬프트 규칙과 동일)."""
    parts = []
    if violation.get("student_id"):
        parts.append(violation["student_id"])
    if violation.get("date"):
        parts.append(_format_date(date.fromisoformat(violation["date"])))
    if violation.get("start_time") and violation.get("end_time"):
        parts.append(f"{violation['start_time']}-{violation['end_time']}")
    return " ".join(parts)


def _hard_check_section(hard_check: Optional[dict]) -> str:
    if hard_check is None:
        return "(확인 불가 — 이번 검토에서는 규정 제약을 채점하지 못했다. 위반이 없다는 뜻은 아니다)"

    violations = hard_check.get("violations", [])
    lines = []
    if violations:
        for v in violations:
            where = _violation_where(v)
            label = _HARD_RULE_LABELS.get(v["rule"], v["rule"])
            lines.append(
                f"- [{v['severity']}] {v['rule']}({label}) "
                f"{where + ' — ' if where else ''}{v['message']}"
            )
    else:
        lines.append("- 위반 없음 (개관 시간·가용 시간·활동 기간·배정 인원·근로 시간 상한)")

    coverage = hard_check.get("coverage") or {}
    ratio = coverage.get("staffed_ratio")
    if ratio is not None:
        lines.append(
            f"- (참고) 개관 슬롯 중 최소 인원을 채운 비율 {ratio:.0%} "
            f"({coverage.get('staffed_slots')}/{coverage.get('open_slots')} 슬롯)"
        )
    return "\n".join(lines)


def _student_capacity_section(hard_check: Optional[dict]) -> str:
    """학생별 '가능 시간 대비 배정 시간' — verify가 계산한 값을 그대로 옮긴다.

    "가능 시간이 많은 학생은 상한을 채우고, 적은 학생은 덜 채워도 된다"류의
    공정성 규칙은 배정 시간만으로는 판정할 수 없다. 프롬프트에 배정 결과만
    들어가 있던 동안 모델은 이런 규칙을 "가용 시간 데이터가 없어 확인 불가"로
    돌려보냈다 — 산술은 서버가 끝내고(_student_hours_section과 같은 원칙),
    모델은 규칙 해석만 하게 한다.
    """
    if hard_check is None:
        return "(확인 불가 — 이번 검토에서는 가능 시간을 채점하지 못했다)"
    rows = hard_check.get("student_capacity") or []
    if not rows:
        return "(가능 시간 데이터 없음 — 이 기준으로는 판단하지 마라)"

    lines = []
    for row in rows:
        lines.append(f"- {row['student_id']}")
        for week in row["weeks"]:
            monday = date.fromisoformat(week["week_start"])
            ratio = week["fill_ratio"]
            ratio_note = f" (목표의 {ratio:.0%})" if ratio is not None else ""
            lines.append(
                f"  - 주({monday.isoformat()}~{(monday + timedelta(days=6)).isoformat()}) "
                f"가능 {week['available_hours']:g}시간 / 주 상한 {week['cap_hours']:g}시간 "
                f"→ 목표 {week['target_hours']:g}시간, "
                f"배정 {week['assigned_hours']:g}시간{ratio_note}"
            )
    return "\n".join(lines)


def _violation_findings(violations: list[dict]) -> list[dict]:
    """규정 위반을 검토 finding으로 옮긴다 — 같은 규칙은 한 건으로 묶는다.

    프롬프트가 AI에게 요구하는 형식("같은 규칙의 위반은 하나의 finding에 evidence로
    모아라")을 서버가 만드는 finding도 그대로 지킨다.
    """
    grouped: dict[str, list[dict]] = {}
    for v in violations:
        grouped.setdefault(v["rule"], []).append(v)

    findings = []
    for rule, items in grouped.items():
        label = _HARD_RULE_LABELS.get(rule, rule)
        # 같은 규칙이라도 상한 초과처럼 건마다 수치가 다른 메시지가 있다. 메시지가
        # 하나뿐이면(개관 밖 배정 등) evidence에 같은 문장을 반복하지 않는다.
        varies = len({v["message"] for v in items}) > 1
        shown = [
            (f"{where} — {v['message']}" if varies else where)
            if (where := _violation_where(v))
            else v["message"]
            for v in items[:_EVIDENCE_LIMIT]
        ]
        if len(items) > _EVIDENCE_LIMIT:
            shown.append(f"외 {len(items) - _EVIDENCE_LIMIT}건")
        findings.append(
            {
                # critical과 warning이 섞이면 더 무거운 쪽으로 묶는다
                "severity": "critical"
                if any(v["severity"] == "critical" for v in items)
                else "warning",
                "rule": f"규정 제약 {rule} ({label})",
                "evidence": "; ".join(shown),
                "message": items[0]["message"]
                if len(items) == 1
                else f"{label} {len(items)}건이 확인됩니다.",
                "suggestion": _HARD_RULE_SUGGESTIONS.get(rule),
                "source": "system",
            }
        )
    return findings


def _soft_penalty_rows(
    batch: "models.ScheduleBatch",
) -> list[tuple[str, int, list[dict]]]:
    """(카테고리, 총 페널티, 이벤트 목록) — 페널티가 큰 순.

    생성 시점 solver_summary의 값이다. draft를 손으로 고쳐도 갱신되지 않으므로
    (draft/edits는 solver_summary를 건드리지 않는다) 프롬프트에서 그 한계를 밝힌다.
    """
    summary = batch.solver_summary or {}
    breakdown = summary.get("penalty_summary") or {}
    events_by_name: dict[str, list[dict]] = {}
    for ev in summary.get("penalty_events") or []:
        events_by_name.setdefault(ev.get("name"), []).append(ev)
    return [
        (name, total, sorted(events_by_name.get(name, []), key=lambda e: -e.get("cost", 0)))
        for name, total in sorted(breakdown.items(), key=lambda kv: -kv[1])
        if total
    ]


def _soft_event_label(event: dict) -> str:
    parts = []
    if event.get("student_id"):
        parts.append(event["student_id"])
    if event.get("day"):
        parts.append(_format_date(date.fromisoformat(event["day"])))
    if event.get("minute") is not None:
        parts.append(f"{event['minute'] // 60:02d}:{event['minute'] % 60:02d}")
    where = " ".join(parts) or "대상 미상"
    return f"{where} (비용 {event.get('cost')})"


def _soft_penalty_section(
    rows: Optional[list[tuple[str, int, list[dict]]]],
    policy: Optional["models.DepartmentPolicy"] = None,
) -> str:
    scales = (policy.soft_weight_scales if policy else None) or {}
    lines = []
    for name, total, events in rows or []:
        sc_id, label = _SOFT_LABELS.get(name, (name, name))
        scale = scales.get(name)
        scale_note = f", 부서 중요도 배율 {scale:g}배" if scale is not None else ""
        # 이벤트 상세가 없는 옛 배치(penalty_events 이전)는 건수를 적지 않는다 —
        # 총 페널티만 있는데 "0건"이라고 쓰면 없던 사실이 생긴다
        count_note = f", {len(events)}건" if events else ""
        lines.append(f"- {sc_id} {label}: 총 페널티 {total}{count_note}{scale_note}")
        for event in events[:_SOFT_EVENTS_PER_CATEGORY]:
            lines.append(f"  - {_soft_event_label(event)}")
    if not lines:
        lines.append("(집계 없음 — 솔버가 생성한 배치가 아니거나 페널티가 발생하지 않았다)")

    disabled = [
        f"{_SOFT_LABELS.get(name, (name, name))[1]}({name})"
        for name, scale in scales.items()
        if scale == 0
    ]
    if disabled:
        lines.append(
            "- 부서가 꺼 둔(중요도 0) 제약: " + ", ".join(disabled)
            + " — 이 항목은 지키지 않아도 부서의 결정이므로 지적하지 마라."
        )
    return "\n".join(lines)


def _build_prompt(
    batch: "models.ScheduleBatch",
    custom_rules: str,
    work_schedules: list["models.WorkSchedule"],
    policy: Optional["models.DepartmentPolicy"] = None,
    tenure_by_student_id: Optional[dict] = None,
    unassigned_candidates: Optional[list[dict]] = None,
    clarification_answers: Optional[dict] = None,
    student_notes: Optional[list[tuple[str, str, str]]] = None,
    hard_check: Optional[dict] = None,
    soft_penalties: Optional[list[tuple[str, int, list[dict]]]] = None,
) -> str:
    summary = batch.solver_summary or {}
    tenure_by_student_id = tenure_by_student_id or {}
    unassigned_candidates = unassigned_candidates or []
    clarification_answers = clarification_answers or {}
    student_notes = student_notes or []
    per_student = [
        {**s, "tenure_start_date": _tenure_label(tenure_by_student_id.get(s.get("student_id")))}
        for s in summary.get("per_student", [])
    ]

    # 날짜별로 묶고 요일을 표기한다 — 요일 규칙("일요일 금지")과 동시 근무
    # 규칙("오전엔 2명")을 날짜 단위로 대조하기 쉽게.
    by_date: dict = {}
    for ws in sorted(work_schedules, key=lambda w: (w.work_date, w.start_time)):
        by_date.setdefault(ws.work_date, []).append(ws)
    schedule_lines = "\n".join(
        line
        for d, rows in by_date.items()
        for line in (
            [f"- {_format_date(d)}"]
            + [
                f"  - {ws.start_time.strftime('%H:%M')}-{ws.end_time.strftime('%H:%M')} "
                f"{ws.student_id}"
                for ws in rows
            ]
        )
    )
    return f"""\
## 부서 운영 규칙 (원문)
{custom_rules or "(등록된 부서 규칙 없음)"}

## 학생이 낸 특이사항 (원문)
(학생 본인이 자유롭게 적은 사정이다. 부서 운영 규칙과 달리 **지켜야 할 규칙이 아니라
참고할 사정**이며, 부서 규칙과 부딪히면 부서 규칙이 우선한다. 문장이 모호해 판단이
갈리면 단정하지 말고 되묻기로 돌려라.)
{_student_notes_section(student_notes)}

## 부서 운영 정보
(부서 ID: {batch.department_id} — department 대상 되묻기의 target_id로 이 값을 그대로 쓴다)
{_policy_section(policy)}

## 근무표 기간
{_format_date(batch.period_start)} ~ {_format_date(batch.period_end)}

## 배정 결과 ({len(work_schedules)}건, 날짜별)
{schedule_lines or "(배정 없음)"}

## 부족 슬롯(shortages)
{json.dumps(summary.get("shortages", []), ensure_ascii=False)}

## 규정 제약 검증 결과 (Hard Constraint — 서버가 결정적으로 채점한 값)
(SCHEDULER_SPEC 3장의 규정 제약을 솔버와 같은 정책·캘린더·가용시간으로 서버가 직접
채점한 결과다. **이미 확정된 사실**이므로 다시 계산하거나 뒤집지 말고, 여기 있는 위반을
findings에 다시 적지도 마라 — 시스템이 그대로 검토 결과에 붙인다. 부서 규칙·학생
특이사항을 판단할 때 배경으로 쓰고, summary에는 몇 건인지만 한 문장으로 언급하라.)
{_hard_check_section(hard_check)}

## 소프트 제약(선호) 페널티 (생성 시점 솔버 집계)
(솔버가 배정을 고를 때 매긴 '선호 위반 비용'이다. 규정 위반이 아니라 **비용**이므로 이
수치만으로 critical을 만들지 마라. 부서 규칙·학생 특이사항과 이어지는 경우에만
warning/info로 다뤄라. 중요도 배율은 부서 담당자가 정한 값이고, 배치를 생성한 뒤 손으로
고친 배정은 이 집계에 반영되어 있지 않다.)
{_soft_penalty_section(soft_penalties, policy)}

## 학생별 근무시간 집계(per_student — 근무표 기간 {_format_date(batch.period_start)}~{_format_date(batch.period_end)} 전체 합계)
{json.dumps(per_student, ensure_ascii=False)}

## 학생별 일자별·주별 근무시간 (배정 결과에서 계산한 값)
("하루 N시간"·"주당 N시간" 규칙은 위 per_student 기간 합계가 아니라 이 값으로 판단하세요.
주는 월요일~일요일 기준이며, 근무가 없는 날은 생략했습니다.)
{_student_hours_section(work_schedules)}

## 학생별 가능 시간 대비 배정 시간 (서버가 계산한 값)
("가능"은 학생이 낸 근무 가능 시간 중 개관 시간·수업·근무 불가일·활동 기간 밖을 걸러낸,
이 기간에 실제로 배정할 수 있었던 시간이다. "목표"는 주간 근로 상한과 가능 시간 중 **작은
쪽** — 가능 시간이 상한보다 적은 학생은 상한을 채울 방법이 애초에 없다. "가능 시간 대비
공평하게", "가능 시간이 많은 학생은 상한까지" 같은 규칙은 배정 시간의 절대값이 아니라 이
목표 대비 충족률로 학생끼리 비교해 판단하라. 주는 월요일~일요일 기준이고, 근무표 기간에
걸친 부분만 센 값이라 첫 주·마지막 주는 가능 시간이 짧게 나올 수 있다.)
{_student_capacity_section(hard_check)}

## 미배정 가능 인원
(이 부서 소속이며 이번 배치에는 배정되지 않은 학생 — 근속 정보가 있는 경우만.
"경력자 배치"류 규칙 판단 시 배정된 학생과의 상대 비교 대상으로만 참고)
{_unassigned_section(unassigned_candidates)}

## 확인된 정보
(담당 직원이 과거 되묻기에 답변한 학생/부서의 사실 정보. 여기 있는 대상·필드는
다시 되묻지 말고 판단에 사용하라)
{_confirmed_info_section(clarification_answers)}

## 확인된 규칙 해석
(담당 직원이 과거 되묻기에 답변한 규칙 문구 해석. 다시 되묻지 말고 판단에 사용하라)
{_confirmed_rule_interpretation_section(clarification_answers)}

위 정보를 바탕으로 부서 운영 규칙 기준에서 이 배정 초안을 검토하세요."""


def _get_gemini_client() -> Optional[genai.Client]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _call_gemini(contents: str) -> ReviewResult:
    global LAST_USAGE
    LAST_USAGE = None
    client = _get_gemini_client()
    if client is None:
        raise ReviewUnavailable("not_configured")

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=ReviewResult,
    )
    try:
        response = client.models.generate_content(
            model=MODEL, contents=contents, config=config
        )
    except errors.APIError as e:
        if e.code != 429:
            logger.error("Gemini 검토 호출 실패: %s", e)
            raise ReviewUnavailable("ai_error") from e
        logger.warning("429 사용량 제한 — %.0f초 대기 후 재시도", RATE_LIMIT_RETRY_DELAY)
        time.sleep(RATE_LIMIT_RETRY_DELAY)
        try:
            response = client.models.generate_content(
                model=MODEL, contents=contents, config=config
            )
        except errors.APIError as e2:
            logger.error("Gemini 검토 재시도 실패: %s", e2)
            raise ReviewUnavailable("ai_error") from e2

    usage = getattr(response, "usage_metadata", None)
    if usage is not None:
        LAST_USAGE = {
            "input_tokens": getattr(usage, "prompt_token_count", None),
            "output_tokens": getattr(usage, "candidates_token_count", None),
            "total_tokens": getattr(usage, "total_token_count", None),
        }

    try:
        return response.parsed or ReviewResult.model_validate_json(response.text)
    except Exception as e:
        logger.error("Gemini 응답 파싱 실패: %s", e)
        raise ReviewUnavailable("ai_error") from e
