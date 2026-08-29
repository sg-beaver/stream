import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import models
from app.database import Base, engine
from app.routers import (
    academic,
    applications,
    auth,
    class_time,
    course_ta,
    postings,
    schedule,
    schedule_chat,
    students,
    substitutes,
)
from app.schema_patches import apply_schema_patches

# backend/.env를 명시 로드 — 실행 CWD와 무관하게 GEMINI_API_KEY 등이 잡히도록
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

Base.metadata.create_all(bind=engine)
apply_schema_patches(engine)  # create_all이 추가하지 못하는 기존 테이블의 새 컬럼 보정

app = FastAPI(title="Stream API")

cors_origins = os.getenv("CORS_ORIGINS", "").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(postings.router)
app.include_router(applications.router)
app.include_router(schedule.router)
app.include_router(schedule_chat.router)
app.include_router(substitutes.router)
app.include_router(academic.router)
app.include_router(class_time.router)
app.include_router(course_ta.router)
app.include_router(students.router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/")
def root():
    return {"status": "ok"}
