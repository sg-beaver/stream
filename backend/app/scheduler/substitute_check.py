"""대타 승인 전 AI 적합성 검사 (Gemini) — 이미 수락한 대타 후보 1명이 부서
운영 규칙에 적합한지 검토 의견을 제공한다 (설계: docs/대타_ai적합성검사_설계문서.md).

AI는 참고 의견만 제공하고 확정 권한이 없다는 원칙, 되묻기 인프라
(clarification_requests/clarification_answer/`_get_relevant_clarification_answers`)는
review.py 것을 그대로 재사용한다(설계문서 결정 3번). Gemini 클라이언트 초기화
(`_get_gemini_client`)도 review.py 것을 재사용하지만, 프롬프트·응답 스키마·호출
로직은 review.py와 완전히 분리한다(설계문서 6번 — 안정화 전까지는 공통 모듈
추출 보류).

rule_interpretation 답변은 부서 무관하게 전역으로 캐시를 무효화시킴
(review.py의 전역 주입 방식과 일치시킨 설계). rule_interpretation 질문
빈도가 높아지면 이로 인한 불필요한 재계산이 쿼터를 소모할 수 있음 —
review의 rule_interpretation 재현성 문제와 함께 다음 담당자가 같이
검토할 것을 권장.
"""

import json
import logging
import time
from pathlib import Path
from typing import Literal, Optional

from google.genai import errors, types
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app import models
from app.scheduler.review import (
    MODEL,
    RATE_LIMIT_RETRY_DELAY,
    ClarificationRequest,
    ReviewUnavailable,
    WEEKDAY_KO,
    _confirmed_info_section,
    _confirmed_rule_interpretation_section,
    _format_date,
    _get_gemini_client,
    _get_relevant_clarification_answers,
    _policy_section,
    _tenure_label,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    Path(__file__).with_name("substitute_check_system_prompt.md").read_text(encoding="utf-8")
)


class SubstituteCheckFinding(BaseModel):
    severity: Literal["critical", "warning", "info"]
    rule: Optional[str] = None
    evidence: Optional[str] = None
    message: str
    suggestion: Optional[str] = None


class SubstituteCheckResult(BaseModel):
    summary: str
    overall_verdict: Literal["적합", "주의", "판단불가"]
    findings: list[SubstituteCheckFinding] = []
    clarification_requests: list[ClarificationRequest] = []


class RequestNotFound(Exception):
    pass


class RequestNotAccepted(Exception):
    """substitute_id가 없음 — 아직 아무도 수락하지 않아 검사할 대상 학생이 없다."""

    pass


def get_ai_check(db: Session, request_id: int) -> dict:
    request = (
        db.query(models.SubstituteRequest)
        .filter(models.SubstituteRequest.request_id == request_id)
        .first()
    )
    if request is None:
        raise RequestNotFound()
    # status 문자열이 아니라 substitute_id 유무로 판단한다 — "반려"는 한 번도
    # 수락되지 않은 채(대기 → 반려)로도 도달할 수 있어, 그 경우 substitute_id가
    # 없어 검사할 대상 학생이 없다. "수락" 이후의 상태(수락/승인/반려)는 전부
    # substitute_id가 남아 있어 과거 기록 조회 목적으로 검사를 허용한다.
    if request.substitute_id is None:
        raise RequestNotAccepted()

    schedule = request.schedule
    department_id = schedule.department_id

    cached = _get_valid_cache(db, request_id, request.substitute_id, department_id)
    if cached is not None:
        return {
            "request_id": request_id,
            "substitute_student_id": request.substitute_id,
            "overall_verdict": cached.overall_verdict,
            "findings": cached.findings,
            "clarification_requests": cached.clarification_requests,
            "cached": True,
        }

    policy = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
    custom_rules = policy.custom_rules if policy else None
    if not custom_rules:
        logger.info("request %s ai-check 건너뜀 — 부서 운영 규칙 없음", request_id)
        return {
            "request_id": request_id,
            "substitute_student_id": request.substitute_id,
            "ai_check_available": False,
            "reason": "no_rules",
        }

    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == request.substitute_id)
        .first()
    )
    availabilities = (
        db.query(models.AvailableTime)
        .filter(models.AvailableTime.student_id == request.substitute_id)
        .all()
    )
    clarification_answers = _get_relevant_clarification_answers(
        db, department_id, {request.substitute_id}
    )

    contents = _build_check_prompt(
        request, schedule, custom_rules, policy, student, availabilities, clarification_answers
    )

    started = time.monotonic()
    try:
        result = _call_gemini_check(contents)
    except ReviewUnavailable as exc:
        logger.info("request %s ai-check 불가 — reason=%s", request_id, exc.reason)
        return {
            "request_id": request_id,
            "substitute_student_id": request.substitute_id,
            "ai_check_available": False,
            "reason": exc.reason,
        }

    # verdict 강제 규칙 이중 검증 (설계문서 5번 섹션) — 프롬프트 지시만으로는
    # 100% 보장이 안 되므로 서버 코드에서 재확인한다. review에서 겪은
    # rule_interpretation 재현성 문제(AI가 지시를 항상 지키지는 않음)에 대한
    # 방어적 조치.
    if result.clarification_requests and result.overall_verdict != "판단불가":
        logger.warning(
            "request %s — AI가 clarification_requests와 함께 overall_verdict=%s를 "
            "반환해 서버에서 판단불가로 강제 수정함",
            request_id,
            result.overall_verdict,
        )
        result.overall_verdict = "판단불가"

    logger.info(
        "request %s ai-check 완료 — model=%s verdict=%s findings=%d clarification_requests=%d %.1fs",
        request_id,
        MODEL,
        result.overall_verdict,
        len(result.findings),
        len(result.clarification_requests),
        time.monotonic() - started,
    )

    _save_cache(db, request_id, request.substitute_id, result)

    return {
        "request_id": request_id,
        "substitute_student_id": request.substitute_id,
        "overall_verdict": result.overall_verdict,
        "findings": [f.model_dump() for f in result.findings],
        "clarification_requests": [c.model_dump() for c in result.clarification_requests],
        "cached": False,
    }


def _get_valid_cache(
    db: Session, request_id: int, substitute_student_id: str, department_id: int
) -> Optional["models.SubstituteAiCheckCache"]:
    cache = (
        db.query(models.SubstituteAiCheckCache)
        .filter(
            models.SubstituteAiCheckCache.request_id == request_id,
            models.SubstituteAiCheckCache.substitute_student_id == substitute_student_id,
        )
        .first()
    )
    if cache is None:
        return None

    # 무효화 조건 (설계문서 3번 섹션 확장) — 이 캐시가 조립한 프롬프트에 실제로
    # 들어가는 clarification_answer 종류 전부(target_type 무관)를 대상으로,
    # 캐시 계산 시각 이후 추가된 게 있으면 무효화한다. 어떤 답변이 "이 캐시와
    # 관련 있는지"는 _get_relevant_clarification_answers()가 이 department_id·
    # student_id로 실제 조회하는 범위와 정확히 일치시킨다:
    #   - student: target_id가 이 대타 학생 본인
    #   - department: target_id가 이 요청이 속한 부서
    #   - rule_interpretation: target_id 개념이 없어 전부 조회하는 방식이라
    #     (review.py와 동일 원칙 — #79 설계문서 5번 섹션), 새 rule_interpretation
    #     답변은 부서와 무관하게 모든 ai-check 캐시에 영향을 준다. 이 함수는
    #     캐시 1건의 유효성만 그때그때(지연) 판단하므로, 다른 부서의 캐시까지
    #     일괄 무효화하는 별도 배치 작업은 필요 없다 — 그 캐시들도 각자 조회될
    #     때 이 조건으로 똑같이 재판단된다.
    invalidated = (
        db.query(models.ClarificationAnswer)
        .filter(
            models.ClarificationAnswer.answered_at > cache.computed_at,
            or_(
                and_(
                    models.ClarificationAnswer.target_type == "student",
                    models.ClarificationAnswer.target_id == substitute_student_id,
                ),
                and_(
                    models.ClarificationAnswer.target_type == "department",
                    models.ClarificationAnswer.target_id == str(department_id),
                ),
                models.ClarificationAnswer.target_type == "rule_interpretation",
            ),
        )
        .first()
        is not None
    )
    if invalidated:
        return None
    return cache


def _save_cache(
    db: Session, request_id: int, substitute_student_id: str, result: "SubstituteCheckResult"
) -> None:
    cache = (
        db.query(models.SubstituteAiCheckCache)
        .filter(models.SubstituteAiCheckCache.request_id == request_id)
        .first()
    )
    findings_dump = [f.model_dump() for f in result.findings]
    clarifications_dump = [c.model_dump() for c in result.clarification_requests]
    if cache is None:
        cache = models.SubstituteAiCheckCache(
            request_id=request_id,
            substitute_student_id=substitute_student_id,
            overall_verdict=result.overall_verdict,
            findings=findings_dump,
            clarification_requests=clarifications_dump,
        )
        db.add(cache)
    else:
        # 요청당 최신 결과 1건만 의미가 있어 덮어쓴다 — 이력 보존 대상이 아니다.
        cache.substitute_student_id = substitute_student_id
        cache.overall_verdict = result.overall_verdict
        cache.findings = findings_dump
        cache.clarification_requests = clarifications_dump
        cache.computed_at = func.now()  # 재계산 시각으로 갱신 (server_default는 INSERT에만 적용)
    db.commit()
    db.refresh(cache)


def _availability_section(availabilities: list["models.AvailableTime"]) -> str:
    if not availabilities:
        return "(없음)"
    return ", ".join(
        f"{WEEKDAY_KO[at.day_of_week - 1]} {at.start_time.strftime('%H:%M')}-"
        f"{at.end_time.strftime('%H:%M')}"
        for at in sorted(availabilities, key=lambda a: (a.day_of_week, a.start_time))
    )


def _build_check_prompt(
    request: "models.SubstituteRequest",
    schedule: "models.WorkSchedule",
    custom_rules: str,
    policy: Optional["models.DepartmentPolicy"],
    student: Optional["models.Student"],
    availabilities: list["models.AvailableTime"],
    clarification_answers: dict,
) -> str:
    requester = request.requester
    return f"""\
## 부서 운영 규칙 (원문)
{custom_rules}

## 부서 운영 정보
(부서 ID: {schedule.department_id} — department 대상 되묻기의 target_id로 이 값을 그대로 쓴다)
{_policy_section(policy)}

## 대타 배정 정보
- 원래 근무자: {requester.student_id if requester else request.requester_id} {requester.name if requester else ""}
- 대타 사유: {request.reason or "(사유 없음)"}
- 근무 일시: {_format_date(schedule.work_date)} {schedule.start_time.strftime('%H:%M')}-{schedule.end_time.strftime('%H:%M')}

## 대타 후보 학생 정보
(target_type="student" 되묻기의 target_id로 이 학생의 학번을 그대로 쓴다)
- 학번: {request.substitute_id}
- 이름: {student.name if student else "(정보 없음)"}
- 근속 시작일: {_tenure_label(student.tenure_start_date) if student else "근속 정보 없음"}
- 등록된 가능 시간: {_availability_section(availabilities)}

## 확인된 정보
(담당 직원이 과거 되묻기에 답변한 학생/부서의 사실 정보. 여기 있는 대상·필드는
다시 되묻지 말고 판단에 사용하라)
{_confirmed_info_section(clarification_answers)}

## 확인된 규칙 해석
(담당 직원이 과거 되묻기에 답변한 규칙 문구 해석. 다시 되묻지 말고 판단에 사용하라)
{_confirmed_rule_interpretation_section(clarification_answers)}

위 정보를 바탕으로 부서 운영 규칙 기준에서 이 대타 후보 학생 1명이 적합한지 검토하세요."""


def _call_gemini_check(contents: str) -> SubstituteCheckResult:
    client = _get_gemini_client()
    if client is None:
        raise ReviewUnavailable("not_configured")

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=SubstituteCheckResult,
    )
    try:
        response = client.models.generate_content(
            model=MODEL, contents=contents, config=config
        )
    except errors.APIError as e:
        if e.code != 429:
            logger.error("Gemini ai-check 호출 실패: %s", e)
            raise ReviewUnavailable("ai_error") from e
        logger.warning("429 사용량 제한 — %.0f초 대기 후 재시도", RATE_LIMIT_RETRY_DELAY)
        time.sleep(RATE_LIMIT_RETRY_DELAY)
        try:
            response = client.models.generate_content(
                model=MODEL, contents=contents, config=config
            )
        except errors.APIError as e2:
            logger.error("Gemini ai-check 재시도 실패: %s", e2)
            raise ReviewUnavailable("ai_error") from e2

    try:
        return response.parsed or SubstituteCheckResult.model_validate_json(response.text)
    except Exception as e:
        logger.error("Gemini ai-check 응답 파싱 실패: %s", e)
        raise ReviewUnavailable("ai_error") from e
