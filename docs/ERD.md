# ERD

`backend/app/models.py` 기준 (소스가 진실, 이 문서는 요약).
마지막 갱신: 2026-09-01 — 테이블 23개 전체 반영 (지원서 이력·SAINT 학적 #122, 학생 특이사항 #185, AI 되묻기·대타 AI 검사, 시간표 챗봇 #134, 개설 과목·TA #173).

전체 관계를 먼저 보고, 속성은 도메인별로 나눠서 봅니다. 한 장에 23개 테이블의 컬럼을 모두 넣으면 읽을 수 없기 때문입니다.

---

## 1. 전체 관계도

```mermaid
erDiagram
    DEPARTMENT ||--o{ STAFF : "소속"
    DEPARTMENT ||--o{ JOB_POSTING : "게시"
    DEPARTMENT ||--o| DEPARTMENT_POLICY : "운영 정책"
    DEPARTMENT ||--o{ SCHEDULE_BATCH : "생성 실행"
    DEPARTMENT ||--o{ WORK_SCHEDULE : "근무표"
    DEPARTMENT ||--o{ SUBSTITUTE_REQUEST : "좌표(부서)"
    DEPARTMENT ||--o{ CHAT_SESSION : "챗봇 세션"
    DEPARTMENT ||--o{ COURSE_TA : "TA 근무 부서"

    STAFF ||--o{ JOB_POSTING : "작성 (created_by)"
    STAFF ||--o{ APPLICATION : "검토 (reviewed_by)"
    STAFF ||--o{ SUBSTITUTE_REQUEST : "승인 (approved_by)"
    STAFF ||--o{ CLARIFICATION_ANSWER : "되묻기 답변 (answered_by)"

    STUDENT ||--o{ APPLICATION : "지원"
    STUDENT ||--o{ STUDENT_CAREER : "경력"
    STUDENT ||--o{ STUDENT_LANGUAGE : "어학"
    STUDENT ||--o{ STUDENT_CERTIFICATE : "자격증"
    STUDENT ||--o{ AVAILABLE_TIME : "주간 가능시간"
    STUDENT ||--o{ CLASS_TIME : "수강 시간표"
    STUDENT ||--o{ AVAILABILITY_EXCEPTION : "날짜별 예외"
    STUDENT ||--o{ STUDENT_NOTE : "특이사항(학기당 1건)"
    STUDENT ||--o{ WORK_SCHEDULE : "배정"
    STUDENT ||--o{ SUBSTITUTE_REQUEST : "요청·대타"
    STUDENT ||--o{ COURSE_TA : "TA 배정"

    JOB_POSTING ||--o{ APPLICATION : "접수"

    SCHEDULE_BATCH ||--o{ WORK_SCHEDULE : "배정 묶음"
    SCHEDULE_BATCH ||--o{ CHAT_SESSION : "현재 draft 캐시"

    WORK_SCHEDULE ||--o{ SUBSTITUTE_REQUEST : "반영 위치 포인터"
    SUBSTITUTE_REQUEST ||--o| SUBSTITUTE_AI_CHECK_CACHE : "AI 적합성 검사 캐시"

    CHAT_SESSION ||--o{ CHAT_MESSAGE : "대화"

    COURSE ||--o{ COURSE_MEETING : "주간 수업 시간"
    COURSE ||--o{ COURSE_TA : "TA 배정"
```

`CLARIFICATION_ANSWER`는 학생·부서 어느 쪽도 FK로 걸지 않습니다 (`target_type`+`target_id` 다형 참조, 아래 5절 참고).

---

## 2. 조직 · 계정

```mermaid
erDiagram
    DEPARTMENT ||--o{ STAFF : "소속"
    STUDENT ||--o{ STUDENT_CAREER : "경력"
    STUDENT ||--o{ STUDENT_LANGUAGE : "어학"
    STUDENT ||--o{ STUDENT_CERTIFICATE : "자격증"

    DEPARTMENT {
        int department_id PK
        string name
        int weekly_hour_limit "부서 자체 운영 상한 — 법정 상한과 별개"
        int headcount_to
        bool course_ta_enabled "수업 조교 편성을 쓰는 부서인지 (#173, 기본 false)"
    }
    STAFF {
        string staff_id PK "사번"
        string name
        int department_id FK
        string email
        string phone
        string password_hash
    }
    STUDENT {
        string student_id PK "학번"
        string name
        string department_name "학과(전공) — SAINT 표기 그대로"
        string phone
        string password_hash
        string funding_type "gyobi(교비) | gukga(국가) — SCHEDULER_SPEC 2.1"
        date active_from "활동 기간, NULL이면 합격 공고 기간에서 파생"
        date active_until
        date tenure_start_date "근속 시작일 — AI 검토 경력자 비교 기준 (#79)"
        bool is_team_lead "학생팀장 — 현재는 표시용, 권한과 미연결"
        string email "이하 SAINT 학적 정보 (#122)"
        string photo_url "/assets/students/{학번}.jpg"
        string enroll_status "재학 | 휴학 | 수료 등"
        date status_changed_at "학적변동일자"
        string degree_course "학사 | 석사 | 박사"
        string nationality
        string advisor "지도교수"
        int grade_year "학년"
        int semester "학기"
        int completed_semesters "이수학기"
        date birth_date
        jsonb interests "관심 분야 태그 목록 (#122)"
    }
    STUDENT_CAREER {
        int career_id PK
        string student_id FK
        int sort_order "화면 정렬 순서 보존"
        string career_type "교내근로 | 인턴 | 대외활동 | 동아리 | 봉사 | 아르바이트 | 기타"
        string organization
        string role
        date period_start
        date period_end
        text detail
    }
    STUDENT_LANGUAGE {
        int language_id PK
        string student_id FK
        int sort_order
        string test_name "TOEIC, OPIc 등"
        string score "숫자가 아닐 수 있음 (OPIc IH 등)"
        string grade
        date acquired_at
    }
    STUDENT_CERTIFICATE {
        int certificate_id PK
        string student_id FK
        int sort_order
        string name
        string issuer
        string registration_number
        date acquired_at
    }
```

경력·어학·자격증(#122)은 화면 전체 저장 방식이라 갱신 시 학생별로 전량 교체합니다 (`cascade="all, delete-orphan"`).

---

## 3. 공고 · 지원

```mermaid
erDiagram
    DEPARTMENT ||--o{ JOB_POSTING : "게시"
    STAFF ||--o{ JOB_POSTING : "작성"
    JOB_POSTING ||--o{ APPLICATION : "접수"
    STUDENT ||--o{ APPLICATION : "지원"
    STAFF ||--o{ APPLICATION : "검토"

    JOB_POSTING {
        int posting_id PK
        int department_id FK
        string created_by FK "staff_id"
        string title
        text description
        text qualification
        date upload_date
        date deadline
        string status "모집중 | 마감"
        string category "도서관 | 학과별 사무실 | 교내 부서 (#55)"
        date period_start "근로 기간 (#55)"
        date period_end
        int headcount "모집 인원 (#55)"
        int weekly_max_hours "주간 최대 근로시간 (#55)"
        string location "근무 장소 (#55)"
        string contact_email
        string contact_phone
        text work_slots "JSON 배열 문자열, 예: 월-10:00 (#55)"
    }
    APPLICATION {
        int application_id PK
        string student_id FK "UNIQUE(student_id, posting_id)"
        int posting_id FK
        string reviewed_by FK "staff_id"
        text cover_letter "buildCoverLetter 형식 병합 저장 (#19)"
        string status "제출완료 | 검토중 | 합격 | 불합격"
        datetime submitted_at
    }
```

---

## 4. 가능시간 · 부서 정책

```mermaid
erDiagram
    STUDENT ||--o{ AVAILABLE_TIME : "주간 가능시간"
    STUDENT ||--o{ CLASS_TIME : "수강 시간표"
    STUDENT ||--o{ AVAILABILITY_EXCEPTION : "날짜별 예외"
    STUDENT ||--o{ STUDENT_NOTE : "특이사항"
    DEPARTMENT ||--o| DEPARTMENT_POLICY : "운영 정책"

    AVAILABLE_TIME {
        int availability_id PK
        string term "학기 키 2026-2 — NULL은 학기 도입 전 데이터"
        string student_id FK
        int day_of_week "월=1, 일=7"
        time start_time
        time end_time
        int preference "선호도 1=하 2=중 3=상"
        string source "application(합격 시 연동) | manual — REQ-SCHED-012"
    }
    CLASS_TIME {
        int class_time_id PK
        string term
        string student_id FK
        int day_of_week
        time start_time
        time end_time
    }
    AVAILABILITY_EXCEPTION {
        int exception_id PK
        string student_id FK
        date exception_date
        string exception_type "UNAVAILABLE | AVAILABLE"
        time start_time "UNAVAILABLE에서 둘 다 NULL이면 하루 종일 불가"
        time end_time
        int preference
    }
    STUDENT_NOTE {
        int note_id PK
        string student_id FK "UNIQUE(student_id, term)"
        string term
        text content "자연어 근무 특이사항 (#185)"
        datetime updated_at
    }
    DEPARTMENT_POLICY {
        int department_policy_id PK
        int department_id FK "unique"
        string availability_mode "weekly_only | weekly_with_unavailable | weekly_with_exceptions"
        string policy_file_key "scheduler/config 정책 파일 키 (#52)"
        string default_term "부서 기본 학기, NULL이면 오늘 기준 (#172)"
        text custom_rules "부서 자연어 운영 규칙, 줄바꿈 구분 (#63)"
        jsonb opening_hours "개관 시간 — semester/vacation x 요일 x 구간 목록"
        jsonb work_slots "부서 정의 근무 슬롯 (#89), 블록별 인원 지정 가능 (#171)"
        int min_per_slot "시간대 기본 최소 인원, NULL이면 정책 파일 값"
        int max_per_slot
        int biweekly_max_hours "부서 2주 교비 총합 상한 (Hard)"
        jsonb soft_weight_scales "페널티 카테고리별 배율, 0이면 해당 제약 off"
    }
```

- `class_time`은 SAINT 학사 연동 전까지 학생이 직접 입력하는 임시 수단(REQ-SCHED-015)이며 선호도 개념이 없습니다. **현재 REQ-SCHED-004는 이 테이블을 참조하지 않고**, 학생이 `available_time`에서 수업 시간을 스스로 빼고 입력하는 것에 의존합니다.
- `student_note`(학생)와 `department_policy.custom_rules`(부서)는 자연어 입력이며 **솔버에 직접 들어가지 않습니다.** 제약으로 번역되는 것만 사람이 확인 후 `available_time.preference` 등으로 구조화하고, 나머지는 AI 검토·챗봇이 읽어 초안의 위반을 지적합니다.
- `availability_mode`가 달라져도 저장 구조는 모든 부서 동일합니다 — 모드 전환에 마이그레이션이 필요 없습니다.

---

## 5. 근무표 · 대타

```mermaid
erDiagram
    SCHEDULE_BATCH ||--o{ WORK_SCHEDULE : "배정 묶음"
    WORK_SCHEDULE ||--o{ SUBSTITUTE_REQUEST : "반영 위치 포인터"
    SUBSTITUTE_REQUEST ||--o| SUBSTITUTE_AI_CHECK_CACHE : "적합성 검사 캐시"

    SCHEDULE_BATCH {
        int batch_id PK
        int department_id FK
        date period_start "생성 대상 기간"
        date period_end
        string status "draft | confirmed"
        datetime created_at
        string created_by "직원 또는 학생팀장 — staff FK 없음 (#156)"
        jsonb solver_summary "shortages·penalty_summary·per_student 스냅샷 (#63)"
    }
    WORK_SCHEDULE {
        int schedule_id PK
        int batch_id FK "NOT NULL — 모든 행이 배치 소속 (#48)"
        string student_id FK
        int department_id FK
        date work_date "날짜 단위 배정 — REQ-SCHED-010"
        time start_time
        time end_time
    }
    SUBSTITUTE_REQUEST {
        int request_id PK
        int schedule_id FK "현재 반영 위치를 가리키는 가변 포인터"
        date work_date "이하 배치 비의존 좌표 (#229)"
        int department_id FK
        time start_time "요청 구간 — 30분 배수, 근무 시간 안 (#123 부분 대타)"
        time end_time
        string requester_id FK "student_id"
        string substitute_id FK "student_id"
        string approved_by FK "staff_id"
        string status
        text reason "요청자 사유"
        text reject_reason "직원 반려 사유 — REQ-SUB-008"
        datetime requested_at
    }
    SUBSTITUTE_AI_CHECK_CACHE {
        int cache_id PK
        int request_id FK "unique"
        string substitute_student_id FK "student_id"
        string overall_verdict
        jsonb findings
        jsonb clarification_requests
        datetime computed_at
    }
```

- `schedule_batch`는 근무표 생성 1회 실행 단위입니다(REQ-SCHED-009). `generate`가 `draft` 배치를 만들고, 같은 부서·기간으로 다시 생성하면 기존 draft만 교체합니다 (`confirmed` 배치는 보존).
- **대타 요청은 배치가 아니라 좌표로 성립합니다** (#229): `(department_id, work_date, start_time, end_time, requester_id, substitute_id)`. 승인된 대타는 사람이 확정한 사실이고 근무표 배치는 재생성될 수 있는 계획이기 때문입니다. 좌표가 없던 시절에는 재확정으로 근무 행이 내려가면 승인 사실이 갈 곳을 잃었습니다 (#178).
- `substitute_request.schedule_id`는 진실이 아니라 **현재 상태의 캐시**입니다. 승인 시 원 근무 행을 요청 구간으로 좁혀 대타에게 넘기고(`_split_schedule`), 재확정 시 새 배치의 행을 가리키도록 갱신합니다(`_materialize_confirmed_rows`).
- `work_date`·`department_id`·`start_time`·`end_time`은 기존 행 보정(`schema_patches`) 때문에 nullable이며, 값 필수 여부는 API 레이어에서 지킵니다.
- AI 적합성 검사 캐시는 무효화 플래그를 두지 않고, 조회 시점에 `clarification_answer.answered_at > computed_at` 인 행이 있는지로 매번 판단합니다. 요청당 최신 1건만 유지(교체)하며 이력 보존 대상이 아닙니다.

---

## 6. AI 검토 · 시간표 챗봇

```mermaid
erDiagram
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "대화"
    STAFF ||--o{ CLARIFICATION_ANSWER : "답변"

    CLARIFICATION_ANSWER {
        int clarification_answer_id PK
        string target_type "student | department | rule_interpretation"
        string target_id "학생은 student_id, 부서는 department_id를 문자열로 — FK 없음"
        string field_name "예: tenure_start_date, biweekly_max_hours"
        text question
        text answer
        string answered_by FK "staff_id"
        datetime answered_at
        datetime applied_at "사람이 실제 데이터에 수동 반영했음을 표시"
    }
    CHAT_SESSION {
        int session_id PK
        int department_id FK
        date period_start "세션은 (부서, 기간)에 고정 — batch_id는 바뀜"
        date period_end
        int batch_id FK "현재 draft 캐시, 매 메시지마다 재확인"
        string created_by "직원 또는 학생팀장 — staff FK 없음 (#156)"
        jsonb session_weight_scales "이 세션에서만 적용되는 soft 배율 (#136)"
        datetime created_at
        datetime last_active_at
    }
    CHAT_MESSAGE {
        int message_id PK
        int session_id FK
        string role "user | assistant"
        text content
        jsonb tool_calls "[{tool, args, result, inverse?}] — 읽기 툴은 inverse 없음"
        string turn_status "applied | reverted | partial_failed | budget_exceeded"
        datetime created_at
    }
```

- `clarification_answer`는 **로그일 뿐**입니다 — 학생·부서의 실제 컬럼을 자동 갱신하지 않습니다. `target_type`이 학생/부서/규칙 해석으로 나뉘고 두 PK 타입이 달라 하나의 FK로 묶을 수 없어 다형 참조를 씁니다.
- 챗봇 세션을 `batch_id`가 아니라 `(부서, 기간)`에 고정하는 이유: 재생성이 draft 배치를 삭제 후 새로 만들어 `batch_id`가 매번 바뀌기 때문입니다.
- 그 턴에 무엇을 조회·수정했는지는 분류자가 아니라 `tool_calls` 목록이 말해줍니다. 쓰기 툴 항목의 `inverse`가 되돌리기(#135)의 근거입니다.

설계 문서: [review_clarification_설계문서.md](review_clarification_설계문서.md), [대타_ai적합성검사_설계문서.md](대타_ai적합성검사_설계문서.md), [시간표검토_챗봇_설계문서.md](시간표검토_챗봇_설계문서.md)

---

## 7. 개설 과목 · 수업 조교(TA)

```mermaid
erDiagram
    COURSE ||--o{ COURSE_MEETING : "주간 수업 시간"
    COURSE ||--o{ COURSE_TA : "TA 배정"
    STUDENT ||--o{ COURSE_TA : "TA 배정"
    DEPARTMENT ||--o{ COURSE_TA : "TA 근무 부서"

    COURSE {
        int course_id PK
        string term "학기 키 2026-2 — UNIQUE(term, course_code, section)"
        string course_code "과목번호 (예: AAT3005)"
        string section "분반 (예: 01)"
        string title
        string department_name "개설 학과 — 근로 부서와 다른 축"
        string credits "3.0 형태 그대로"
        string professor "여러 명이면 쉼표로 이어진 원문"
        int enrolled_count "수강생 수 — TA 인원 판단 근거"
        string room
    }
    COURSE_MEETING {
        int meeting_id PK
        int course_id FK
        int day_of_week "월=1, 일=7"
        time start_time "이 시간이 곧 그 과목 TA의 근무 시간"
        time end_time
        string room
    }
    COURSE_TA {
        int course_ta_id PK
        int course_id FK "UNIQUE(course_id, student_id)"
        string student_id FK
        int department_id FK "이 배정이 어느 근로 부서의 근무인지"
        string assigned_by "직원 또는 학생팀장 — staff FK 없음"
        datetime assigned_at
    }
```

TA 부서는 근무 단위가 시간대가 아니라 **과목**입니다. 같은 시간에 여러 과목이 열리므로(예: 금 10:30\~13:15에 4과목) 슬롯별 인원(#171)만으로는 "과목마다 TA 1명"을 표현할 수 없어 배정 축을 따로 뒀습니다 (#173).

**TA 배정은 솔버가 풀지 않습니다** — 누가 어느 수업에 들어갈지는 전공 적합성·수강 이력 같은 과목 사정이 좌우해서 담당자가 화면에서 직접 배정하고, 겹침·과목 수·근로시간 검증만 API에서 합니다. `department.course_ta_enabled`가 켜진 부서(학과·학부 사무실)만 이 화면을 씁니다.

---

## 8. 전역 규칙 · 비고

- **"부서 소속 근로 학생" 판별**: 별도 소속 테이블 없이 **해당 부서 공고에 `status="합격"`인 `application`** 으로 판별합니다 (부서 가능시간 수합 API, 스케줄러 DB 로더 공통).
- **학기 키(`term`)**: `"2026-1" | "2026-summer" | "2026-2" | "2026-winter"`. `available_time`·`class_time`·`student_note`·`course`가 같은 표기를 씁니다. NULL은 학기 도입 전 데이터입니다.
- **요일 표기**: 월=1 … 일=7. `available_time`·`class_time`·`course_meeting` 공통.
- **`work_schedule`은 날짜(`work_date`) 단위**이며 모든 행이 `schedule_batch`에 속합니다 (#48, REQ-SCHED-010). 공휴일·시험 기간에 따라 주차마다 개관 시간과 배정이 달라져 요일 반복으로는 표현할 수 없습니다.
- **`staff` FK를 걸지 않는 "작성자" 컬럼들** — `schedule_batch.created_by`, `chat_session.created_by`, `course_ta.assigned_by`. 직원일 수도 있고 학생팀장일 수도 있기 때문입니다 (#156).
- **마이그레이션 도구 부재**: alembic 등 도입 전까지 `Base.metadata.create_all`이 새 테이블만 만들고 기존 테이블에 컬럼을 추가하지 않으므로, 모델에 컬럼을 추가할 때 **`backend/app/schema_patches.py`의 목록에도 함께 올려야 합니다.** 앱 시작 시(`main.py`)와 시드 스크립트 양쪽에서 보정이 실행됩니다. 기존 행에 값을 채워야 하면 `_BACKFILLS`에 멱등한 UPDATE를 함께 올립니다.
- `student.funding_type` 값은 스케줄러 도메인 `FundingType`(`gyobi`/`gukga`)과 동일하며, 교비/국가별 시간 상한·휴강일 규칙 차이는 [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 2.1 및 HC-TIME을 참조합니다.
