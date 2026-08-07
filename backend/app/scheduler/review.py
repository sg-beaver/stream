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
from typing import Literal, Optional

from google import genai
from google.genai import errors, types
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)

MODEL = os.getenv("REVIEW_MODEL", "gemini-3.5-flash")
RATE_LIMIT_RETRY_DELAY = float(os.getenv("REVIEW_RETRY_DELAY", "40.0"))

SYSTEM_PROMPT = """\
당신은 대학 근로 근무표 초안을 검토하는 보조자입니다. 근무표를 확정할 권한은
없으며, 담당 직원이 스스로 판단할 수 있도록 검토 의견만 제시합니다.

규칙:
- 부서가 정한 운영 규칙(원문)을 기준으로 배정 초안을 점검합니다.
- 규칙과 어긋나거나 우려되는 지점을 찾으면 findings에 담습니다. 문제가 없으면
  findings를 빈 배열로 둡니다.
- "확정하세요", "이대로 진행하세요" 같은 지시적 표현은 쓰지 않습니다. 어디까지나
  검토 의견이며 최종 판단은 담당 직원의 몫입니다.
- 학생의 신입/경력 여부, 근속 기간 등 데이터로 직접 확인할 수 없는 속성은
  student_id(학번)나 다른 필드로부터 추측하지 마라. 규칙이 이런 속성을
  언급하는데 판단할 근거 데이터가 없으면, 해당 규칙에 대해서는 finding을
  생성하지 말고 summary에서 몇 건인지와 함께 어떤 규칙인지(원문 또는 핵심
  키워드)를 구체적으로 밝혀라. 예: "학생 신입/경력 여부 판단 근거 데이터
  부족으로 '금요일 마감 시간대엔 경험자가 최소 1명 있어야 한다'와
  '시험기간 전 주에는 신입을 혼자 배치하지 않는다'는 확인이 불가능합니다."
  처럼 확인 불가로 처리한 규칙을 두루뭉술하게 뭉뚱그리지 말고 각각 짚어라.
- summary는 전체 총평을 1~2문장으로 씁니다."""


class ReviewFinding(BaseModel):
    severity: Literal["warning", "info"]
    rule: Optional[str] = None
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
        return {"batch_id": batch_id, "review_available": False, "reason": "no_rules"}

    work_schedules = (
        db.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == batch_id)
        .all()
    )
    contents = _build_prompt(batch, custom_rules, work_schedules)

    try:
        result = _call_gemini(contents)
    except ReviewUnavailable as exc:
        return {"batch_id": batch_id, "review_available": False, "reason": exc.reason}

    return {
        "batch_id": batch_id,
        "review_available": True,
        "review": result.model_dump(),
    }


def _build_prompt(
    batch: "models.ScheduleBatch",
    custom_rules: str,
    work_schedules: list["models.WorkSchedule"],
) -> str:
    summary = batch.solver_summary or {}
    schedule_lines = "\n".join(
        f"- {ws.work_date.isoformat()} {ws.student_id} "
        f"{ws.start_time.strftime('%H:%M')}-{ws.end_time.strftime('%H:%M')}"
        for ws in sorted(work_schedules, key=lambda w: (w.work_date, w.start_time))
    )
    return f"""\
## 부서 운영 규칙 (원문)
{custom_rules}

## 근무표 기간
{batch.period_start} ~ {batch.period_end}

## 배정 결과 ({len(work_schedules)}건)
{schedule_lines or "(배정 없음)"}

## 부족 슬롯(shortages)
{json.dumps(summary.get("shortages", []), ensure_ascii=False)}

## 학생별 근무시간 집계(per_student)
{json.dumps(summary.get("per_student", []), ensure_ascii=False)}

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
