"""create_all이 못 하는 기존 테이블 컬럼 보정 (정식 마이그레이션 도구 도입 전 임시).

Base.metadata.create_all은 새 테이블만 만들고 기존 테이블에는 컬럼을 추가하지
않는다. 모델에 컬럼을 추가할 때는 여기 목록에도 올려야 하며, 앱 시작 시
(main.py)와 시드 스크립트 양쪽에서 보정을 실행한다 — 시드를 다시 돌리지 않는
환경(코드만 pull한 팀원, 스테이징)에서도 스키마가 맞도록.

ADD COLUMN IF NOT EXISTS는 Postgres 전용 문법이라 다른 방언(테스트용 sqlite
등)에서는 건너뛴다 — 그런 DB는 매번 create_all로 새로 만들어지므로 보정이
필요 없다.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

_COLUMN_PATCHES = [
    # (table, column, column type) — funding_type 도입 이후 추가된 컬럼들
    ("student", "funding_type", "VARCHAR"),
    ("student", "active_from", "DATE"),  # 활동 기간 담당자 관리 (NULL=공고 파생)
    ("student", "active_until", "DATE"),
    ("job_posting", "category", "VARCHAR"),
    ("job_posting", "period_start", "DATE"),
    ("job_posting", "period_end", "DATE"),
    ("job_posting", "headcount", "INTEGER"),
    ("job_posting", "weekly_max_hours", "INTEGER"),
    ("job_posting", "location", "VARCHAR"),
    ("job_posting", "contact_email", "VARCHAR"),
    ("job_posting", "contact_phone", "VARCHAR"),
    ("job_posting", "work_slots", "TEXT"),
    ("available_time", "source", "VARCHAR DEFAULT 'manual'"),
    ("department_policy", "custom_rules", "TEXT"),  # #36
    ("department_policy", "opening_hours", "JSONB"),  # 개관 시간 직접 설정
    ("department_policy", "min_per_slot", "INTEGER"),  # 배정 인원 직접 설정
    ("department_policy", "max_per_slot", "INTEGER"),
    ("department_policy", "biweekly_max_hours", "INTEGER"),
    ("department_policy", "soft_weight_scales", "JSONB"),
    ("department_policy", "policy_file_key", "VARCHAR"),  # #52
    ("department_policy", "work_slots", "JSONB"),  # #89 부서 정의 근무 슬롯
    ("schedule_batch", "solver_summary", "JSONB"),  # #63
    ("substitute_request", "requested_at", "TIMESTAMP DEFAULT NOW()"),  # #72
    ("substitute_request", "reject_reason", "TEXT"),  # #72 반려 사유
]


def apply_schema_patches(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for table, column, col_type in _COLUMN_PATCHES:
            conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}")
            )
