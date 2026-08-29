"""시간표 검토 챗봇 API (#134·#135·#136, REQ-SCHED-019·020·021).

- POST /api/schedule/chat/sessions                       세션 생성 (직원)
- GET  /api/schedule/chat/sessions/{id}/messages         대화 이력 조회 (세션 소유 직원)
- POST /api/schedule/chat/sessions/{id}/messages         메시지 전송 → 툴 루프 실행 (세션 소유 직원)
- POST /api/schedule/chat/sessions/{id}/messages/{mid}/revert
                                                         턴 되돌리기 — 쓰기 역순 취소 (세션 소유 직원)
- POST /api/schedule/chat/sessions/{id}/weights/persist  세션 배율을 부서 기본값으로 저장 (세션 소유 직원)

설계: docs/시간표검토_챗봇_설계문서.md v3. 세션은 (부서, 기간)에 고정되고
batch_id는 메시지 처리 시마다 현재 draft로 갱신한다 — 재생성이 draft를
삭제·재생성해 batch_id가 바뀌어도 세션이 끊기지 않는다 (사실 F, 결정 9).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.scheduler.chat import (
    ChatUnavailable,
    persist_session_scales,
    revert_turn,
    run_turn,
)
from app.services import require_own_department_or_lead, require_schedule_editor

router = APIRouter(prefix="/api/schedule/chat", tags=["schedule-chat"])

_STATUS_DRAFT = "draft"


def _find_current_draft(
    db: Session, department_id: int, period_start, period_end
) -> "models.ScheduleBatch | None":
    return (
        db.query(models.ScheduleBatch)
        .filter(
            models.ScheduleBatch.department_id == department_id,
            models.ScheduleBatch.period_start == period_start,
            models.ScheduleBatch.period_end == period_end,
            models.ScheduleBatch.status == _STATUS_DRAFT,
        )
        .first()
    )


def _get_own_session(
    db: Session, current_user: auth.CurrentUser, session_id: int
) -> models.ChatSession:
    """세션 조회 — 시작한 직원만 접근한다 (결정 3: 직원 × 세션 단위)."""
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.session_id == session_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="해당 세션을 찾을 수 없습니다.")
    if session.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="본인이 시작한 세션만 사용할 수 있습니다.")
    return session


@router.post("/sessions", response_model=schemas.ChatSessionOut, status_code=201)
def create_chat_session(
    payload: schemas.ChatSessionCreate,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """새 챗봇 세션. 그 기간의 draft가 없으면 400 — 검토할 대상이 없다."""
    require_own_department_or_lead(
        db, current_user, payload.department_id,
        "본인 소속 부서의 근무표만 검토할 수 있습니다.",
    )
    draft = _find_current_draft(
        db, payload.department_id, payload.period_start, payload.period_end
    )
    if draft is None:
        raise HTTPException(
            status_code=400,
            detail="해당 기간의 draft 근무표가 없습니다. 먼저 근무표를 생성해주세요.",
        )
    session = models.ChatSession(
        department_id=payload.department_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        batch_id=draft.batch_id,
        created_by=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[schemas.ChatMessageOut],
)
def list_chat_messages(
    session_id: int,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """대화 이력 전체 — 새로고침 후 화면 복원용 (결정 3)."""
    session = _get_own_session(db, current_user, session_id)
    return session.messages


@router.post(
    "/sessions/{session_id}/messages",
    response_model=schemas.ChatMessageOut,
    status_code=201,
)
def send_chat_message(
    session_id: int,
    payload: schemas.ChatMessageIn,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    session = _get_own_session(db, current_user, session_id)

    # 재생성으로 batch_id가 바뀌었으면 따라간다 (사실 F). draft가 아예 사라졌으면
    # 세션은 유지하되 이번 턴을 거부한다 — 재생성하면 이어서 쓸 수 있다.
    draft = _find_current_draft(
        db, session.department_id, session.period_start, session.period_end
    )
    if draft is None:
        raise HTTPException(
            status_code=409,
            detail="이 기간의 draft 근무표가 지금은 없습니다. 재생성 후 이어서 대화할 수 있습니다.",
        )
    if session.batch_id != draft.batch_id:
        session.batch_id = draft.batch_id

    user_msg = models.ChatMessage(
        session_id=session.session_id, role="user", content=payload.content
    )
    db.add(user_msg)
    db.flush()

    try:
        text, tool_calls, turn_status = run_turn(db, session, payload.content)
    except ChatUnavailable as e:
        # 사용자 발화도 함께 버린다 — 답변 없는 반쪽 턴을 이력에 남기면
        # 재시도 시 같은 발화가 중복 저장된다. 사용자는 다시 보내면 된다.
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail=(
                "AI 챗봇을 지금 사용할 수 없습니다."
                + (" (API 키 미설정)" if e.reason == "not_configured" else "")
            ),
        )

    assistant_msg = models.ChatMessage(
        session_id=session.session_id,
        role="assistant",
        content=text,
        tool_calls=tool_calls or None,
        turn_status=turn_status,
    )
    db.add(assistant_msg)
    session.last_active_at = datetime.now()
    db.commit()
    db.refresh(assistant_msg)
    return assistant_msg


@router.post(
    "/sessions/{session_id}/messages/{message_id}/revert",
    response_model=schemas.ChatMessageOut,
)
def revert_chat_turn(
    session_id: int,
    message_id: int,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """그 턴의 쓰기 툴 호출을 역순으로 일괄 취소한다 (REQ-SCHED-020, 결정 11).

    되돌린 턴은 재적용 불가 — 같은 변경을 다시 원하면 새 메시지로 요청해야 한다.
    도중 하나라도 실패하면(그 사이 다른 편집·재생성이 끼어든 경우) 전체를
    롤백하고 409 — 부분 복구 상태를 남기지 않는다.
    """
    session = _get_own_session(db, current_user, session_id)
    message = (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.message_id == message_id,
            models.ChatMessage.session_id == session.session_id,
        )
        .first()
    )
    if message is None:
        raise HTTPException(status_code=404, detail="해당 메시지를 찾을 수 없습니다.")
    if message.turn_status == "reverted":
        raise HTTPException(status_code=409, detail="이미 되돌린 턴입니다.")
    writes = [c for c in (message.tool_calls or []) if c.get("inverse")]
    if message.role != "assistant" or not writes:
        raise HTTPException(status_code=400, detail="되돌릴 변경이 없는 메시지입니다.")

    try:
        revert_turn(db, session, message)
    except HTTPException as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"되돌리기에 실패해 전체를 취소했습니다: {e.detail}",
        )
    except ValueError as e:
        # 세션 스코프 위반·저장된 inverse가 스키마와 어긋나는 경우 — 500 대신 409
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"되돌리기에 실패해 전체를 취소했습니다: {e}",
        )

    message.turn_status = "reverted"
    session.last_active_at = datetime.now()
    db.commit()
    db.refresh(message)
    return message


@router.post("/sessions/{session_id}/weights/persist")
def persist_weights(
    session_id: int,
    current_user: auth.CurrentUser = Depends(require_schedule_editor),
    db: Session = Depends(get_db),
):
    """세션 임시 배율을 부서 기본값으로 저장한다 (REQ-SCHED-021, 결정 15).

    챗봇으로 찾은 배율은 세션 안에만 머무르므로, 이 부서의 모든 향후 생성에
    반영하려면 편성 담당자가 이 엔드포인트로 명시적으로 저장해야 한다. 저장 후
    세션 임시 배율은 초기화된다 (부서 기본값에 흡수 — 이중 적용 방지).

    직원 전용이었으나 부서 정책 변경이 학생팀장에게 열리면서 같이 열렸다 (#156).
    배율은 PATCH /schedule/policy의 soft_weight_scales와 같은 값을 쓰므로,
    한쪽만 막아 두면 화면에서는 되고 챗봇에서는 안 되는 경계가 생긴다.
    """
    session = _get_own_session(db, current_user, session_id)
    # 세션 생성 시 이미 부서를 확인하지만, 그 뒤 소속이 바뀐 계정이 남의 부서
    # 정책을 쓰지 못하도록 저장 시점에도 확인한다
    require_own_department_or_lead(
        db, current_user, session.department_id,
        "본인 소속 부서의 정책만 설정할 수 있습니다.",
    )
    try:
        result = persist_session_scales(db, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    session.last_active_at = datetime.now()
    db.commit()
    return result
