"""테스트 전용 설정.

ScheduleBatch.solver_summary는 Postgres 전용 JSONB 컬럼이라 sqlite로는
create_all()이 실패한다. 아래 컴파일 규칙은 **테스트에서만** sqlite 방언일 때
JSONB를 JSON으로 렌더링하도록 등록하는 shim이며, 프로덕션 모델(app/models.py)이나
실제 Postgres DDL에는 아무 영향이 없다.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


@pytest.fixture
def db_session():
    from app.database import Base
    from app import models  # noqa: F401  — 모든 모델을 메타데이터에 등록

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
