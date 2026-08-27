"""학사 정보 API — 화면이 학기를 다루는 데 필요한 값.

- GET /api/academic/terms   수강 학기 목록 (학생)

학기는 수업 시간표(REQ-SCHED-015)와 근무 가능 시간(REQ-SCHED-014)을 함께 묶는
단위라, 어느 한쪽 경로에 두지 않고 별도로 뺐다.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import auth, schemas
from app.database import get_db
from app.services import academic_terms

router = APIRouter(prefix="/api/academic", tags=["academic"])


@router.get("/terms", response_model=schemas.TermListOut)
def list_terms(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """수강 학기 목록 — 화면의 학기 선택기가 쓴다.

    학기는 1년을 빈틈없이 덮는다 (여름·겨울은 계절수업을 포함한 방학 전체) —
    방학에도 근무가 있어 가능 시간을 붙일 칸이 비면 안 되기 때문이다.
    """
    today = date.today()
    terms, default_term = academic_terms(today)
    return schemas.TermListOut(
        terms=[
            schemas.TermOut(
                key=t.key,
                label=t.label,
                start=t.start,
                end=t.end,
                current=t.start <= today <= t.end,
            )
            for t in terms
        ],
        default_term=default_term.key if default_term else None,
    )
