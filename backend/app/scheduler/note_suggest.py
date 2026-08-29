"""학생 자연어 특이사항 → 슬롯 선호도 제안 (Gemini, #185).

학생이 낸 문장(`student_note`)에서 "이 시간은 피하고 싶다 / 이 시간이 좋다"에
해당하는 부분만 골라 슬롯 선호도(`available_time.preference` 1·3) 후보로 돌려준다.

**저장하지 않는다.** 제안까지가 이 모듈의 일이고, 반영은 학생이 화면에서 확인한 뒤
`PUT /api/availability/me`(slot_preferences)로 직접 보낸다. 잘못 읽은 문장이 배정에
바로 들어가면 학생도 담당자도 원인을 추적할 수 없다 — 부서 자연어 규칙을 솔버에
직접 넣지 않는 것과 같은 원칙이다.

Gemini 클라이언트·모델·재시도는 review.py 것을 재사용하고, 프롬프트와 응답 스키마만
따로 둔다 (substitute_check.py와 같은 방식).
"""

import logging
import time
from pathlib import Path
from typing import Literal, Optional

from google.genai import errors, types
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.scheduler import deidentify
from app.scheduler.review import (
    MODEL,
    RATE_LIMIT_RETRY_DELAY,
    ReviewUnavailable,
    _get_gemini_client,
)
from app.services import (
    FINE_SLOT_MINUTES,
    intervals_to_slots,
    resolve_term_for_student,
    student_department_id,
    term_filter,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    Path(__file__).with_name("note_suggest_system_prompt.md").read_text(encoding="utf-8")
)

_DAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"]


# AI가 돌려주는 라벨 → DB 선호도 값(available_time.preference).
# Gemini의 response_schema는 **정수 enum을 받지 못한다**(Literal[1, 3]을 주면
# "Input should be a valid string"으로 요청 자체가 실패). 숫자를 문자열로
# 받기보다 의미가 드러나는 라벨로 받고 여기서 옮긴다 — 모델에게도 1/3보다
# "avoid/prefer"가 덜 헷갈린다.
PREFERENCE_BY_LABEL = {"avoid": 1, "prefer": 3}


class SlotPreferenceSuggestion(BaseModel):
    """슬롯 묶음 하나에 대한 선호도 제안 (AI 응답 형태)."""

    # "요일-HH:MM" 슬롯 키 목록 — 학생이 이미 가능하다고 낸 슬롯 중에서만
    slots: list[str]
    # avoid=가능하지만 피하고 싶음 / prefer=이 시간이면 좋겠음.
    # "그냥 가능"(2)은 기본값이라 제안 대상이 아니다
    preference: Literal["avoid", "prefer"]
    # 근거가 된 원문 문장 (그대로 인용)
    quote: str
    # 왜 이렇게 읽었는지 한 문장 — 학생이 맞는지 판단할 수 있어야 한다
    reason: str


class UnstructuredSentence(BaseModel):
    """슬롯으로 옮길 수 없어 문장 그대로 남는 부분."""

    quote: str
    reason: str


class NoteSuggestResult(BaseModel):
    suggestions: list[SlotPreferenceSuggestion] = []
    unstructured: list[UnstructuredSentence] = []


def suggest_from_note(
    db: Session,
    student_id: str,
    content: Optional[str] = None,
    term: Optional[str] = None,
) -> dict:
    """특이사항 문장을 슬롯 선호도 제안으로 바꾼다 (저장하지 않는다).

    content를 주면 그 문장을, 없으면 저장된 특이사항을 읽는다 — 화면이 저장 전
    초안 상태로도 미리 볼 수 있게.
    """
    resolved = resolve_term_for_student(db, student_id, term)

    text = (content or "").strip()
    if not text:
        row = (
            db.query(models.StudentNote)
            .filter(
                models.StudentNote.student_id == student_id,
                term_filter(models.StudentNote.term, resolved),
            )
            .first()
        )
        text = (row.content or "").strip() if row else ""
    if not text:
        return {"suggest_available": False, "reason": "no_note", "term": resolved}

    rows = (
        db.query(models.AvailableTime)
        .filter(
            models.AvailableTime.student_id == student_id,
            term_filter(models.AvailableTime.term, resolved),
        )
        .all()
    )
    available_slots = sorted(
        set(intervals_to_slots(rows, slot_minutes=FINE_SLOT_MINUTES)), key=_slot_key
    )
    if not available_slots:
        # 선호도는 가능 시간 위에만 붙는다 — 붙일 슬롯이 없으면 제안할 것도 없다
        return {"suggest_available": False, "reason": "no_availability", "term": resolved}

    # 특이사항은 학생이 자유롭게 쓴 문장이라 연락처·가족 사정·다른 학생 이름이
    # 그대로 들어온다 (#200). 문장을 통째로 외부 모델에 넘기는 유일한 경로이므로
    # 여기서 가장 강하게 가린다 — 연락처류는 별칭도 주지 않고 지운다.
    deid = _build_deidentifier(db, student_id)
    started = time.monotonic()
    try:
        result = _call_gemini_suggest(
            _build_prompt(deid.mask(text), available_slots, rows)
        )
    except ReviewUnavailable as exc:
        logger.info("학생 %s 특이사항 제안 불가 — reason=%s", student_id, exc.reason)
        return {"suggest_available": False, "reason": exc.reason, "term": resolved}

    suggestions = _sanitize(result.suggestions, set(available_slots), student_id)
    logger.info(
        "학생 %s 특이사항 제안 완료 — model=%s 제안 %d건 (원본 %d건) 미구조화 %d건 %.1fs",
        student_id,
        MODEL,
        len(suggestions),
        len(result.suggestions),
        len(result.unstructured),
        time.monotonic() - started,
    )
    # quote는 "학생이 쓴 문장 그대로"가 계약이다. 이름을 되돌려 원문과 맞춘다
    # — 다만 연락처·이메일은 지워서 보냈으므로 그 자리는 삭제 표시로 남는다.
    return {
        "suggest_available": True,
        "term": resolved,
        "suggestions": [
            {
                **sug,
                "quote": deid.restore(sug["quote"], style="name"),
                "reason": deid.restore(sug["reason"], style="name"),
            }
            for sug in suggestions
        ],
        "unstructured": [
            {
                "quote": deid.restore(u.quote, style="name"),
                "reason": deid.restore(u.reason, style="name"),
            }
            for u in result.unstructured
        ],
    }


def _build_deidentifier(db: Session, student_id: str):
    """본인 + 같은 부서 학생 이름을 별칭으로 바꿀 매핑 (#200).

    부서를 함께 넣는 이유는 특이사항에 같이 일하는 학생 이름이 나오기 때문이다
    ("OO이랑 같은 시간 피하고 싶어요"). 아직 부서가 없으면 본인만 넣는다.
    """
    department_id = student_department_id(db, student_id)
    deid = (
        deidentify.build_for_department(db, department_id)
        if department_id is not None
        else deidentify.build_for_students([])
    )
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == student_id)
        .first()
    )
    if student is not None:
        deid.add(student.student_id, student.name)
    return deid


def _slot_key(slot: str) -> tuple[int, str]:
    day, _, time_str = slot.partition("-")
    order = _DAY_ORDER.index(day) if day in _DAY_ORDER else len(_DAY_ORDER)
    return (order, time_str)


def _sanitize(
    suggestions: list[SlotPreferenceSuggestion],
    allowed: set[str],
    student_id: str,
) -> list[dict]:
    """AI가 돌려준 슬롯을 학생이 실제로 낸 슬롯으로 잘라낸다.

    프롬프트로 "목록에 있는 키만 쓰라"고 지시하지만 지시만으로는 보장되지 않는다
    (review의 rule_interpretation에서 겪은 것과 같은 문제). 목록 밖 슬롯이 그대로
    화면에 뜨면 학생이 확인 버튼을 눌러도 저장에서 422로 튕긴다.

    같은 슬롯에 두 제안이 겹치면 **먼저 온 제안이 이긴다** — 상충하는 두 값을
    화면이 동시에 보여줄 수 없고, 뒤엣것을 임의로 고르면 근거(quote)와 어긋난다.
    """
    seen: set[str] = set()
    cleaned: list[dict] = []
    for suggestion in suggestions:
        slots = [s for s in dict.fromkeys(suggestion.slots) if s in allowed]
        dropped = len(suggestion.slots) - len(slots)
        slots = [s for s in slots if s not in seen]
        if not slots:
            logger.info(
                "학생 %s 제안 버림 — 유효 슬롯 없음 (quote=%r)", student_id, suggestion.quote
            )
            continue
        if dropped:
            logger.info(
                "학생 %s 제안에서 가능 시간 밖 슬롯 %d개 제거 (quote=%r)",
                student_id,
                dropped,
                suggestion.quote,
            )
        seen.update(slots)
        cleaned.append(
            {
                "slots": sorted(slots, key=_slot_key),
                "preference": PREFERENCE_BY_LABEL[suggestion.preference],
                "quote": suggestion.quote,
                "reason": suggestion.reason,
            }
        )
    return cleaned


def _availability_section(rows: list["models.AvailableTime"]) -> str:
    """요일별 가능 구간 요약 — 슬롯 키 140개를 훑는 것보다 문장과 대조하기 쉽다."""
    by_day: dict[int, list[str]] = {}
    for row in rows:
        if row.start_time is None or row.end_time is None:
            continue
        by_day.setdefault(row.day_of_week, []).append(
            f"{row.start_time.strftime('%H:%M')}~{row.end_time.strftime('%H:%M')}"
        )
    lines = []
    for day in sorted(by_day):
        label = _DAY_ORDER[day - 1] if 1 <= day <= 7 else str(day)
        lines.append(f"- {label}: {', '.join(sorted(by_day[day]))}")
    return "\n".join(lines) or "(없음)"


def _build_prompt(content: str, available_slots: list[str], rows: list) -> str:
    return f"""\
## 학생이 낸 특이사항 (원문)
{content}

## 이 학생이 근무 가능하다고 낸 시간 (요일별 요약)
{_availability_section(rows)}

## 쓸 수 있는 슬롯 키 (이 목록 밖의 키는 쓸 수 없다)
{", ".join(available_slots)}

위 문장에서 시간대 선호로 옮길 수 있는 부분만 골라 제안하세요.
옮길 수 없는 부분은 unstructured에 원문 그대로 담으세요."""


def _call_gemini_suggest(contents: str) -> NoteSuggestResult:
    client = _get_gemini_client()
    if client is None:
        raise ReviewUnavailable("not_configured")

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=NoteSuggestResult,
    )
    try:
        response = client.models.generate_content(
            model=MODEL, contents=contents, config=config
        )
    except errors.APIError as e:
        if e.code != 429:
            logger.error("Gemini 특이사항 제안 호출 실패: %s", e)
            raise ReviewUnavailable("ai_error") from e
        logger.warning("429 사용량 제한 — %.0f초 대기 후 재시도", RATE_LIMIT_RETRY_DELAY)
        time.sleep(RATE_LIMIT_RETRY_DELAY)
        try:
            response = client.models.generate_content(
                model=MODEL, contents=contents, config=config
            )
        except errors.APIError as e2:
            logger.error("Gemini 특이사항 제안 재시도 실패: %s", e2)
            raise ReviewUnavailable("ai_error") from e2

    try:
        return response.parsed or NoteSuggestResult.model_validate_json(response.text)
    except Exception as e:
        logger.error("Gemini 특이사항 제안 응답 파싱 실패: %s", e)
        raise ReviewUnavailable("ai_error") from e
