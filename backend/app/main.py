import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import models
from app.database import Base, engine
from app.routers import applications, auth, class_time, postings, schedule, substitutes

load_dotenv()

Base.metadata.create_all(bind=engine)

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
app.include_router(substitutes.router)
app.include_router(class_time.router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/")
def root():
    return {"status": "ok"}
