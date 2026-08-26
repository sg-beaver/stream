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
from pathlib import Path
from typing import Literal, Optional

from google import genai
from google.genai import errors, types
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.services import get_department_student_ids

logger = logging.getLogger(__name__)

MODEL = os.getenv("REVIEW_MODEL", "gemini-3.5-flash")
RATE_LIMIT_RETRY_DELAY = float(os.getenv("REVIEW_RETRY_DELAY", "40.0"))

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


class ReviewResult(BaseModel):
    summary: str
    findings: list[ReviewFinding]


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
    if not custom_rules:
        logger.info("batch %s 검토 건너뜀 — 부서 운영 규칙 없음", batch_id)
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

    contents = _build_prompt(
        batch,
        custom_rules,
        work_schedules,
        policy,
        tenure_by_student_id,
        unassigned_candidates,
    )

    started = time.monotonic()
    try:
        result = _call_gemini(contents)
    except ReviewUnavailable as exc:
        logger.info("batch %s 검토 불가 — reason=%s", batch_id, exc.reason)
        return {"batch_id": batch_id, "review_available": False, "reason": exc.reason}

    severities = [f.severity for f in result.findings]
    logger.info(
        "batch %s 검토 완료 — model=%s findings=%d (critical=%d warning=%d info=%d) %.1fs",
        batch_id,
        MODEL,
        len(severities),
        severities.count("critical"),
        severities.count("warning"),
        severities.count("info"),
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


def _build_prompt(
    batch: "models.ScheduleBatch",
    custom_rules: str,
    work_schedules: list["models.WorkSchedule"],
    policy: Optional["models.DepartmentPolicy"] = None,
    tenure_by_student_id: Optional[dict] = None,
    unassigned_candidates: Optional[list[dict]] = None,
) -> str:
    summary = batch.solver_summary or {}
    tenure_by_student_id = tenure_by_student_id or {}
    unassigned_candidates = unassigned_candidates or []
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
{custom_rules}

## 부서 운영 정보
{_policy_section(policy)}

## 근무표 기간
{_format_date(batch.period_start)} ~ {_format_date(batch.period_end)}

## 배정 결과 ({len(work_schedules)}건, 날짜별)
{schedule_lines or "(배정 없음)"}

## 부족 슬롯(shortages)
{json.dumps(summary.get("shortages", []), ensure_ascii=False)}

## 학생별 근무시간 집계(per_student)
{json.dumps(per_student, ensure_ascii=False)}

## 미배정 가능 인원
(이 부서 소속이며 이번 배치에는 배정되지 않은 학생 — 근속 정보가 있는 경우만.
"경력자 배치"류 규칙 판단 시 배정된 학생과의 상대 비교 대상으로만 참고)
{_unassigned_section(unassigned_candidates)}

위 정보를 바탕으로 부서 운영 규칙 기준에서 이 배정 초안을 검토하세요."""


def _get_gemini_client() -> Optional[genai.Client]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _call_gemini(contents: str) -> ReviewResult:
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

    try:
        return response.parsed or ReviewResult.model_validate_json(response.text)
    except Exception as e:
        logger.error("Gemini 응답 파싱 실패: %s", e)
        raise ReviewUnavailable("ai_error") from e
