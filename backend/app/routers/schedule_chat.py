"""시간표 검토 챗봇 API (#134, REQ-SCHED-019).

- POST /api/schedule/chat/sessions                       세션 생성 (직원)
- GET  /api/schedule/chat/sessions/{id}/messages         대화 이력 조회 (세션 소유 직원)
- POST /api/schedule/chat/sessions/{id}/messages         메시지 전송 → 툴 루프 실행 (세션 소유 직원)

설계: docs/시간표검토_챗봇_설계문서.md v3. 세션은 (부서, 기간)에 고정되고
batch_id는 메시지 처리 시마다 현재 draft로 갱신한다 — 재생성이 draft를
삭제·재생성해 batch_id가 바뀌어도 세션이 끊기지 않는다 (사실 F, 결정 9).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.scheduler.chat import ChatUnavailable, run_turn
from app.services import require_own_department

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
    if session.staff_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인이 시작한 세션만 사용할 수 있습니다.")
    return session


@router.post("/sessions", response_model=schemas.ChatSessionOut, status_code=201)
def create_chat_session(
    payload: schemas.ChatSessionCreate,
    current_user: auth.CurrentUser = Depends(auth.require_staff),
    db: Session = Depends(get_db),
):
    """새 챗봇 세션. 그 기간의 draft가 없으면 400 — 검토할 대상이 없다."""
    require_own_department(
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
        staff_id=current_user.id,
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
    current_user: auth.CurrentUser = Depends(auth.require_staff),
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
    current_user: auth.CurrentUser = Depends(auth.require_staff),
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
        # 조용한 실패 원칙 (REQ-SCHED-016과 동일) — 대화는 저장하되 이유를 알린다
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
