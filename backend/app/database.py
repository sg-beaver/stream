import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# CWD 기준 탐색이 아니라 backend/.env를 명시한다 — 리포 루트에서
# `uvicorn --app-dir backend`로 실행해도 GEMINI_API_KEY 등이 로드되도록.
# (DATABASE_URL은 기본값 폴백이 있어 그동안 문제가 드러나지 않았다)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://stream_user:stream_pass@localhost:5432/stream_db",
)

# pool_pre_ping: 커넥션을 빌려줄 때 살아 있는지 먼저 확인한다. RDS는 유휴
# 커넥션을 끊으므로, 이게 없으면 트래픽이 뜸한 뒤 첫 요청이 OperationalError로
# 죽는다. pool_recycle: 그 전에 우리가 먼저 커넥션을 버려 재연결한다.
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
