# STREAM 기술 스택 개요 (발표용)

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | STREAM (Sogang Total Recruitment & Efficient Administration Management) |
| 목적 | 서강대 교내 근로장학 통합 관리 시스템 (생성형 AI 기반 아이디어 공모전 출품작) |
| 팀 | 비버(Beaver), 5인 팀 |
| 개발 기간 | 2026.06.30 ~ 2026.08.31 (9주) |
| GitHub | `sg-beaver/stream` |
| 핵심 사이클 | 공고 → 지원/선발 → 근무표 → 대타 |

---

## 2. 기술 스택

| 영역 | 기술 |
|---|---|
| Backend 프레임워크 | FastAPI `0.139.0` |
| ORM | SQLAlchemy `2.0.51` |
| Database | PostgreSQL 16 (Docker 컨테이너 `stream-db`, `infra/docker-compose.yml`) |
| 인증 | JWT (`HTTPBearer` 방식), **`PyJWT`** `2.13.0` + `passlib`/`bcrypt` |
| 스케줄링 알고리즘 | Google OR-Tools CP-SAT (`ortools` `9.15.6755`) — 제약조건 기반 근무표 최적 배정 |
| AI 모델 | Google Gemini (`google-genai` `1.75.0` SDK, structured output 강제) |
| Frontend 프레임워크 | React `18.3.1` + Vite `6.0.5` |
| 라우팅 | `react-router-dom` `7.18.2` |
| 아이콘 | `lucide-react` |
| 마이그레이션 | `schema_patches.py` (기존 테이블 컬럼 추가 전용, 신규 테이블은 SQLAlchemy `create_all()`로 자동 반영) |
| API 문서 | FastAPI 자동 생성 Swagger UI (`/docs`) + `docs/API_SPEC.md` 수기 문서 |

> **바로잡은 점**: 초안에 `python-jose`로 적혀 있었으나, 실제 `requirements.txt`와 `app/auth.py`는 `PyJWT`를 쓴다. 초안에는 프런트엔드 스택이 아예 없었는데, `frontend/`가 React + Vite 기반으로 실존해 추가했다.

**폴더 구조**
```
stream/
├── backend/
│   ├── app/
│   │   ├── main.py, database.py, models.py, schemas.py, auth.py
│   │   ├── routers/        (auth, postings, applications, class_time, schedule, students, substitutes)
│   │   ├── scheduler/      (config, constraints, domain, engine — CP-SAT 솔버 / review·substitute_check — AI 검토 서비스 · 프롬프트 파일)
│   │   └── services.py     (권한 체크 등 공용 헬퍼)
│   ├── scripts/            (seed_mock_data.py, eval_review.py, eval_substitute_check.py 등)
│   └── tests/
├── frontend/
│   └── src/                (api, components, pages, data, utils, styles)
└── docs/                   (API_SPEC.md, ERD.md, SCHEDULER_SPEC.md 등)
```
`venv/`, `node_modules/`는 `.gitignore`로 저장소에서 제외된다.

---

## 3. 데이터베이스 설계

### 핵심 테이블 (실제 `models.py` 기준, 총 17개 테이블 중 발표에 필요한 것만 발췌)

| 테이블 | 역할 |
|---|---|
| `student` / `staff` | 학생/직원 계정. `student.department_name`은 **학생의 전공(학과)**이며 근로 부서와 무관 |
| `department` / `department_policy` | 근로 부서 정보(`department.name`), 부서별 운영 규칙(`custom_rules`, 자연어) · 개관 시간 · 배정 인원 상한 |
| `job_posting` / `application` | 채용 공고, 지원 및 선발 |
| `available_time` | 학생 희망 근무 가능 시간 |
| `schedule_batch` / `work_schedule` | 근무표 생성 배치(draft/confirmed/manual/superseded), 확정된 근무 일정 |
| `substitute_request` | 대타 요청/수락/승인/반려 |
| `clarification_answer` | AI 판단 근거 부족 시 되묻기(clarification) 질문에 대한 직원 답변 로그 — review·ai-check 두 기능이 공용으로 재사용 |
| `substitute_ai_check_cache` | 대타 AI 적합성 검사(`ai-check`) 결과 캐시. 캐시 키는 `(request_id, substitute_student_id)`이며, 관련 `clarification_answer`가 새로 추가되면 무효화 |

> **바로잡은 점**: 초안은 부서 참조 원칙을 "`department_id`로 참조하되 `student.department_name`은 근로 부서와 무관하게 예외적으로 제공"이라고 적었는데, 실제로도 정확히 이렇게 구현돼 있다(`Department.department_id`가 정수 PK, `Student.department_name`은 학생이 지원서에 적은 전공 문자열일 뿐 FK가 아님). 다만 오늘 대화에서 실제로 이 지점이 헷갈릴 뻔한 사례가 있었으니, 발표 때 "겉보기엔 비슷한 이름이라 혼동하기 쉬운 지점"으로 짚어주면 좋다.

**설계 원칙**
- 근로 부서는 정수 FK(`department_id`)로만 참조. 학생↔부서 연결은 `application → job_posting.department_id → department` 경로를 거친다(직접 FK 없음)
- 계산 가능한 값(집계 시간 등)은 컬럼에 저장하지 않고 조회 시점에 계산
- 희망 근무(`available_time`)와 확정 근무(`work_schedule`)를 테이블로 완전히 분리
- 신규 테이블(`clarification_answer`, `substitute_ai_check_cache` 등)은 `schema_patches.py` 없이 `create_all()`로 자동 생성 — 이 스크립트는 기존 테이블에 컬럼을 추가할 때만 쓴다

---

## 4. 핵심 기능 & AI 통합

### 4-1. 근무표 생성 (`POST /api/schedule/generate`)
제약조건 기반 최적화(OR-Tools CP-SAT)로 주간 근로시간 상한, 수업시간 충돌 등 하드 제약을 만족하는 근무표 초안을 자동 생성. 결과는 `draft` 상태 `ScheduleBatch`로 저장되고, 담당자가 검토 후 `POST /api/schedule/confirm`으로 확정한다.

### 4-2. AI 검토 (`POST /api/schedule/review`) — Gemini 연동
근무표 초안에 대해 부서의 자연어 운영 규칙(`custom_rules`)을 기준으로 Gemini가 검토 의견을 생성. **AI는 의견만 제시하고 확정 권한은 없음** — 이 프로젝트 전반의 핵심 설계 원칙.
- 규칙 미등록/AI 호출 실패 시 "조용한 실패"로 처리 — HTTP 200을 유지하고 응답에 `review_available: false` + `reason`(`no_rules`/`not_configured`/`ai_error`)만 담아 근무표 플로우를 막지 않는다

### 4-3. 되묻기(Clarification) 기능
판단 근거가 부족할 때 AI가 무조건 "확인 불가"로 답하는 대신, **답변 가능한 좁은 사실 결손**에 한해 담당 직원에게 되묻는 기능.
- 대상: 학생 데이터 결손(`target_type="student"`, 예: 근속 시작일) / 부서 정책 결손(`"department"`) / 규칙 문구 해석 모호(`"rule_interpretation"`)
- 답변은 `clarification_answer` 테이블에 로그로 남고, 다음 AI 판단 시 "확인된 정보" 섹션으로 프롬프트에 반영된다 — 실제 학생/부서 컬럼을 자동으로 갱신하지는 않는다(사람이 수동 반영)

### 4-4. 대타 승인 AI 적합성 검사 (`GET /api/substitute-requests/{id}/ai-check`)
대타 후보가 수락한 뒤 담당 직원이 승인(`approve`)하기 전, 그 학생 1명이 부서 규칙(경력 우선 배치 등)에 적합한지 AI가 검토. 되묻기 인프라를 그대로 재사용하며, 결과는 `overall_verdict`(`적합`/`주의`/`판단불가`)로 요약된다. **`clarification_requests`가 하나라도 있으면 무조건 `판단불가`** — 프롬프트 지시뿐 아니라 서버 코드로도 이중 강제한다. 결과는 캐싱되어 반복 호출 시 쿼터를 아낀다. **이 검사를 호출하지 않거나 결과와 무관하게 `approve`는 항상 독립적으로 동작한다.**

> **바로잡은 점**: 초안의 설명(조용한 실패·되묻기·캐싱)은 대체로 정확했다. 다만 실제 필드명을 명시하지 않았는데, review는 `review_available`, ai-check는 `ai_check_available`로 이름이 다르다(같은 패턴이지만 기능마다 별도 필드) — 발표 슬라이드에도 실제 필드명을 넣어뒀다.

---

## 5. 개발/협업 프로세스

- **브랜치 전략**: `type-keyword` 형식(슬래시 금지, 예: `feat-schedule-api`), `develop`에서 분기 → PR → `develop` 병합. `main`/`develop`에는 직접 커밋하지 않는다 (`docs/BRANCH_CONVENTION.md`)
- **커밋 컨벤션**: `type(scope): 한국어 메시지` (예: `feat(backend): 공고 조회 API 추가`) (`docs/COMMIT_CONVENTION.md`)
- **API 설계**: REQ-ID 체계로 요구사항 추적. 실제 범위는 `REQ-AUTH-001~005`, `REQ-POST-001~010`, `REQ-PROFILE-001~002`, `REQ-APP-001~006`, `REQ-SCHED-001~016`, `REQ-SUB-001~008` (`docs/API_SPEC.md`)
- **검증**: pytest 기반 mock/DB 테스트 — 현재 **223개**(실제 Gemini를 호출하는 통합 테스트 13개 제외 기준, `pytest --collect-only` 실측) + 실 API 호출(`/docs`) 수동 검증 병행
- AI 기능은 Gemini 무료 티어 일일 쿼터(20회) 제약 안에서 개발 — 결과 캐싱(`ai-check`), mock 우선 테스트, `--case` 옵션으로 개별 케이스만 실행하는 방식으로 쿼터 관리

> **바로잡은 점**: 초안의 REQ-ID 범위(`REQ-SCHED-001~012`, `REQ-SUB-001~006`)는 초기 버전 기준이라 실제보다 적다. 지금은 REQ-SCHED가 016까지, REQ-SUB가 008까지 있고, REQ-AUTH/REQ-POST/REQ-PROFILE/REQ-APP도 있다. pytest 개수는 초안에 숫자가 없어서 실측치를 넣었다.

---

## 6. MVP 스코프 제외 항목 (참고)

- AI 모의 자기소개서 자동 생성
- SAINT 실제 연동 (Mock 데이터로 대체 — 학적 정보 등은 시드 스크립트가 채움)
- KakaoWork 알림 / Google Calendar 연동
- 운영 데이터 대시보드
- 학생-부서 적합도 분석(`match_score`) — 설계 초기 논의 중 팀 논의를 거쳐 MVP 범위 제외로 확정 (`docs/API_SPEC.md` REQ-APP-003/005 참고)

> **바로잡은 점**: `match_score` 제외는 "검토 중"이 아니라 API_SPEC.md에 이미 "확정"으로 명시돼 있어 문구를 맞췄다. KakaoWork/Google Calendar는 `docs/STREAM_CONTEXT.md`에 "저장된 메모리 기준"(초기 후보 목록)이라고 명시된 항목이라, 이 자체가 확정 계획이 아니라 후보였다는 톤을 유지했다.
