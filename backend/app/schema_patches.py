"""create_all이 못 하는 기존 테이블 컬럼 보정 (정식 마이그레이션 도구 도입 전 임시).

Base.metadata.create_all은 새 테이블만 만들고 기존 테이블에는 컬럼을 추가하지
않는다. 모델에 컬럼을 추가할 때는 여기 목록에도 올려야 하며, 앱 시작 시
(main.py)와 시드 스크립트 양쪽에서 보정을 실행한다 — 시드를 다시 돌리지 않는
환경(코드만 pull한 팀원, 스테이징)에서도 스키마가 맞도록.

ADD COLUMN IF NOT EXISTS는 Postgres 전용 문법이라 다른 방언(테스트용 sqlite
등)에서는 건너뛴다 — 그런 DB는 매번 create_all로 새로 만들어지므로 보정이
필요 없다.

컬럼만 추가해서는 안 되는 경우(기존 행에 값을 채워야 하는 경우)는 _BACKFILLS에
UPDATE 문을 함께 올린다. 여러 번 실행돼도 결과가 같도록(IS NULL 조건 등)
작성해야 한다 — 앱이 뜰 때마다 돌기 때문이다.
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
    ("department_policy", "default_term", "VARCHAR"),  # #172 부서 기본 학기
    ("schedule_batch", "solver_summary", "JSONB"),  # #63
    ("substitute_request", "requested_at", "TIMESTAMP DEFAULT NOW()"),  # #72
    # SAINT 학적 정보 (#122) — 학과(전공)는 기존 department_name을 그대로 쓴다
    ("student", "email", "VARCHAR"),
    ("student", "photo_url", "VARCHAR"),
    ("student", "enroll_status", "VARCHAR"),
    ("student", "status_changed_at", "DATE"),
    ("student", "degree_course", "VARCHAR"),
    ("student", "nationality", "VARCHAR"),
    ("student", "advisor", "VARCHAR"),
    ("student", "grade_year", "INTEGER"),
    ("student", "semester", "INTEGER"),
    ("student", "completed_semesters", "INTEGER"),
    ("student", "birth_date", "DATE"),
    ("student", "interests", "JSONB"),
    ("substitute_request", "reject_reason", "TEXT"),  # #72 반려 사유
    ("student", "tenure_start_date", "DATE"),
    ("class_time", "term", "VARCHAR"),  # 학기별 수업 시간표
    ("student", "is_team_lead", "BOOLEAN NOT NULL DEFAULT FALSE"),  # 학생팀장
    ("available_time", "term", "VARCHAR"),  # 학기별 근무 가능 시간
    ("substitute_request", "start_time", "TIME"),  # #123 부분 대타 요청 구간
    ("substitute_request", "end_time", "TIME"),
    # #229: 승인 사실이 배치에 의존하지 않도록 좌표를 자기 컬럼으로 갖는다
    ("substitute_request", "work_date", "DATE"),
    ("substitute_request", "department_id", "INTEGER"),
    # 수업 조교 편성을 쓰는 부서인지 — 학과·학부 사무실만 True
    ("department", "course_ta_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
    # #254: 챗봇 세션에서 건 근무 불가 조건 (재solve 입력)
    ("chat_session", "session_constraints", "JSONB"),
]

# 컬럼 추가만으로는 안 되는 스키마 변경 (제약 해제·이름 변경). 여러 번 실행해도
# 같은 결과가 나오도록 IF EXISTS / 조건부 DO 블록으로 쓴다.
_STATEMENTS = [
    # #156: 근무표를 만드는 주체가 직원만이 아니게 됐다 (학생팀장). 두 컬럼은
    # "누가 했는가"를 담을 뿐이라 staff FK를 떼고 문자열 사용자 ID로 둔다.
    "ALTER TABLE schedule_batch DROP CONSTRAINT IF EXISTS schedule_batch_created_by_fkey",
    "ALTER TABLE chat_session DROP CONSTRAINT IF EXISTS chat_session_staff_id_fkey",
    """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name = 'chat_session' AND column_name = 'staff_id'
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name = 'chat_session' AND column_name = 'created_by'
        ) THEN
            ALTER TABLE chat_session RENAME COLUMN staff_id TO created_by;
        END IF;
    END $$
    """,
]

_BACKFILLS = [
    # #123: 부분 대타 도입 전의 요청은 모두 "근무 전체" 요청이었다. 구간 컬럼을
    # 근무 시간으로 채워 넣어 이후 로직(겹침 판정·후보 탐색·분할)이 NULL 분기를
    # 두지 않아도 되게 한다.
    """
    UPDATE substitute_request AS sr
       SET start_time = ws.start_time,
           end_time = ws.end_time
      FROM work_schedule AS ws
     WHERE ws.schedule_id = sr.schedule_id
       AND (sr.start_time IS NULL OR sr.end_time IS NULL)
    """,
    # #229: 좌표(날짜·부서)를 자기 컬럼으로 옮긴다. 이전에는 schedule_id를 타고
    # 읽었는데, 그 행이 재확정으로 superseded가 되면 승인 사실이 갈 곳을 잃었다
    # (#178). 역채움은 지금 가리키는 행에서 그대로 가져오면 된다 — 아직 재확정이
    # 일어나지 않았다면 정확하고, 일어났다면 그 요청은 어차피 이미 되돌려진 뒤라
    # 원래 좌표가 superseded 행에 남아 있다.
    """
    UPDATE substitute_request AS sr
       SET work_date = ws.work_date,
           department_id = ws.department_id
      FROM work_schedule AS ws
     WHERE ws.schedule_id = sr.schedule_id
       AND (sr.work_date IS NULL OR sr.department_id IS NULL)
    """,
]


def apply_schema_patches(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for table, column, col_type in _COLUMN_PATCHES:
            conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}")
            )
        for statement in _STATEMENTS:
            conn.execute(text(statement))
        for statement in _BACKFILLS:
            conn.execute(text(statement))
