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
    if not custom_rules and not student_notes:
        logger.info("batch %s 검토 건너뜀 — 부서 운영 규칙·학생 특이사항 없음", batch_id)
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
    )

    started = time.monotonic()
    try:
        result = _call_gemini(contents)
    except ReviewUnavailable as exc:
        logger.info("batch %s 검토 불가 — reason=%s", batch_id, exc.reason)
        return {"batch_id": batch_id, "review_available": False, "reason": exc.reason}

    severities = [f.severity for f in result.findings]
    logger.info(
        "batch %s 검토 완료 — model=%s findings=%d (critical=%d warning=%d info=%d) "
        "clarification_requests=%d %.1fs",
        batch_id,
        MODEL,
        len(severities),
        severities.count("critical"),
        severities.count("warning"),
        severities.count("info"),
        len(result.clarification_requests),
        time.monotonic() - started,
    )
    return {
        "batch_id": batch_id,
        "review_available": True,
        "review": result.model_dump(),
    }


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


def _build_prompt(
    batch: "models.ScheduleBatch",
    custom_rules: str,
    work_schedules: list["models.WorkSchedule"],
    policy: Optional["models.DepartmentPolicy"] = None,
    tenure_by_student_id: Optional[dict] = None,
    unassigned_candidates: Optional[list[dict]] = None,
    clarification_answers: Optional[dict] = None,
    student_notes: Optional[list[tuple[str, str, str]]] = None,
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

## 학생별 근무시간 집계(per_student — 근무표 기간 {_format_date(batch.period_start)}~{_format_date(batch.period_end)} 전체 합계)
{json.dumps(per_student, ensure_ascii=False)}

## 학생별 일자별·주별 근무시간 (배정 결과에서 계산한 값)
("하루 N시간"·"주당 N시간" 규칙은 위 per_student 기간 합계가 아니라 이 값으로 판단하세요.
주는 월요일~일요일 기준이며, 근무가 없는 날은 생략했습니다.)
{_student_hours_section(work_schedules)}

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
