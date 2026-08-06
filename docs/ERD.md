# ERD

`backend/app/models.py` 기준 (소스가 진실, 이 문서는 요약). 마지막 갱신: 2026-07-30, funding_type 컬럼 추가 시점.

```mermaid
erDiagram
    DEPARTMENT ||--o{ STAFF : "소속"
    DEPARTMENT ||--o{ JOB_POSTING : "게시"
    DEPARTMENT ||--o| DEPARTMENT_POLICY : "가능시간 수합 정책"
    DEPARTMENT ||--o{ WORK_SCHEDULE : "근무표"
    STAFF ||--o{ JOB_POSTING : "작성 (created_by)"
    STAFF ||--o{ APPLICATION : "검토 (reviewed_by)"
    STUDENT ||--o{ APPLICATION : "지원"
    STUDENT ||--o{ AVAILABLE_TIME : "주간 가능시간"
    STUDENT ||--o{ AVAILABILITY_EXCEPTION : "날짜별 예외"
    STUDENT ||--o{ WORK_SCHEDULE : "배정"
    JOB_POSTING ||--o{ APPLICATION : "접수"
    WORK_SCHEDULE ||--o{ SUBSTITUTE_REQUEST : "대타 요청"

    DEPARTMENT {
        int department_id PK
        string name
        int weekly_hour_limit
        int headcount_to
    }
    STUDENT {
        string student_id PK "학번"
        string name
        string department_name
        string phone
        string password_hash
        string funding_type "gyobi(교비) | gukga(국가) — SCHEDULER_SPEC 2.1"
    }
    STAFF {
        string staff_id PK "사번"
        string name
        int department_id FK
        string email
        string phone
        string password_hash
    }
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
        string student_id FK
        int posting_id FK
        string reviewed_by FK "staff_id"
        text cover_letter "buildCoverLetter 형식 병합 저장 (#19)"
        string status "제출완료 | 검토중 | 합격 | 불합격"
        datetime submitted_at
    }
    AVAILABLE_TIME {
        int availability_id PK
        string student_id FK
        int day_of_week "월=1 ~ 일=7"
        time start_time
        time end_time
        int preference "선호도 1=하 2=중 3=상"
    }
    AVAILABILITY_EXCEPTION {
        int exception_id PK
        string student_id FK
        date exception_date
        string exception_type "UNAVAILABLE | AVAILABLE"
        time start_time
        time end_time
        int preference
    }
    DEPARTMENT_POLICY {
        int department_policy_id PK
        int department_id FK "unique"
        string availability_mode "weekly_only | weekly_with_unavailable | weekly_with_exceptions"
    }
    WORK_SCHEDULE {
        int schedule_id PK
        string student_id FK
        int department_id FK
        int day_of_week
        time start_time
        time end_time
    }
    SUBSTITUTE_REQUEST {
        int request_id PK
        int schedule_id FK
        string requester_id FK "student_id"
        string substitute_id FK "student_id"
        string approved_by FK "staff_id"
        string status
        text reason
    }
```

## 비고

- `student.funding_type`: 근로 장학 구분. 값은 스케줄러 도메인 `FundingType`(`gyobi`/`gukga`)과 동일하며, 교비/국가별 시간 상한·휴강일 규칙 차이는 [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 2.1 및 HC-TIME 참조. 스케줄러 DB 로더(#36) 연동 시 이 컬럼이 기준이 된다.
- "부서 소속 근로 학생" 판별: 별도 소속 테이블 없이 **해당 부서 공고에 `status="합격"`인 APPLICATION**으로 판별한다 (부서 가능시간 수합 API, 스케줄러 DB 로더 공통).
- `work_schedule`는 요일 기반이며, develop의 #48(feat-schedule-schema)에서 날짜 기반(`work_date`) + `schedule_batch`(draft→confirmed) 구조로 재설계가 진행 중 — 머지되면 이 문서도 갱신 필요.
- 마이그레이션 도구(alembic 등) 도입 전까지 스키마 변경 시 `scripts/seed_mock_data.py`의 ALTER 보정처럼 수동 대응이 필요하다.
