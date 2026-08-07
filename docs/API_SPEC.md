# API 명세

---

## 이 문서를 읽는 법

이 문서는 "요구명세서"와 "API 명세서"를 따로 만들지 않고, **API 하나마다 두 내용을 짝지어** 정리했습니다.

- **요구사항**: 이 API가 반드시 지켜야 하는 규칙 (비즈니스 로직). ID는 `REQ-분류-번호` 형식
- **API 명세**: 실제로 프론트엔드가 호출할 주소, 보내야 할 값, 돌려받는 값

섹션은 실제 데이터가 흐르는 순서(인증 → 공고 → 지원 → 근무표 → 대타)대로 배치했습니다. 

**공통 규칙**: 로그인이 필요한 API는 요청 헤더에 `Authorization: Bearer {토큰}`을 포함해야 합니다. 표에서는 이를 "인증"이라고 표시합니다.

---

## 0. 전체 흐름 한눈에 보기

학생과 직원이 로그인한 뒤, 아래 순서로 시스템을 사용하게 됩니다.

```
[인증] 로그인
   ↓
[공고] 직원이 등록 → 학생이 조회
   ↓
[지원] 학생이 지원서 제출 → 직원이 검토·합격 처리
   ↓
[근무표] 학생이 가능시간 입력 → 시스템이 최적 근무표 생성
   ↓
[대타] 학생이 대타 요청 → 후보자 수락 → 직원이 최종 승인
```

---

## 1. 인증 (로그인)

### 설명

학생용 화면과 관리자용 화면을 구분하려면, "지금 접속한 사람이 학생인지 직원인지"를 시스템이 알아야 합니다. 로그인을 하면 그 증거로 토큰(토큰 = 임시 출입증)을 하나 받고, 이후 모든 요청에 이 출입증을 같이 제출합니다. 시스템은 이 출입증만 보고 "아, 이 사람은 학생이구나" 혹은 "직원이구나"를 판단해서 권한을 다르게 적용합니다.

### 요구사항

| ID | 요구사항 |
| --- | --- |
| REQ-AUTH-001 | 학생과 직원은 각자의 계정(학번/직원번호 + 비밀번호)으로 로그인할 수 있어야 한다 |
| REQ-AUTH-002 | 로그인 성공 시 역할(학생/직원) 정보가 담긴 토큰을 발급해야 한다 |
| REQ-AUTH-003 | 비밀번호는 원문이 아닌 암호화된 형태(password_hash)로 저장되어야 한다 |
| REQ-AUTH-004 | 학생 전용 API에 직원 토큰으로 접근하거나 그 반대의 경우 접근을 거부해야 한다 |
| REQ-AUTH-005 | 본인 데이터가 아닌 다른 학생의 데이터(근무표, 지원 내역 등)는 조회할 수 없어야 한다 |

### API 명세

#### `POST /api/auth/login`

로그인하고 토큰을 발급받는다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 불필요 |
| Request | `{ "id": "20221234", "password": "****", "role": "student" }` (role은 "student" 또는 "staff") |
| Response 200 | `{ "token": "eyJhbGc...", "role": "student", "name": "김서강", "department_id": null, "department_name": null }` — `department_id`/`department_name`은 직원 로그인 시 소속 부서 (학생은 null, #55) |
| Response 401 | `{ "error": "아이디 또는 비밀번호가 올바르지 않습니다." }` |

---

## 2. 공고 (JobPosting)

### 설명

"공고"는 부서가 올리는 채용 글입니다. 직원은 올릴 수 있고(등록), 학생은 볼 수만 있습니다(조회·검색). 이 구분이 실제로 지켜지도록, 등록 API는 직원 토큰이 있을 때만 동작하게 만들어야 합니다.

### 요구사항

| ID | 요구사항 |
| --- | --- |
| REQ-POST-001 | 직원만 공고를 등록할 수 있다 (학생은 등록 불가) |
| REQ-POST-002 | 학생과 직원 모두 공고 목록을 조회·검색할 수 있다 |
| REQ-POST-003 | 검색은 부서(department_id), 모집 상태(모집중/마감) 조건으로 가능해야 한다 |
| REQ-POST-004 | 마감일이 지난 공고는 상태가 자동으로 "마감"으로 표시되어야 한다 |
| REQ-POST-005 | 공고 등록 시 등록한 직원(created_by)이 함께 저장되어야 한다 |
| REQ-POST-006 | 공고 등록 시 업로드 날짜(upload_date)가 서버에서 자동으로 기록되어야 한다 |
| REQ-POST-007 | 직원은 본인 소속 부서의 공고만 등록할 수 있으며, 타 부서 공고 등록 시도 시 403을 반환한다 |
| REQ-POST-008 | 공고 응답에는 화면 렌더링에 필요한 상세 필드(카테고리·근로기간·모집인원·주간 최대시간·근무지·담당 연락처·근무 시간대)가 포함되어야 한다 (#19, #55) |
| REQ-POST-009 | 학생 요청자의 공고 응답에는 본인 지원 여부(applied·application_id)와 가능시간-근무시간대 겹침(schedule_match)이 개인화되어 포함되어야 한다 (#55) |
| REQ-POST-010 | 직원은 본인 소속 부서의 공고를 수정(마감 처리 포함)할 수 있다 (PATCH, 타 부서는 403) (#55) |

#### API 명세

#### `GET /api/postings`

공고 목록을 조회·검색한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생/직원 모두 가능) |
| Request (query params) | `department_id`(선택), `status`(선택, 예: "모집중") |
| Response 200 | `[{ "posting_id": 1, "title": "도서관 근로 모집", "department_name": "로욜라도서관", "upload_date": "2026-07-01", "deadline": "2026-08-15", "status": "모집중", "category": "도서관", "period_start": "2026-08-03", "period_end": "2026-11-27", "headcount": 1, "weekly_max_hours": 15, "applied": false, "application_id": null, "schedule_match": true }, ...]` — `applied`/`application_id`/`schedule_match`는 학생 요청자에게만 값이 채워짐 (직원은 null) |

#### `GET /api/postings/{posting_id}`

공고 상세 정보를 조회한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 |
| Request (path) | posting_id |
| Response 200 | `{ "posting_id": 1, "department_id": 2, "department_name": "...", "title": "...", "description": "...", "qualification": "...", "upload_date": "2026-07-01", "deadline": "...", "status": "...", "category": "도서관", "period_start": "2026-08-03", "period_end": "2026-11-27", "headcount": 1, "weekly_max_hours": 15, "location": "로욜라도서관 1층", "contact_email": "library@sogang.ac.kr", "contact_phone": "02-705-7100", "work_slots": ["화-14:00", "목-14:00"], "applied": false, "application_id": null }` — `work_slots`는 "요일-HH:MM"(1시간 단위) 배열 |
| Response 404 | `{ "error": "해당 공고를 찾을 수 없습니다." }` |

#### `POST /api/postings`

새 공고를 등록한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만) |
| Request | `{ "department_id": 3, "title": "...", "description": "...", "qualification": "...", "deadline": "2026-08-15", "category": "교내 부서", "period_start": "2026-09-01", "period_end": "2026-12-18", "headcount": 2, "weekly_max_hours": 15, "location": "...", "contact_email": "...", "contact_phone": "...", "work_slots": ["월-10:00"] }` — deadline 이후 필드는 모두 선택 |
| Response 201 | `{ "posting_id": 5, "status": "모집중", "upload_date": "2026-07-02", "created_by": "S001" }` |
| Response 403 | `{ "error": "직원만 공고를 등록할 수 있습니다." }` |

#### `PATCH /api/postings/{posting_id}`

공고를 수정한다 — 전달된 필드만 반영 (마감 처리: `{ "status": "마감" }`). (직원 전용, REQ-POST-010)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서 공고만) |
| Request | `{ "status": "마감" }` 또는 수정할 필드 조합 (`title`, `description`, `qualification`, `deadline`, `status`, `category`, `period_start`, `period_end`, `headcount`, `weekly_max_hours`, `location`, `contact_email`, `contact_phone`, `work_slots`) |
| Response 200 | 공고 상세와 동일한 형태 |
| Response 403 | `{ "error": "본인 소속 부서의 공고만 수정할 수 있습니다." }` |
| Response 404 | `{ "error": "해당 공고를 찾을 수 없습니다." }` |

---

## 3. 지원 (Application)

### 설명

학생이 공고에 지원서를 내는 부분입니다. 학생은 자기 지원 내역만 볼 수 있고, 직원은 자기 부서 공고에 들어온 지원자 전체를 볼 수 있습니다.

> **참고**: `match_score`(적합도 점수) 자동 계산 기능은 팀 논의를 거쳐 MVP 범위에서 완전히 제외하기로 확정되었습니다 (REQ-APP-003, REQ-APP-005 관련).

### 요구사항

| ID | 요구사항 |
| --- | --- |
| REQ-APP-001 | 학생은 마감일이 지난 공고에는 지원할 수 없다 |
| REQ-APP-002 | 동일 학생은 동일 공고에 중복 지원할 수 없다 |
| REQ-APP-003 | ~~지원서 제출 시 적합도 점수(match_score)가 자동 계산되어 저장되어야 한다~~ **(제외됨 — MVP 범위 외)** |
| REQ-APP-004 | 학생은 본인의 지원 내역만 조회할 수 있다 |
| REQ-APP-005 | 직원은 담당 부서 공고에 들어온 지원자 목록을 조회할 수 있다 (~~및 적합도 점수~~ **제외됨 — MVP 범위 외**) |
| REQ-APP-006 | 지원 상태(합격/불합격) 변경은 직원만 할 수 있으며, 처리한 직원(reviewed_by)이 기록되어야 한다 |

### API 명세

#### `POST /api/applications`

지원서를 제출한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "posting_id": 1, "cover_letter": "저는 도서관에서..." }` |
| Response 201 | `{ "application_id": 15, "status": "제출완료", "submitted_at": "2026-07-02T14:30:00" }` |
| Response 400 | `{ "error": "마감된 공고입니다." }` |
| Response 404 | `{ "error": "해당 공고를 찾을 수 없습니다." }` (posting_id가 존재하지 않는 경우) |
| Response 409 | `{ "error": "이미 지원한 공고입니다." }` |

#### `GET /api/applications/me`

본인의 지원 내역을 조회한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만, 토큰에서 student_id 추출) |
| Response 200 | `[{ "application_id": 15, "posting_id": 2, "posting_title": "도서관 근로 모집", "department_name": "로욜라도서관", "cover_letter": "...", "status": "검토중", "submitted_at": "2026-07-08T11:20:00", "period_start": "2026-08-03", "period_end": "2026-11-27" }, ...]` |

#### `GET /api/applications/posting/{posting_id}`

특정 공고에 지원한 학생 목록을 조회한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만) |
| Response 200 | `[{ "application_id": 15, "student_name": "김서강", "status": "검토중" }, ...]` |
| Response 404 | `{ "error": "해당 공고를 찾을 수 없습니다." }` (posting_id가 존재하지 않는 경우) |

#### `PATCH /api/applications/{application_id}/status`

지원 상태를 변경한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만) |
| Request | `{ "status": "합격" }` |
| Response 200 | `{ "application_id": 15, "status": "합격", "reviewed_by": "S001" }` |

> `"합격"`으로 변경하면 그 학생의 지원서에 체크된 근무 가능 시간이 자동으로 가능시간 수합에 연동됩니다 (REQ-SCHED-012). 이미 가능시간이 있는 학생은 덮어쓰지 않습니다.

---

## 4. 근무표 (AvailableTime / WorkSchedule)

### 설명

합격한 학생이 "저는 이 시간에 근무 가능해요"를 입력하면(가능시간), 시스템이 부서 내 모든 학생의 가능시간을 모아서 규칙(주 14시간 이내, 수업시간 제외 등)에 맞는 근무표를 자동으로 짜줍니다(확정 근무표). "가능시간"과 "확정 근무표"는 서로 다른 표라는 걸 지난번 ERD 설명에서 다뤘던 것처럼, API도 이 둘을 별도로 나눠서 만듭니다.

### 요구사항

| ID | 요구사항 |
| --- | --- |
| REQ-SCHED-001 | 학생은 본인의 근무 가능 시간을 요일·시간대별로 입력할 수 있다 |
| REQ-SCHED-002 | 직원은 부서 소속 학생들의 가능 시간을 한 번에 조회(수합)할 수 있다 |
| REQ-SCHED-003 | 근무표 생성 시 주간 근로시간 상한을 초과할 수 없다 (hard constraint). 교비 주 14시간, 국가 주 20시간(학기)/40시간(방학) — 세부 규칙은 [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) HC-TIME 참조 |
| REQ-SCHED-004 | 근무표 생성 시 학생의 수업 시간과 겹치는 시간대는 배정에서 제외되어야 한다 (hard constraint) |
| REQ-SCHED-005 | 가능하면 학생의 선호 시간대(preference)를 우선 배정한다 (soft constraint) |
| REQ-SCHED-006 | 근무표 생성은 직원만 실행할 수 있으며, 본인 소속 부서에 대해서만 실행할 수 있다 |
| REQ-SCHED-007 | 학생은 본인의 확정 근무표만 조회할 수 있고, 직원은 부서 전체 근무표를 조회할 수 있다 |
| REQ-SCHED-008 | 기존에 근로 중이던 학생의 근무 일정은 알고리즘을 거치지 않고 직원이 수동으로 등록할 수 있다 |
| REQ-SCHED-009 | 생성 결과는 확정이 아닌 초안이며, 담당자가 판단할 수 있도록 근거(최소 인원 미달 슬롯과 그 슬롯의 가능 후보, 제약 위반 내역, 개인별 근무 시간 집계)를 함께 반환해야 한다 |
| REQ-SCHED-010 | 근무 배정은 요일 반복이 아니라 날짜(date) 단위로 관리한다 (공휴일·시험 기간 등으로 주차마다 개관 시간과 배정이 달라지기 때문) |
| REQ-SCHED-011 | 확정은 생성 초안(draft 배치)을 담당자가 고른 배정안으로 확정(confirmed)하는 것이며, 같은 부서·기간을 다시 확정하면 이전 확정본은 삭제하지 않고 superseded로 내려 이력을 보존한다 (#56) |
| REQ-SCHED-012 | 신규 선발 학생의 근무 가능 시간은 지원서에 체크한 시간을 그대로 수합에 연동한다 (같은 정보를 두 번 받지 않기 위함). 이미 가능시간이 있는 학생은 덮어쓰지 않으며, 수합 응답의 `source`로 지원서 연동분(`application`)과 직접 입력분(`manual`)을 구분한다 (#56) |
| REQ-SCHED-013 | 부서 개관 시간대(30분 단위)와 시간대별 최소·최대 배정 인원은 담당자가 직접 설정할 수 있으며, 저장 이후의 근무표 생성은 정책 파일이 아니라 그 값을 기준으로 한다. 개관 시간은 하루가 여러 구간으로 끊기는 경우(점심 휴관 등)도 표현할 수 있어야 한다 |

### API 명세

#### `POST /api/availability`

근무 가능 시간을 입력한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "day_of_week": 1, "start_time": "14:00", "end_time": "18:00", "preference": 3 }` |
| Response 201 | `{ "availability_id": 22 }` |

- `day_of_week`: 월=1 ~ 일=7 (`date.isoweekday()`와 동일)
- `preference`: 선호도 **1=하 / 2=중 / 3=상** (숫자가 클수록 선호). 근무표 생성은 **3만 '근무 희망'으로 취급**해 우선 배정하고(SC-PREF-1), 1~2는 "가능하지만 희망은 아님"으로 본다

#### `GET /api/availability/department/{department_id}`

부서 소속 학생들의 가능 시간을 전체 수합해서 조회한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `[{ "student_id": "20221234", "student_name": "김서강", "day_of_week": 1, "start_time": "14:00:00", "end_time": "18:00:00", "source": "application" }, ...]` — `day_of_week`는 월=1~일=7 정수, `source`는 `"application"`(지원서 연동) 또는 `"manual"`(직접 입력) (REQ-SCHED-012) |

#### `POST /api/availability/department/{department_id}/import-from-applications`

부서 합격자의 지원서 체크 시간(`cover_letter`의 "[근무 가능 시간]" 섹션)을 가능시간 수합에 연동한다. (직원 전용, REQ-SCHED-012)

합격 처리(`PATCH /api/applications/{id}/status` → `"합격"`) 시 자동으로 수행되며, 이 엔드포인트는 그 이전에 합격한 학생을 담당자가 화면에서 다시 연동할 때 쓴다. 이미 가능시간이 있는 학생은 건너뛴다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `{ "imported_students": 2, "imported_intervals": 5, "results": [{ "student_id": "20221234", "student_name": "김서강", "result": "imported", "interval_count": 3 }, ...] }` — `result`는 `"imported"`(새로 연동) / `"already"`(이미 수합돼 건너뜀) / `"no_slots"`(지원서에 시간 없음 → 직접 입력 필요) |
| Response 403 | `{ "error": "본인 소속 부서만 연동할 수 있습니다." }` |

#### `GET /api/schedule/policy/{department_id}`

부서 스케줄링 정책 중 화면이 필요한 부분(개관 시간대·슬롯 길이)을 조회한다. (직원 전용)

담당자 화면의 시간표 그리드는 학생이 제출한 시간이 아니라 **부서 개관 시간**을 세로축으로 그려야 한다 — 아무도 제출하지 않은 시간대가 비어 있는 채로 보여야 미충원 위험을 알 수 있기 때문이다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `{ "department_id": 2, "department_name": "로욜라도서관 정보서비스팀", "policy_file_key": "library_info_service", "slot_minutes": 30, "grid_start_time": "08:00", "grid_end_time": "22:00", "opening_hours_source": "department", "opening_hours": { "semester": [{ "day_of_week": 1, "ranges": [{ "start_time": "08:00", "end_time": "12:30" }, { "start_time": "13:00", "end_time": "22:00" }] }, ...], "vacation": [...] }, "min_per_slot": 1, "max_per_slot": 2, "staffing_source": "policy_file", "preferred_staffing_max": 2 }` |
| Response 404 | `{ "error": "부서 3의 스케줄링 정책이 없습니다." }` |

- `ranges`가 목록인 이유: 점심 휴관처럼 하루가 여러 구간으로 끊길 수 있습니다. 빈 목록이면 그 요일은 폐관입니다.
- `grid_start_time`·`grid_end_time`은 학기·방학을 통틀어 가장 이른 개관 ~ 가장 늦은 폐관 (화면 그리드의 세로 범위).
- `opening_hours_source`·`staffing_source`: `"department"`= 담당자가 화면에서 설정한 값, `"policy_file"`= 기본 정책 파일 값.
- `min_per_slot`·`max_per_slot`: 개관 시간 한 칸에 배정할 최소·최대 인원. `preferred_staffing_max`는 정책 파일의 선호 인원 중 가장 큰 값으로, 최대 인원을 이보다 낮게 잡으면 그 시간대는 선호 인원을 채울 수 없어 화면에서 안내하는 데 씁니다.

#### `PATCH /api/schedule/policy/{department_id}`

부서 스케줄링 정책을 담당자가 직접 수정한다. (직원 전용, REQ-SCHED-013)

**전달된 항목만 반영합니다.** 설정 항목이 늘어나도 엔드포인트가 불어나지 않도록 하나의 PATCH로 받습니다. 저장 이후의 근무표 생성은 정책 파일이 아니라 이 값을 기준으로 이루어집니다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "opening_hours": { "semester": [{ "day_of_week": 1, "ranges": [{ "start_time": "08:00", "end_time": "12:30" }, { "start_time": "13:00", "end_time": "22:00" }] }, { "day_of_week": 7, "ranges": [] }, ...] }, "min_per_slot": 1, "max_per_slot": 2 }` — 세 항목 모두 선택 |
| Response 200 | `GET /api/schedule/policy/{id}`와 동일한 형태 (저장 후 갱신된 정책) |
| Response 400 | `{ "error": "최소 인원(3명)이 최대 인원(2명)보다 많을 수 없습니다." }` — 한쪽만 보내 저장값과 비교해야 하는 경우 |
| Response 422 | 수정할 항목이 하나도 없는 경우, 30분 단위가 아닌 시각, 시작 ≥ 종료, 같은 요일 안에서 구간이 겹치는 경우, 같은 요일 중복, 인원 범위(0~20) 밖 |
| Response 403 | `{ "error": "본인 소속 부서의 정책만 설정할 수 있습니다." }` |
| Response 404 | `{ "error": "해당 부서의 정책이 없습니다." }` |

- `opening_hours`: 보낸 기간(`semester`/`vacation`)만 교체하므로 학기만 수정하고 방학은 그대로 둘 수 있습니다. 시각은 **30분 단위**(스케줄러 슬롯 길이와 동일)만 허용하며, `ranges`가 빈 목록이면 폐관입니다.
- `min_per_slot`·`max_per_slot`: 시간대별 배정 인원. 최소 인원을 못 채운 칸은 생성이 실패하는 대신 미충원으로 보고됩니다 (그 동작을 결정하는 `allow_understaffing_with_penalty`는 정책 파일 값이며 화면에서 바꾸지 않습니다 — 끄면 생성이 통째로 실패할 수 있습니다).

#### `POST /api/schedule/generate`

제약조건 기반 최적 근무표를 생성한다. (직원 전용, 스케줄링 알고리즘 호출)

생성 단위는 2주를 권장한다 (2주 교비 총합 상한 제약과 정합하고, 동기 응답이 가능한 풀이 시간이 나온다). 결과는 초안이며, 담당자가 근거를 보고 수동 조정 후 확정하는 플로우를 전제로 한다 (REQ-SCHED-009).

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "department_id": 3, "start_date": "2026-06-01", "num_days": 14, "time_limit_seconds": 30, "num_alternatives": 3 }` — `start_date` 필수(월요일 권장), `num_days` 기본 14, `time_limit_seconds` 기본 30(해 하나당), `num_alternatives` 기본 1(최대 5 — 동률 배정안 개수) |
| Response 200 | 아래 응답 구조 참조 |
| Response 404 | `{ "error": "부서 3의 스케줄링 정책이 없습니다." }` |
| Response 409 | `{ "error": "제약조건을 만족하는 근무표를 생성할 수 없습니다. 가능시간 데이터를 확인해주세요." }` — 해가 없음이 **증명**된 경우 |
| Response 504 | `{ "error": "시간 제한 내에 근무표를 생성하지 못했습니다. 기간을 줄이거나 time_limit_seconds를 늘려 다시 시도해주세요." }` — 해 없음이 증명된 것이 아니라 시간 초과 (409와 구분) |

Response 200 구조 (배정 목록 + 담당자 판단 근거):

```json
{
  "status": "OPTIMAL | FEASIBLE",
  "generated_count": 80,
  "schedules": [
    { "student_id": "20221234", "student_name": "김서강", "date": "2026-06-01",
      "day_of_week": "월", "start_time": "14:00", "end_time": "18:00",
      "preferred_match": true }
  ],
  "shortages": [
    { "date": "2026-06-13", "day_of_week": "토", "start_time": "08:00", "end_time": "08:30",
      "required": 1, "assigned": 0,
      "candidates": [{ "student_id": "20221234", "student_name": "김서강" }] }
  ],
  "penalty_summary": { "preference_match": 597, "fair_hours": 120 },
  "per_student": [
    { "student_id": "20221234", "student_name": "김서강", "funding_type": "gyobi",
      "total_hours": 26.5, "weekly_hours": { "2026-W23": 12.5, "2026-W24": 14.0 } }
  ],
  "solve_time_seconds": 18.2,
  "alternatives": [],
  "num_alternatives_found": 1
}
```

- `preferred_match`: 학생이 '희망'으로 제출한 시간대에 배정됐는지
- `alternatives`: `num_alternatives` ≥ 2 요청 시, 페널티 총합이 같거나 더 낮으면서 배치가 실질적으로 다른 대안 배정안 목록 (본문과 동일 구조). 담당자가 비교 후 선택 — 같은 입력이어도 동률 해가 여러 개 존재할 수 있기 때문 ([SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3.6 참조)
- `shortages[].candidates`: 그 슬롯에 올 수 있었던 후보. 비어 있으면 가능자 자체가 없는 것(추가 수합 필요), 있으면 시간 상한 등으로 미배정된 것(수동 조정 검토)
- `penalty_summary`: Soft Constraint별 희생량 — 항목 정의는 [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3.5 참조

#### `POST /api/schedule/confirm`

생성 초안을 확정 근무표로 저장한다. (직원 전용, REQ-SCHED-009/011)

담당자가 화면에서 배정안(본안 또는 `alternatives` 중 하나)을 고른 뒤 그 배정 목록을 그대로 되돌려보낸다. generate가 남긴 draft 배치를 그 목록으로 덮어쓰고 `confirmed`로 올리며, 같은 부서·기간의 이전 확정본은 `superseded`로 내려 이력을 남긴다. 조회는 항상 가장 최근 확정본을 본다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "department_id": 2, "period_start": "2026-08-10", "period_end": "2026-08-23", "schedules": [{ "student_id": "20221234", "date": "2026-08-10", "start_time": "14:00", "end_time": "18:00" }, ...] }` — `schedules`는 generate 응답의 항목을 그대로 사용 |
| Response 201 | `{ "batch_id": 3, "status": "confirmed", "confirmed_count": 40 }` |
| Response 400 | `{ "error": "확정할 배정 내역이 없습니다." }` / `{ "error": "확정 기간을 벗어난 배정이 포함되어 있습니다." }` / `{ "error": "등록되지 않은 학생이 포함되어 있습니다: ..." }` |
| Response 403 | `{ "error": "본인 소속 부서의 근무표만 확정할 수 있습니다." }` |

#### `POST /api/schedule/manual`

기존에 근로 중이던 학생의 근무 일정을 알고리즘 없이 직원이 직접 등록한다. (직원 전용, 초기 데이터 이관용)

요일 반복이 아니라 날짜 단위로 등록한다 (REQ-SCHED-010). 수동 등록분은 부서별 `manual` 배치 하나에 모아 담아, 알고리즘 확정 배치를 다시 만들어도 함께 남는다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "student_id": "20221234", "department_id": 3, "work_date": "2026-08-10", "start_time": "14:00", "end_time": "18:00" }` |
| Response 201 | `{ "schedule_id": 31, "batch_id": 4 }` |
| Response 400 | `{ "error": "해당 학생은 주간 근로시간 14시간을 초과합니다." }` — 상한은 `department.weekly_hour_limit` 기준, 해당 주(월~일)의 확정·수동 배정 합계로 검증 |
| Response 404 | `{ "error": "해당 학생을 찾을 수 없습니다." }` |

#### `GET /api/schedule/me`

본인의 확정 근무표를 조회한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request (query params) | `from_date`(선택), `to_date`(선택) |
| Response 200 | `[{ "schedule_id": 81, "date": "2026-08-10", "day_of_week": "월", "start_time": "14:00:00", "end_time": "18:00:00", "department_name": "로욜라도서관 정보서비스팀" }, ...]` — 확정(`confirmed`)·수동(`manual`) 배치만 포함, 초안(`draft`)과 대체된 확정본(`superseded`)은 제외 |

#### `GET /api/schedule/department/{department_id}`

부서 전체 근무표를 조회한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request (query params) | `from_date`(선택), `to_date`(선택) |
| Response 200 | `[{ "schedule_id": 41, "student_id": "20221234", "student_name": "김서강", "date": "2026-08-10", "day_of_week": "월", "start_time": "14:00:00", "end_time": "18:00:00" }, ...]` — 포함 범위는 `GET /api/schedule/me`와 동일 |
| Response 403 | `{ "error": "본인 소속 부서의 근무표만 조회할 수 있습니다." }` |

---

## 5. 대타 (SubstituteRequest)

### 설명

확정된 근무를 못 나가게 된 학생이 "대타 구해요" 요청을 올리면, 시스템이 그 시간에 가능한 다른 학생을 찾아 알림을 주고, 수락한 학생이 나타나면 마지막으로 직원이 승인 버튼을 눌러야 실제 근무표에 반영됩니다. AI가 후보를 찾아주더라도 최종 결정은 항상 사람(직원)이 한다는 원칙이 이 흐름 전체에 깔려 있습니다.

### 요구사항

| ID | 요구사항 |
| --- | --- |
| REQ-SUB-001 | 학생은 본인에게 확정된 근무에 대해서만 대타 요청을 등록할 수 있다 |
| REQ-SUB-002 | 대타 후보자는 해당 시간대에 근무 가능(가능시간 등록됨)하고 아직 다른 근무가 없는 학생 중에서 탐색되어야 한다 |
| REQ-SUB-003 | 후보 학생은 대타 요청을 수락하거나 거절할 수 있다 |
| REQ-SUB-004 | 후보가 수락해도, 담당 직원이 최종 승인하기 전까지는 근무표에 반영되지 않는다 |
| REQ-SUB-005 | 직원이 승인하면 원래 근무자의 근무표는 취소되고, 대타 학생의 근무표에 해당 시간이 자동으로 추가되어야 한다 |
| REQ-SUB-006 | 승인 처리 시 승인한 직원(approved_by)이 기록되어야 한다 |

### API 명세

#### `POST /api/substitute-requests`

대타 요청을 등록한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "schedule_id": 10, "reason": "시험 일정과 겹침" }` |
| Response 201 | `{ "request_id": 7, "status": "대기" }` |
| Response 403 | `{ "error": "본인의 근무 일정만 대타 요청할 수 있습니다." }` |

#### `GET /api/substitute-requests/{request_id}/candidates`

대타 가능한 후보 학생 목록을 탐색한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생/직원) |
| Response 200 | `[{ "student_id": "20225678", "name": "이서강" }, ...]` |

#### `PATCH /api/substitute-requests/{request_id}/respond`

후보 학생이 대타 요청을 수락/거절한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "substitute_id": "20225678", "response": "수락" }` |
| Response 200 | `{ "request_id": 7, "status": "수락" }` |

#### `PATCH /api/substitute-requests/{request_id}/approve`

담당 직원이 대타 요청을 최종 승인한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만) |
| Response 200 | `{ "request_id": 7, "status": "승인", "approved_by": "S001" }` |
| Response 400 | `{ "error": "아직 후보자가 수락하지 않았습니다." }` |

---

## 6. 요구사항 ID 전체 목록 (빠른 참조용)

| ID | 한 줄 요약 |
| --- | --- |
| REQ-AUTH-001~005 | 로그인, 토큰 발급, 비밀번호 암호화, 역할별 접근 제한 |
| REQ-POST-001~005 | 공고 등록(직원 전용), 조회·검색, 마감 자동 처리 |
| REQ-APP-001~006 | 지원 제출, 중복·마감 방지, 상태 변경 (적합도 자동 계산은 MVP 제외) |
| REQ-SCHED-001~013 | 가능시간 입력·수합(지원서 연동 포함), 제약조건 기반 근무표 생성·확정, 날짜 단위 관리, 조회 권한 |
| REQ-SUB-001~006 | 대타 요청, 후보 탐색, 수락/거절, 직원 최종 승인 |

총 33개 요구사항 / 총 24개 API 엔드포인트로 정리되었습니다.