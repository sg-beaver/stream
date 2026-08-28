"""시간표 검토 챗봇 — 세션·툴 루프·읽기 툴 (#134).

설계: docs/시간표검토_챗봇_설계문서.md v3. 이 모듈은 읽기 툴 3종과 툴 루프
골격까지만 담당한다 — 쓰기 툴(draft 편집)은 #135, 가중치 조정은 #136에서
이 루프에 얹는다.

기존 review/substitute_check는 구조화 출력(response_schema)을 쓰지만, 챗봇은
이 백엔드 첫 함수 호출(tools=) 사례다. draft 근무표 전체를 프롬프트에 넣지
않고 총계만 주고 세부는 툴로 조회하게 한다 — 컨텍스트 절단으로 모델이
존재하지 않는 schedule_id를 지어내는 문제를 구조적으로 없애기 위해서다
(설계 문서 섹션 0.3).
"""

import datetime
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from google import genai
from google.genai import errors, types
from sqlalchemy.orm import Session

from app import models
from app.services import term_filter

logger = logging.getLogger(__name__)

MODEL = os.getenv("CHAT_MODEL", "gemini-3.5-flash")
RATE_LIMIT_RETRY_DELAY = float(os.getenv("CHAT_RETRY_DELAY", "40.0"))
# 턴당 툴 호출 상한 (결정 17). 읽기 1~2회 + 쓰기 1~3회 상정 — 실측 후 조정.
STEP_BUDGET = int(os.getenv("CHAT_STEP_BUDGET", "5"))
# 컨텍스트에 포함할 최근 대화 메시지 수 (결정 10)
RECENT_MESSAGES = int(os.getenv("CHAT_RECENT_MESSAGES", "10"))

SYSTEM_PROMPT = (Path(__file__).parent / "chat_system_prompt.md").read_text(
    encoding="utf-8"
)

# reporting_html._PENALTY_LABELS와 같은 사람용 이름 — 모델이 카테고리를
# 사용자 말로 풀어 설명할 때 쓴다
PENALTY_LABELS = {
    "understaffing": "인원 미충원",
    "preferred_slot_miss": "선호 시간대 미충족",
    "block_start": "블록 시작 페널티",
    "meal_missed": "식사 시간 미확보",
    "morning_after_close": "마감 다음날 아침 근무",
    "morning_days_excess": "아침 근무 일수 초과",
    "consecutive_morning_excess": "연속 아침 근무 초과",
    "exam_proximity": "시험 기간 근접 근무",
    "avoid_range_slot": "기피 시간대 배정",
    "non_campus_day": "비등교일 근무",
    "fair_hours_shortfall": "시간 배분 불균형",
}


class ChatUnavailable(Exception):
    """LLM 미설정·호출 실패 — 라우터가 조용한 실패로 매핑한다."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


# ---------------------------------------------------------------------------
# 읽기 툴 — solve를 돌리지 않는다. 스텝 예산 안에서 자유 호출 (결정 16의 1층).
# 각 핸들러는 (db, session, args) → JSON 직렬화 가능한 dict를 반환하고,
# 실패는 ValueError로 던진다 — 루프가 사유를 모델에 돌려주고 턴을 계속한다.
# ---------------------------------------------------------------------------


def _tool_find_schedules(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """세션의 현재 draft 배치에서 조건에 맞는 배정을 조회한다."""
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    query = db.query(models.WorkSchedule).filter(
        models.WorkSchedule.batch_id == session.batch_id
    )
    if args.get("student_id"):
        query = query.filter(models.WorkSchedule.student_id == args["student_id"])
    if args.get("work_date"):
        query = query.filter(
            models.WorkSchedule.work_date == datetime.date.fromisoformat(args["work_date"])
        )
    if args.get("date_from"):
        query = query.filter(
            models.WorkSchedule.work_date >= datetime.date.fromisoformat(args["date_from"])
        )
    if args.get("date_to"):
        query = query.filter(
            models.WorkSchedule.work_date <= datetime.date.fromisoformat(args["date_to"])
        )
    rows = query.order_by(
        models.WorkSchedule.work_date, models.WorkSchedule.start_time
    ).all()
    return {
        "count": len(rows),
        "schedules": [
            {
                "schedule_id": r.schedule_id,
                "student_id": r.student_id,
                "work_date": r.work_date.isoformat(),
                "start_time": r.start_time.strftime("%H:%M"),
                "end_time": r.end_time.strftime("%H:%M"),
            }
            for r in rows
        ],
    }


def _tool_explain_penalty(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """그 카테고리의 실제 위반 이벤트(학생·날짜·시각·비용)를 반환한다 (결정 18).

    generate가 solver_summary.penalty_events로 저장한 이벤트를 읽는다 —
    solve를 다시 돌리지 않으므로 싸고 빠르다.
    """
    category = args.get("category", "")
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    batch = (
        db.query(models.ScheduleBatch)
        .filter(models.ScheduleBatch.batch_id == session.batch_id)
        .first()
    )
    summary = (batch.solver_summary or {}) if batch else {}
    events = [
        ev for ev in summary.get("penalty_events", []) if ev.get("name") == category
    ]
    if not events and category not in summary.get("penalty_summary", {}):
        return {
            "category": category,
            "label": PENALTY_LABELS.get(category, category),
            "events": [],
            "note": "이 카테고리의 위반이 현재 근무표에 없습니다.",
        }
    return {
        "category": category,
        "label": PENALTY_LABELS.get(category, category),
        "total_cost": sum(ev.get("cost", 0) for ev in events),
        "events": events,
    }


def _tool_get_student_availability(
    db: Session, session: models.ChatSession, args: dict
) -> dict:
    """그 학생의 근무 가능 시간과 수업 시간표 (세션 기간이 속한 학기 기준).

    세션 부서 소속 학생만 조회할 수 있다 — 다른 툴은 batch_id로 스코프가
    걸리지만 이 툴은 학번 직접 조회라, 부서 검증이 없으면 타부서 학생의
    시간표가 대화로 유출된다 (REQ-SCHED-002/007과 같은 부서 경계).
    """
    from app.services import academic_terms, get_department_student_ids

    student_id = args.get("student_id", "")
    student = (
        db.query(models.Student)
        .filter(models.Student.student_id == student_id)
        .first()
    )
    if student is None:
        raise ValueError(f"학생 {student_id}을(를) 찾을 수 없습니다.")
    if student_id not in get_department_student_ids(db, session.department_id):
        raise ValueError(f"학생 {student_id}은(는) 이 부서 소속이 아닙니다.")

    _, term = academic_terms(session.period_start)
    term_key = term.key if term else None

    def _rows(model):
        return (
            db.query(model)
            .filter(
                model.student_id == student_id,
                term_filter(model.term, term_key),
            )
            .order_by(model.day_of_week, model.start_time)
            .all()
        )

    day_names = {1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일"}
    return {
        "student_id": student_id,
        "term": term_key,
        "available_times": [
            {
                "day": day_names.get(r.day_of_week, str(r.day_of_week)),
                "start_time": r.start_time.strftime("%H:%M"),
                "end_time": r.end_time.strftime("%H:%M"),
                "preference": r.preference,
            }
            for r in _rows(models.AvailableTime)
        ],
        "class_times": [
            {
                "day": day_names.get(r.day_of_week, str(r.day_of_week)),
                "start_time": r.start_time.strftime("%H:%M"),
                "end_time": r.end_time.strftime("%H:%M"),
            }
            for r in _rows(models.ClassTime)
        ],
    }


READ_TOOL_HANDLERS: dict[str, Callable[[Session, models.ChatSession, dict], dict]] = {
    "find_schedules": _tool_find_schedules,
    "explain_penalty": _tool_explain_penalty,
    "get_student_availability": _tool_get_student_availability,
}


# ---------------------------------------------------------------------------
# 쓰기 툴 — draft 배치만 고친다 (#135, 결정 4·5). 검증·적용·역연산 생성은
# 전부 #133의 apply_draft_edit(REQ-SCHED-018 서비스 계층)를 재사용한다.
# 각 핸들러는 (result, inverse)를 반환하고, inverse는 tool_calls에 기록되어
# 턴 되돌리기(revert)가 역순으로 다시 적용한다.
# ---------------------------------------------------------------------------


def _acting_staff(session: models.ChatSession):
    """쓰기 툴의 행위자 — 세션 소유 직원. 라우터가 세션 소유권을 이미 강제하므로
    (schedule_chat._get_own_session), 여기서는 그 직원으로 부서 권한을 검사한다."""
    from app import auth

    return auth.CurrentUser(id=session.staff_id, role="staff")


def _apply_edit_via_service(
    db: Session, session: models.ChatSession, item_kwargs: dict
) -> tuple[dict, dict]:
    """DraftEditItem을 만들어 apply_draft_edit에 위임하고 (result, inverse)를 돌려준다."""
    from app import schemas
    from app.routers.schedule import apply_draft_edit

    item = schemas.DraftEditItem(**item_kwargs)
    applied = apply_draft_edit(db, _acting_staff(session), item)
    result = {
        "ok": True,
        "schedule_id": applied.schedule_id,
        "student_id": applied.student_id,
        "work_date": applied.work_date.isoformat(),
        "start_time": applied.start_time.strftime("%H:%M"),
        "end_time": applied.end_time.strftime("%H:%M"),
    }
    inverse = applied.inverse.model_dump(mode="json", exclude_none=True)
    return result, inverse


def _tool_move_schedule(
    db: Session, session: models.ChatSession, args: dict
) -> tuple[dict, dict]:
    return _apply_edit_via_service(db, session, {
        "op": "move",
        "schedule_id": args.get("schedule_id"),
        "work_date": args.get("work_date"),
        "start_time": args.get("start_time"),
        "end_time": args.get("end_time"),
    })


def _tool_remove_schedule(
    db: Session, session: models.ChatSession, args: dict
) -> tuple[dict, dict]:
    return _apply_edit_via_service(db, session, {
        "op": "remove",
        "schedule_id": args.get("schedule_id"),
    })


def _tool_add_schedule(
    db: Session, session: models.ChatSession, args: dict
) -> tuple[dict, dict]:
    """추가 대상 배치는 모델이 아니라 세션이 정한다 — 세션의 현재 draft 밖으로
    쓸 수 없게 하는 스코프 경계다 (읽기 툴의 batch_id 스코프와 같은 원칙)."""
    if session.batch_id is None:
        raise ValueError("현재 draft 배치가 없습니다. 근무표를 먼저 생성해주세요.")
    return _apply_edit_via_service(db, session, {
        "op": "add",
        "batch_id": session.batch_id,
        "student_id": args.get("student_id"),
        "work_date": args.get("work_date"),
        "start_time": args.get("start_time"),
        "end_time": args.get("end_time"),
    })


WRITE_TOOL_HANDLERS: dict[
    str, Callable[[Session, models.ChatSession, dict], tuple[dict, dict]]
] = {
    "move_schedule": _tool_move_schedule,
    "remove_schedule": _tool_remove_schedule,
    "add_schedule": _tool_add_schedule,
}


def revert_turn(db: Session, session: models.ChatSession, message) -> int:
    """한 턴의 쓰기 툴 호출을 역순으로 일괄 취소한다 (결정 11). 되돌린 건수 반환.

    커밋하지 않는다 — 도중 하나라도 실패하면(그 사이 다른 편집이 끼어든 경우 등)
    HTTPException이 그대로 올라가고, 라우터가 롤백해 부분 복구 상태를 남기지
    않는다. remove의 복원은 add라 새 schedule_id가 발급되므로, 같은 턴에서
    같은 행을 여러 번 고친 경우 이전 id를 가리키는 역연산이 실패할 수 있다 —
    그 경우도 전체 실패로 처리된다 (설계 문서 §3 revert).
    """
    writes = [c for c in (message.tool_calls or []) if c.get("inverse")]
    reverted = 0
    for call in reversed(writes):
        _apply_edit_via_service(db, session, call["inverse"])
        reverted += 1
    return reverted

_TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="find_schedules",
        description=(
            "현재 draft 근무표에서 배정을 조회한다. 배정을 언급하거나 고치기 전에"
            " 반드시 이 툴로 대상을 확인하라 — schedule_id를 추측하지 마라."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_id": types.Schema(type=types.Type.STRING, description="학번으로 필터"),
                "work_date": types.Schema(type=types.Type.STRING, description="특정 날짜 (YYYY-MM-DD)"),
                "date_from": types.Schema(type=types.Type.STRING, description="기간 시작 (YYYY-MM-DD)"),
                "date_to": types.Schema(type=types.Type.STRING, description="기간 끝 (YYYY-MM-DD)"),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="explain_penalty",
        description=(
            "soft constraint 카테고리 하나의 실제 위반 내역(학생·날짜·비용)을"
            " 조회한다. '왜 이렇게 배정됐나'류 질문에 근거를 대는 용도."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "category": types.Schema(
                    type=types.Type.STRING,
                    enum=list(PENALTY_LABELS.keys()),
                    description="조회할 페널티 카테고리",
                ),
            },
            required=["category"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_student_availability",
        description="학생 한 명의 근무 가능 시간과 수업 시간표를 조회한다.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_id": types.Schema(type=types.Type.STRING, description="학번"),
            },
            required=["student_id"],
        ),
    ),
    # ---- 쓰기 툴 (#135) — draft만 고친다. 즉시 적용되며 턴 단위로 되돌릴 수 있다 ----
    types.FunctionDeclaration(
        name="move_schedule",
        description=(
            "draft 배정 한 건의 날짜·시각을 바꾼다. 반드시 find_schedules로"
            " schedule_id를 확인한 뒤 호출하라. 즉시 적용된다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "schedule_id": types.Schema(type=types.Type.INTEGER, description="find_schedules로 확인한 배정 ID"),
                "work_date": types.Schema(type=types.Type.STRING, description="새 날짜 (YYYY-MM-DD, 생략 시 기존 날짜 유지)"),
                "start_time": types.Schema(type=types.Type.STRING, description="새 시작 시각 (HH:MM)"),
                "end_time": types.Schema(type=types.Type.STRING, description="새 종료 시각 (HH:MM)"),
            },
            required=["schedule_id", "start_time", "end_time"],
        ),
    ),
    types.FunctionDeclaration(
        name="remove_schedule",
        description=(
            "draft 배정 한 건을 삭제한다. 반드시 find_schedules로 schedule_id를"
            " 확인한 뒤 호출하라. 즉시 적용된다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "schedule_id": types.Schema(type=types.Type.INTEGER, description="find_schedules로 확인한 배정 ID"),
            },
            required=["schedule_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="add_schedule",
        description=(
            "현재 draft 근무표에 배정 한 건을 추가한다. 학생의 가능 시간을"
            " get_student_availability로 확인한 뒤 호출하는 것이 좋다. 즉시 적용된다."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "student_id": types.Schema(type=types.Type.STRING, description="학번"),
                "work_date": types.Schema(type=types.Type.STRING, description="날짜 (YYYY-MM-DD)"),
                "start_time": types.Schema(type=types.Type.STRING, description="시작 시각 (HH:MM)"),
                "end_time": types.Schema(type=types.Type.STRING, description="종료 시각 (HH:MM)"),
            },
            required=["student_id", "work_date", "start_time", "end_time"],
        ),
    ),
]


# ---------------------------------------------------------------------------
# LLM 호출 — 한 스텝. 테스트는 이 함수를 monkeypatch해 툴 루프를 mock으로 돈다.
# ---------------------------------------------------------------------------


@dataclass
class LlmStep:
    """Gemini 응답 한 번 분량. raw_content는 프로덕션에서 대화 이력에 다시
    붙일 types.Content — mock에서는 None이어도 루프가 동작한다."""

    text: Optional[str] = None
    function_calls: list[tuple[str, dict]] = field(default_factory=list)
    raw_content: Any = None


def _get_gemini_client() -> Optional[genai.Client]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _llm_step(contents: list) -> LlmStep:
    client = _get_gemini_client()
    if client is None:
        raise ChatUnavailable("not_configured")

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=_TOOL_DECLARATIONS)],
    )
    try:
        response = client.models.generate_content(
            model=MODEL, contents=contents, config=config
        )
    except errors.APIError as e:
        if e.code != 429:
            logger.error("Gemini 챗봇 호출 실패: %s", e)
            raise ChatUnavailable("ai_error") from e
        logger.warning("429 사용량 제한 — %.0f초 대기 후 재시도", RATE_LIMIT_RETRY_DELAY)
        time.sleep(RATE_LIMIT_RETRY_DELAY)
        try:
            response = client.models.generate_content(
                model=MODEL, contents=contents, config=config
            )
        except errors.APIError as e2:
            logger.error("Gemini 챗봇 재시도 실패: %s", e2)
            raise ChatUnavailable("ai_error") from e2

    calls = [
        (fc.name, dict(fc.args or {})) for fc in (response.function_calls or [])
    ]
    raw = response.candidates[0].content if response.candidates else None
    return LlmStep(text=response.text, function_calls=calls, raw_content=raw)


# ---------------------------------------------------------------------------
# 컨텍스트 조립 (설계 문서 4.1) — draft 전체를 넣지 않는다. 총계만.
# ---------------------------------------------------------------------------


def _build_context(db: Session, session: models.ChatSession) -> str:
    policy_row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == session.department_id)
        .first()
    )
    custom_rules = (policy_row.custom_rules or "").strip() if policy_row else ""

    batch = None
    if session.batch_id is not None:
        batch = (
            db.query(models.ScheduleBatch)
            .filter(models.ScheduleBatch.batch_id == session.batch_id)
            .first()
        )
    summary = (batch.solver_summary or {}) if batch else {}
    penalty_summary = summary.get("penalty_summary", {})
    penalty_lines = "\n".join(
        f"- {PENALTY_LABELS.get(name, name)}({name}): {cost}"
        for name, cost in penalty_summary.items()
    ) or "(위반 없음)"

    return f"""\
## 검토 대상 근무표
- 부서 ID: {session.department_id}
- 기간: {session.period_start.isoformat()} ~ {session.period_end.isoformat()}
- 현재 draft batch_id: {session.batch_id}

## 부서 운영 규칙 (원문)
{custom_rules or "(등록된 규칙 없음)"}

## 현재 penalty 총계 (카테고리별 비용 — 세부 위반 내역은 explain_penalty 툴로 조회)
{penalty_lines}
"""


def _history_contents(session: models.ChatSession, user_text: str, context: str) -> list:
    """최근 N개 메시지 + 이번 발화를 Gemini contents로 변환한다 (결정 10)."""
    contents = []
    recent = (session.messages or [])[-RECENT_MESSAGES:]
    for msg in recent:
        role = "user" if msg.role == "user" else "model"
        contents.append(
            types.Content(role=role, parts=[types.Part(text=msg.content)])
        )
    contents.append(
        types.Content(
            role="user", parts=[types.Part(text=f"{context}\n\n## 직원 발화\n{user_text}")]
        )
    )
    return contents


# ---------------------------------------------------------------------------
# 툴 루프 (설계 문서 5.1)
# ---------------------------------------------------------------------------


def run_turn(
    db: Session, session: models.ChatSession, user_text: str
) -> tuple[str, list[dict], Optional[str]]:
    """한 턴 실행 — (응답 텍스트, tool_calls 기록, turn_status)를 반환한다.

    툴 실패는 예외로 턴을 끝내지 않고 사유를 결과로 모델에 돌려준다 —
    모델이 남은 예산 안에서 다른 방법을 시도하거나 사용자에게 설명한다.
    """
    from fastapi import HTTPException  # apply_draft_edit의 검증 실패(400/404)를 결과로 변환

    context = _build_context(db, session)
    contents = _history_contents(session, user_text, context)
    calls_record: list[dict] = []
    calls_used = 0
    writes_ok = writes_failed = 0

    def _finish_status() -> Optional[str]:
        """쓰기 결과에 따른 턴 상태 (결정 11) — 쓰기가 없던 턴은 None."""
        if writes_failed:
            return "partial_failed"
        if writes_ok:
            return "applied"
        return None

    # 예산(결정 17)은 LLM 왕복 수가 아니라 실제 툴 호출 수를 센다 — Gemini가
    # 한 스텝에 병렬로 여러 함수를 부를 수 있고, 반대로 마지막 툴 결과를 받아
    # 답을 마무리할 스텝은 예산과 무관하게 필요하기 때문. LLM 스텝은 예산 소진
    # 통보 후 마무리 답변 기회 1번을 더해 STEP_BUDGET + 2로 막는다.
    for _ in range(STEP_BUDGET + 2):
        step = _llm_step(contents)

        if not step.function_calls:
            return step.text or "", calls_record, _finish_status()

        if step.raw_content is not None:
            contents.append(step.raw_content)

        response_parts = []
        for name, args in step.function_calls:
            inverse: Optional[dict] = None
            if calls_used >= STEP_BUDGET:
                result: dict = {
                    "error": (
                        f"툴 호출 예산(턴당 {STEP_BUDGET}회)을 소진했습니다."
                        " 지금까지의 결과로 답하세요."
                    )
                }
            elif name in WRITE_TOOL_HANDLERS:
                calls_used += 1
                try:
                    result, inverse = WRITE_TOOL_HANDLERS[name](db, session, args)
                    writes_ok += 1
                except HTTPException as e:
                    # 겹침·주간 상한·draft 아님 등 — 사유를 모델에 돌려주고 계속
                    result = {"error": str(e.detail)}
                    writes_failed += 1
                except ValueError as e:
                    result = {"error": str(e)}
                    writes_failed += 1
                except Exception:
                    logger.exception("쓰기 툴 %s 실행 중 예상 밖 오류", name)
                    result = {"error": "툴 실행에 실패했습니다."}
                    writes_failed += 1
            else:
                calls_used += 1
                handler = READ_TOOL_HANDLERS.get(name)
                if handler is None:
                    result = {"error": f"알 수 없는 툴입니다: {name}"}
                else:
                    try:
                        result = handler(db, session, args)
                    except ValueError as e:
                        result = {"error": str(e)}
                    except Exception:
                        logger.exception("툴 %s 실행 중 예상 밖 오류", name)
                        result = {"error": "툴 실행에 실패했습니다."}
            entry = {"tool": name, "args": args, "result": result}
            if inverse is not None:
                entry["inverse"] = inverse  # 되돌리기의 근거 — 쓰기 성공에만 존재
            calls_record.append(entry)
            response_parts.append(
                types.Part.from_function_response(name=name, response=result)
            )
        contents.append(types.Content(role="user", parts=response_parts))

    # 예산 소진 통보 후에도 모델이 툴 호출을 고집한 경우 (섹션 6.4) —
    # 이미 적용된 쓰기는 남아 있으므로 사용자가 턴을 통째로 되돌릴 수 있다
    return (
        "요청이 너무 커서 중간에 멈췄습니다. 지금까지 적용된 변경은 되돌릴 수 있습니다."
        if writes_ok
        else "요청이 너무 커서 중간에 멈췄습니다. 더 작게 나눠서 다시 요청해주세요.",
        calls_record,
        "budget_exceeded",
    )
