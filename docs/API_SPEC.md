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
| Response 200 | `{ "token": "eyJhbGc...", "role": "student", "name": "김서강", "department_id": null, "department_name": null, "major": "국어국문학과" }` — `department_id`/`department_name`은 직원 로그인 시 소속 부서 (학생은 null, #55). `major`는 학생 로그인 시 본인 학과 (직원은 null) |
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

#### `GET /api/students/department/{department_id}`

부서 소속(해당 부서 공고에 합격한) 학생의 기본 정보와 활동 기간을 조회한다. (직원 전용, 학생 관리 화면용)

학과·연락처·재원 구분은 이 API가 유일한 노출 경로다. 활동 기간은 담당자가 저장한 값(`student.active_from`/`active_until`, 아래 PATCH)을 우선 쓰고, 저장한 적이 없으면 합격 공고의 `period_start`/`period_end`에서 파생한다 — 여러 공고에 합격한 학생은 가장 이른 시작~가장 늦은 종료로 합치며, 한쪽이라도 기간 미지정 공고가 섞이면 무제한(null)으로 본다 (스케줄러 활동 기간 판정과 동일 의미론).

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `[ { "student_id": "20221234", "name": "김서강", "department_name": "국어국문학과", "phone": "010-1234-5678", "funding_type": "gukga", "active_from": "2026-09-01", "active_until": "2026-12-21", "active_source": "posting" }, ... ]` — 이름순 정렬, 합격자 없으면 빈 배열. `active_source`: `"student"`(담당자 저장값) / `"posting"`(공고 파생) |
| Response 403 | `{ "error": "본인 소속 부서의 학생만 조회할 수 있습니다." }` |

#### `PATCH /api/students/{student_id}/active-period`

학생의 활동 기간을 담당자가 직접 저장한다. (직원 전용, 본인 부서 소속 학생만)

전체 교체 방식이며 null은 그쪽 제한 없음(무제한)이다. 저장 이후 학생 조회와 **근무표 생성의 활동 기간 판정** 모두 공고 기간 대신 이 값을 쓴다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서 학생만) |
| Request | `{ "active_from": "2026-10-01", "active_until": null }` |
| Response 200 | `GET /api/students/department/{id}` 항목과 동일 형태 (`active_source: "student"`) |
| Response 400 | `{ "error": "활동 시작일이 종료일보다 늦습니다." }` |
| Response 403 | `{ "error": "본인 소속 부서의 학생만 수정할 수 있습니다." }` |
| Response 404 | `{ "error": "해당 학생을 찾을 수 없습니다." }` |

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
| REQ-SCHED-011 | 확정은 생성 초안(draft 배치)을 담당자가 고른 배정안으로 확정(confirmed)하는 것이며, 같은 부서에서 기간이 겹치는 확정을 다시 하면 이전 확정본은 삭제하지 않고 superseded로 내려 이력을 보존한다 (#56) |
| REQ-SCHED-012 | 신규 선발 학생의 근무 가능 시간은 지원서에 체크한 시간을 그대로 수합에 연동한다 (같은 정보를 두 번 받지 않기 위함). 이미 가능시간이 있는 학생은 덮어쓰지 않으며, 수합 응답의 `source`로 지원서 연동분(`application`)과 직접 입력분(`manual`)을 구분한다 (#56) |
| REQ-SCHED-013 | 부서 개관 시간대(30분 단위), 시간대별 최소·최대 배정 인원, 2주 근로시간 총합 상한은 담당자가 직접 설정할 수 있고, Soft Constraint 카테고리별 중요도는 선택적으로 조정할 수 있으며, 저장 이후의 근무표 생성은 정책 파일이 아니라 그 값을 기준으로 한다. 개관 시간은 하루가 여러 구간으로 끊기는 경우(점심 휴관 등)도 표현할 수 있어야 한다 |
| REQ-SCHED-014 | 학생은 본인이 이전에 입력했거나 지원서에서 연동된 근무 가능 시간을 언제든 조회하고, 현재 상태 전체를 다시 저장(교체)할 수 있다 |
| REQ-SCHED-015 | 학생은 본인 수업 시간을 직접 입력·조회·교체할 수 있고, 직원은 부서 소속 학생들의 수업 시간을 한 번에 조회할 수 있다 — SAINT 수강신청 자동 연동 전까지의 임시 수단(MVP 제외 항목의 대체). 현재는 화면에 참고용으로 표시되는 용도이며, REQ-SCHED-004의 근무표 생성 로직이 이 값을 제약조건으로 직접 사용하지는 않는다(학생이 가능 시간 입력 시 본인 수업 시간을 스스로 제외하는 것에 의존) |
| REQ-SCHED-016 | AI 검토는 부서가 자연어로 등록한 운영 규칙을 기준으로 draft 배치에 대한 검토 의견(근거·심각도·대안)만 제시하며, 확정 권한이 없다. 규칙 미등록·AI 실패 등 검토 불가 상황에서도 근무표 플로우를 막지 않는다 (#67, #80) |

### API 명세

#### `POST /api/availability`

근무 가능 시간을 입력한다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "day_of_week": 1, "start_time": "14:00", "end_time": "18:00", "preference": 3 }` |
| Response 201 | `{ "availability_id": 22 }` |

- `day_of_week`: 월=1 - 일=7 (`date.isoweekday()`와 동일)
- `preference`: 선호도 **1=하 / 2=중 / 3=상** (숫자가 클수록 선호). 근무표 생성은 **3만 '근무 희망'으로 취급**해 우선 배정하고(SC-PREF-1), 1-2는 "가능하지만 희망은 아님"으로 본다

#### `GET /api/availability/me`

본인이 등록한 근무 가능 시간을 프런트 시간표 그리드가 쓰는 슬롯 형태로 조회한다. (REQ-SCHED-014)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Response 200 | `{ "slots": ["화-09:00", "화-10:00", "목-14:00"] }` — `"요일-HH:00"` 1시간 단위. 저장된 구간은 붙어있는 시간대끼리 하나로 병합돼 있다가 조회 시 다시 슬롯 단위로 펼쳐진다 |

#### `PUT /api/availability/me`

본인의 근무 가능 시간을 통째로 교체한다. (REQ-SCHED-014)

`/profile`(공통 지원서) 화면에서 저장을 누를 때마다 현재 선택 상태 전체를 보낸다 — `POST /api/availability`처럼 계속 누적되지 않고, 기존 등록분(지원서 연동분 포함)을 지운 뒤 새로 저장한다. 맞닿은 슬롯은 하나의 구간으로 병합해 저장하며, 슬롯 체크만으로는 '희망'과 구분할 근거가 없어 `preference`는 지원서 연동(REQ-SCHED-012)과 동일하게 모두 2(보통)로 저장한다. 슬롯별로 선호도를 지정하려면 기존 `POST /api/availability`를 쓴다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "slots": ["화-09:00", "화-10:00", "목-14:00"] }` |
| Response 200 | `{ "slots": ["화-09:00", "화-10:00", "목-14:00"] }` — 저장 후 상태를 그대로 반환 |

#### `GET /api/availability/department/{department_id}`

부서 소속 학생들의 가능 시간을 전체 수합해서 조회한다. (직원 전용)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `[{ "student_id": "20221234", "student_name": "김서강", "day_of_week": 1, "start_time": "14:00:00", "end_time": "18:00:00", "source": "application" }, ...]` — `day_of_week`는 월=1-일=7 정수, `source`는 `"application"`(지원서 연동) 또는 `"manual"`(직접 입력) (REQ-SCHED-012) |

#### `GET /api/availability/department/{department_id}/dates`

기간 내 **날짜별** 가능 시간을 조회한다. (직원 전용 — 학생 관리의 주차별 시간표용)

주간 반복 패턴만 돌려주는 위 API와 달리, 각 날짜에 등록된 예외(그날 불가·추가 가능, 이슈 #36)를 반영해 "그 주의 실제 가능 시간"을 전개한다 — 전개 규칙은 스케줄러 `materialize_availability`와 동일하며 부서의 `availability_mode`를 따른다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Query | `from_date`, `to_date` (필수, 최대 62일) |
| Response 200 | `[{ "student_id": "20221234", "student_name": "김서강", "date": "2026-09-07", "start_time": "14:00:00", "end_time": "18:00:00" }, ...]` — 날짜·학생·시작 시각 순 정렬 |
| Response 400 | 시작일 > 종료일, 또는 62일 초과 조회 |

#### `POST /api/availability/department/{department_id}/import-from-applications`

부서 합격자의 지원서 체크 시간(`cover_letter`의 "[근무 가능 시간]" 섹션)을 가능시간 수합에 연동한다. (직원 전용, REQ-SCHED-012)

합격 처리(`PATCH /api/applications/{id}/status` → `"합격"`) 시 자동으로 수행되며, 이 엔드포인트는 그 이전에 합격한 학생을 담당자가 화면에서 다시 연동할 때 쓴다. 이미 가능시간이 있는 학생은 건너뛴다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `{ "imported_students": 2, "imported_intervals": 5, "results": [{ "student_id": "20221234", "student_name": "김서강", "result": "imported", "interval_count": 3 }, ...] }` — `result`는 `"imported"`(새로 연동) / `"already"`(이미 수합돼 건너뜀) / `"no_slots"`(지원서에 시간 없음 → 직접 입력 필요) |
| Response 403 | `{ "error": "본인 소속 부서만 연동할 수 있습니다." }` |

#### `GET /api/class-time/me`

본인 수업 시간을 슬롯 형태로 조회한다. (REQ-SCHED-015)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Response 200 | `{ "slots": ["화-09:00", "화-10:00"] }` — 형태는 `GET /api/availability/me`와 동일 |

#### `PUT /api/class-time/me`

본인 수업 시간을 통째로 교체한다. (REQ-SCHED-015)

`PUT /api/availability/me`와 동일한 방식 — 현재 선택 상태 전체로 교체되며 누적되지 않는다. preference 개념은 없다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "slots": ["화-09:00", "화-10:00"] }` |
| Response 200 | `{ "slots": ["화-09:00", "화-10:00"] }` |

#### `GET /api/class-time/department/{department_id}`

부서 소속 학생들의 수업 시간을 전체 조회한다. (직원 전용, REQ-SCHED-015)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `[{ "student_id": "20221234", "student_name": "김서강", "day_of_week": 2, "start_time": "09:00:00", "end_time": "11:00:00" }, ...]` |

#### `GET /api/schedule/policy/{department_id}`

부서 스케줄링 정책 중 화면이 필요한 부분(개관 시간대·슬롯 길이)을 조회한다. (직원 전용)

담당자 화면의 시간표 그리드는 학생이 제출한 시간이 아니라 **부서 개관 시간**을 세로축으로 그려야 한다 — 아무도 제출하지 않은 시간대가 비어 있는 채로 보여야 미충원 위험을 알 수 있기 때문이다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `{ "department_id": 2, "department_name": "로욜라도서관 정보서비스팀", "policy_file_key": "library_info_service", "slot_minutes": 30, "grid_start_time": "08:00", "grid_end_time": "22:00", "opening_hours_source": "department", "opening_hours": { "semester": [{ "day_of_week": 1, "ranges": [{ "start_time": "08:00", "end_time": "12:30" }, { "start_time": "13:00", "end_time": "22:00" }] }, ...], "vacation": [...] }, "min_per_slot": 1, "max_per_slot": 2, "staffing_source": "policy_file", "preferred_staffing_max": 2, "biweekly_max_hours": 190, "biweekly_source": "policy_file", "work_slots": { "semester": [{ "day_of_week": 1, "ranges": [{ "start_time": "08:00", "end_time": "09:00" }, { "start_time": "09:00", "end_time": "10:30" }, ...] }, ...], "vacation": [] }, "work_slots_source": "policy_file", "soft_weight_scales": { "contiguity": 0 } }` |
| Response 404 | `{ "error": "부서 3의 스케줄링 정책이 없습니다." }` |

- `ranges`가 목록인 이유: 점심 휴관처럼 하루가 여러 구간으로 끊길 수 있습니다. 빈 목록이면 그 요일은 폐관입니다.
- `grid_start_time`·`grid_end_time`은 학기·방학을 통틀어 가장 이른 개관 - 가장 늦은 폐관 (화면 그리드의 세로 범위).
- `opening_hours_source`·`staffing_source`: `"department"`= 담당자가 화면에서 설정한 값, `"policy_file"`= 기본 정책 파일 값.
- `biweekly_max_hours`: 부서 교비 근로 학생 전체의 2주 근로시간 총합 상한 (Hard Constraint).
- `soft_weight_scales`: 담당자가 조정한 페널티 카테고리별 중요도 배율. 조정하지 않은 카테고리는 키가 없습니다(=정책 파일 값).
- `min_per_slot`·`max_per_slot`: 개관 시간 한 칸에 배정할 최소·최대 인원. `preferred_staffing_max`는 정책 파일의 선호 인원 중 가장 큰 값으로, 최대 인원을 이보다 낮게 잡으면 그 시간대는 선호 인원을 채울 수 없어 화면에서 안내하는 데 씁니다.
- `work_slots`: 부서 정의 근무 슬롯(#89, [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3.5 HC-BLOCK). **정의된 요일만 포함**되며, 목록에 없는 기간·요일은 자유 30분 그리드로 배정됩니다. 각 요일의 블록들은 그 요일 개관 시간을 정확히 타일링합니다. `work_slots_source`는 `opening_hours_source`와 같은 의미입니다.

#### `PATCH /api/schedule/policy/{department_id}`

부서 스케줄링 정책을 담당자가 직접 수정한다. (직원 전용, REQ-SCHED-013)

**전달된 항목만 반영합니다.** 설정 항목이 늘어나도 엔드포인트가 불어나지 않도록 하나의 PATCH로 받습니다. 저장 이후의 근무표 생성은 정책 파일이 아니라 이 값을 기준으로 이루어집니다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "opening_hours": { "semester": [{ "day_of_week": 1, "ranges": [{ "start_time": "08:00", "end_time": "12:30" }, { "start_time": "13:00", "end_time": "22:00" }] }, { "day_of_week": 7, "ranges": [] }, ...] }, "work_slots": { "semester": [{ "day_of_week": 1, "ranges": [{ "start_time": "08:00", "end_time": "09:00" }, { "start_time": "09:00", "end_time": "10:30" }, ...] }] }, "min_per_slot": 1, "max_per_slot": 2, "biweekly_max_hours": 190, "soft_weight_scales": { "contiguity": 0, "meal_break": 2 }, "custom_rules": "금요일 마감 시간대에는 경험자가 최소 1명 있어야 한다." }` — 모든 항목이 선택 |
| Response 200 | `GET /api/schedule/policy/{id}`와 동일한 형태 (저장 후 갱신된 정책) |
| Response 400 | `{ "error": "최소 인원(3명)이 최대 인원(2명)보다 많을 수 없습니다." }` — 한쪽만 보내 저장값과 비교해야 하는 경우. 근무 슬롯이 개관 시간을 정확히 타일링하지 않는 경우(빈틈·개관 밖·폐관 요일)도 `{ "error": "semester 월요일의 근무 슬롯이 개관 시간과 맞지 않습니다: … 개관 시간과 근무 슬롯을 함께 수정해 주세요." }` |
| Response 422 | 수정할 항목이 하나도 없는 경우, 30분 단위가 아닌 시각, 시작 ≥ 종료, 같은 요일 안에서 구간이 겹치는 경우, 같은 요일 중복, `work_slots`의 빈 `ranges` 요일, 인원 범위(0-20) 밖, 2주 상한 범위(1-2000) 밖, 조정 대상이 아닌 페널티 카테고리, 배율 범위(0-5) 밖 |
| Response 403 | `{ "error": "본인 소속 부서의 정책만 설정할 수 있습니다." }` |
| Response 404 | `{ "error": "해당 부서의 정책이 없습니다." }` |

- `opening_hours`: 보낸 기간(`semester`/`vacation`)만 교체하므로 학기만 수정하고 방학은 그대로 둘 수 있습니다. 시각은 **30분 단위**(스케줄러 슬롯 길이와 동일)만 허용하며, `ranges`가 빈 목록이면 폐관입니다.
- `work_slots`: 부서 정의 근무 슬롯(#89). `opening_hours`처럼 보낸 기간만 통째로 교체합니다. 목록에 없는 요일은 자유 30분 그리드(미정의)이며, **블록을 없애려면 요일을 목록에서 빼거나 기간을 빈 목록으로 보냅니다** (`ranges`가 빈 요일은 미정의와 모호해 422). 정의된 요일의 블록은 그 요일 개관 시간을 정확히 타일링해야 하며, 개관 시간과 어긋나는 저장(한쪽만 수정 포함)은 400으로 거부됩니다 — 개관 시간과 근무 슬롯을 한 PATCH로 함께 보내면 통과합니다.
- `min_per_slot`·`max_per_slot`: 시간대별 배정 인원. 최소 인원을 못 채운 칸은 생성이 실패하는 대신 미충원으로 보고됩니다 (그 동작을 결정하는 `allow_understaffing_with_penalty`는 정책 파일 값이며 화면에서 바꾸지 않습니다 — 끄면 생성이 통째로 실패할 수 있습니다).
- `biweekly_max_hours`: 부서 교비 근로 학생 전체의 2주 합계 상한. 학생 개인의 주간 상한(교비 14시간 / 국가 20·40시간)은 학교 규정이라 이 API로 바꾸지 않습니다.
- `soft_weight_scales`: Soft Constraint 카테고리별 중요도 배율 (0=끄기, 0.5=낮음, 1=보통, 2=높음). **보낸 카테고리만 반영**하고 나머지는 이전 설정을 유지하며, **배율 1을 보내면 그 카테고리는 정책 파일 값으로 되돌아갑니다**(저장에서 제외). 조정 가능한 카테고리는 `preferred_staffing`, `preference_match`, `contiguity`, `meal_break`, `morning_rules`, `exam_proximity`, `avoid_range`, `non_campus_day`, `fair_hours`입니다 — `understaffing`은 미충원을 억제하는 값이라 제외합니다.
- `custom_rules`: AI 검토([POST /api/schedule/review](#post-apischedulereview), REQ-SCHED-016)의 기준이 되는 자연어 운영 규칙. **전체 교체**이며 여러 규칙은 줄바꿈으로 구분합니다 (최대 5,000자). 공백만 보내면 규칙 삭제(null 저장)로 취급돼 AI 검토가 `no_rules`로 건너뜁니다. GET 응답에도 `custom_rules`로 그대로 노출됩니다.

#### `POST /api/schedule/generate`

제약조건 기반 최적 근무표를 생성한다. (직원 전용, 스케줄링 알고리즘 호출)

생성 단위는 2주를 권장한다 (2주 교비 총합 상한 제약과 정합하고, 동기 응답이 가능한 풀이 시간이 나온다). 결과는 초안이며, 담당자가 근거를 보고 수동 조정 후 확정하는 플로우를 전제로 한다 (REQ-SCHED-009).

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "department_id": 3, "start_date": "2026-06-01", "num_days": 14, "time_limit_seconds": 30, "num_alternatives": 3, "semester_pattern": false }` — `start_date` 필수(월요일 권장), `num_days` 기본 14, `time_limit_seconds` 기본 30(해 하나당), `num_alternatives` 기본 1(최대 5 — 동률 배정안 개수), `semester_pattern` 기본 false(학기 고정용 대표 패턴 생성 — 아래 참조) |
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
  "semester_end": "2026-06-22",
  "alternatives": [],
  "num_alternatives_found": 1
}
```

- `preferred_match`: 학생이 '희망'으로 제출한 시간대에 배정됐는지
- `alternatives`: `num_alternatives` ≥ 2 요청 시, 페널티 총합이 같거나 더 낮으면서 배치가 실질적으로 다른 대안 배정안 목록 (본문과 동일 구조). 담당자가 비교 후 선택 — 같은 입력이어도 동률 해가 여러 개 존재할 수 있기 때문 ([SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3.7 참조)
- `shortages[].candidates`: 그 슬롯에 올 수 있었던 후보. 비어 있으면 가능자 자체가 없는 것(추가 수합 필요), 있으면 시간 상한 등으로 미배정된 것(수동 조정 검토)
- `penalty_summary`: Soft Constraint별 희생량 — 항목 정의는 [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3.6 참조
- `semester_end`: 학사 캘린더에서 `start_date`가 속한 학기의 종료일 (방학이면 null) — 학기 고정 확정(`repeat_until`)의 기본값으로 쓴다
- `semester_pattern`: **학기 고정 시간표용 대표 패턴 생성 모드.** 주간 패턴을 학기 내내 반복하면 한 달에 같은 요일이 최대 5번 오므로, 국가근로 주간 상한을 `min(기존, 9시간)`으로 조여 반복 후에도 월 46시간 상한(HC-TIME-3)이 구조적으로 지켜지게 한다 (9×5=45). 교비(주 14h, 월 상한 없음)와 부서 2주 총합(stride 14일 반복 시 창 동일)은 조정 불필요

#### `POST /api/schedule/confirm`

생성 초안을 확정 근무표로 저장한다. (직원 전용, REQ-SCHED-009/011)

담당자가 화면에서 배정안(본안 또는 `alternatives` 중 하나)을 고른 뒤 그 배정 목록을 그대로 되돌려보낸다. generate가 남긴 draft 배치를 그 목록으로 덮어쓰고 `confirmed`로 올리며, 같은 부서에서 **기간이 겹치는** 이전 확정본은 `superseded`로 내려 이력을 남긴다 (완전히 같은 기간이 아니어도 — 예: 2주 확정 후 같은 계획을 한 학기로 재확정 — 겹치는 확정본은 모두 대체된다). 조회는 항상 가장 최근 확정본을 본다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "department_id": 2, "period_start": "2026-08-10", "period_end": "2026-08-23", "schedules": [{ "student_id": "20221234", "date": "2026-08-10", "start_time": "14:00", "end_time": "18:00" }, ...], "repeat_until": "2026-12-21" }` — `schedules`는 generate 응답의 항목을 그대로 사용, `repeat_until`은 선택(학기 고정 — 아래 참조) |
| Response 201 | `{ "batch_id": 3, "status": "confirmed", "confirmed_count": 486, "adjusted_dates": [{ "date": "2026-09-24", "reason": "폐관 제외" }, { "date": "2026-10-09", "reason": "개관 시간에 맞춰 조정" }] }` — `adjusted_dates`는 `repeat_until` 확정에서만 채워짐 |
| Response 400 | `{ "error": "확정할 배정 내역이 없습니다." }` / `{ "error": "확정 기간을 벗어난 배정이 포함되어 있습니다." }` / `{ "error": "등록되지 않은 학생이 포함되어 있습니다: ..." }` / `{ "error": "반복 종료일이 확정 기간 종료일보다 빠릅니다." }` / `{ "error": "학사 일정이 연 단위라 같은 해 안에서만 반복 확정할 수 있습니다." }` |
| Response 403 | `{ "error": "본인 소속 부서의 근무표만 확정할 수 있습니다." }` |

- `repeat_until` (**학기 고정 시간표**): 대표 기간(`period_start`~`period_end`)의 배정을 이 날짜까지 **주 단위로 서버가 복제**해 저장한다 (stride = 기간 일수를 7의 배수로 올림 — 요일 보존). 복제된 각 날짜는 학사 캘린더의 실제 개관 시간과 교집합을 취한다 — 폐관일(하계 휴무·추석 등)은 행 제거, 공휴일 단축 개관에 걸친 배정은 잘라내며, 조정 내역을 `adjusted_dates`로 돌려준다. 원본 기간은 솔버가 이미 개관을 반영했으므로 손대지 않는다. 배치의 `period_end`는 `repeat_until`로 저장된다. 대표 패턴은 [`POST /api/schedule/generate`](#post-apischedulegenerate)의 `semester_pattern: true`로 생성하는 것을 권장한다 (국가근로 월 상한 보장). 한계: 학생 활동 종료일(`active_until`)은 복제 시 검증하지 않는다 (기존 confirm과 동일 — 후속 작업).

#### `POST /api/schedule/review`

draft 배치에 대한 AI 검토 의견을 생성한다. (직원 전용, REQ-SCHED-016)

부서가 자연어로 등록한 운영 규칙(`custom_rules`, [PATCH /api/schedule/policy](#patch-apischedulepolicydepartment_id) 참조)을 기준으로 AI(Gemini)가 배정 초안을 점검한다. AI는 검토 의견만 내고 확정은 항상 사람이 한다 — 응답에 지시적 표현("확정하세요")은 나오지 않는다. 규칙이 없거나 AI 호출이 실패해도 HTTP 200으로 응답하고 `review_available=false`와 `reason`만 알려준다 (조용한 실패 — 검토는 부가 기능이라 근무표 플로우를 막지 않는다).

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만) |
| Request | `{ "batch_id": 3 }` |
| Response 200 (성공) | 아래 응답 구조 참조 |
| Response 200 (검토 불가) | `{ "batch_id": 3, "review_available": false, "reason": "no_rules" }` — `reason`은 `no_rules`(부서 규칙 미등록) / `not_configured`(GEMINI_API_KEY 없음) / `ai_error`(호출·파싱 실패) |
| Response 404 | `{ "error": "해당 배치를 찾을 수 없습니다." }` |
| Response 409 | `{ "error": "draft 상태의 배치만 검토할 수 있습니다." }` — 검토는 draft에만 의미가 있다 |

Response 200 구조 (검토 의견 출력 형식 — 근거·심각도·대안, #80에서 확정):

```json
{
  "batch_id": 3,
  "review_available": true,
  "review": {
    "summary": "주당 상한 규칙 위반 1건이 확인됩니다. 나머지 배정은 등록된 규칙을 준수합니다.",
    "findings": [
      { "severity": "critical",
        "rule": "한 학생은 주당 12시간을 초과해 근무할 수 없다",
        "evidence": "20221234 — 2026-08-03(월)~08-06(목) 매일 09:00-13:00, 주 16시간",
        "message": "주당 상한 12시간을 4시간 초과해 배정되어 있습니다.",
        "suggestion": "20221234의 배정 중 하루를 다른 학생으로 교체하는 방안 검토" }
    ]
  }
}
```

- `severity`: `critical`(규칙 위반이 데이터로 명확히 확인됨) / `warning`(위반이라 단정할 수 없지만 우려) / `info`(참고 사항). critical·warning에는 `evidence`(판단 근거가 된 구체적 배정 내역)와 `suggestion`(조정 방향)이 함께 온다
- 신입/경력 여부처럼 데이터로 확인할 수 없는 속성을 언급하는 규칙은 추측으로 finding을 만들지 않고, `summary`에 어떤 규칙이 확인 불가인지 명시된다
- `tenure_start_date`(근속 시작일)가 있는 배정 학생과 미배정 후보가 존재하는 경우, AI는 절대 기준(예: N개월 이상=경력자) 없이 두 근속 시작일을 상대 비교하여 더 이른 미배정 후보가 있으면 이름을 들어 `suggestion`에 대안으로 제시한다. 이 비교에 필요한 데이터(양쪽 다 `tenure_start_date` 존재, 또는 해당 시간대 가용시간 일치)가 없으면 기존과 동일하게 확인 불가로 처리된다
- 검출력 검증: 실 호출 통합 테스트는 `backend/tests/scheduler/test_review_live.py`(GEMINI_API_KEY 있을 때만 실행), 케이스별 검출률 측정은 `backend/scripts/eval_review.py`

#### `POST /api/schedule/manual`

기존에 근로 중이던 학생의 근무 일정을 알고리즘 없이 직원이 직접 등록한다. (직원 전용, 초기 데이터 이관용)

요일 반복이 아니라 날짜 단위로 등록한다 (REQ-SCHED-010). 수동 등록분은 부서별 `manual` 배치 하나에 모아 담아, 알고리즘 확정 배치를 다시 만들어도 함께 남는다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "student_id": "20221234", "department_id": 3, "work_date": "2026-08-10", "start_time": "14:00", "end_time": "18:00" }` |
| Response 201 | `{ "schedule_id": 31, "batch_id": 4 }` |
| Response 400 | `{ "error": "해당 학생은 주간 근로시간 14시간을 초과합니다." }` — 상한은 `department.weekly_hour_limit` 기준, 해당 주(월-일)의 확정·수동 배정 합계로 검증 |
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
| REQ-SUB-007 | 직원은 본인 소속 부서의 근무에 걸린 대타 요청을 상태(대기·수락·승인·반려)와 무관하게 한 번에 조회할 수 있다 |
| REQ-SUB-008 | 직원은 승인 전(대기·수락) 요청을 사유와 함께 반려할 수 있으며, 반려된 근무는 원 근무자에게 그대로 남고 학생은 같은 근무로 다시 요청할 수 있다 |

### API 명세

#### `POST /api/substitute-requests`

대타 요청을 등록한다.

이미 지난 근무는 요청할 수 없다. 진행 중(대기·수락) 요청이 있는 근무도 다시 요청할 수 없지만,
승인·반려로 종결된 요청은 재요청을 막지 않는다 — 대타로 근무를 넘겨받은 학생도 같은 근무의
대타를 다시 구할 수 있다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Request | `{ "schedule_id": 10, "reason": "시험 일정과 겹침" }` |
| Response 201 | `{ "request_id": 7, "status": "대기" }` |
| Response 400 | `{ "error": "이미 지난 근무는 대타를 요청할 수 없습니다." }` |
| Response 403 | `{ "error": "본인의 근무 일정만 대타 요청할 수 있습니다." }` |
| Response 409 | `{ "error": "이미 처리 중인 대타 요청이 있습니다." }` |

#### `GET /api/substitute-requests/me`

내가 올린 요청과 내가 대타로 지목·수락된 요청을 함께 조회한다. (학생 전용)

'대타 요청 기록' 화면과, 승인된 대타를 근무 시간표에 표시하는 데 쓴다 (`schedule_id`로 근무표 행과 매칭).

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Response 200 | 부서 전체 조회와 같은 형태에 `"role"`(`"requester"` \| `"substitute"`)과 `"schedule_id"`가 추가된 목록 |

#### `GET /api/substitute-requests/open`

대기 중 요청 가운데 내가 후보 조건(REQ-SUB-002와 동일)에 맞는 것만 조회한다. (학생 전용) — 후보 학생의 '받은 요청' 화면용.

이미 지난 근무의 요청과, 근무표 재확정으로 유효하지 않게 된(superseded 배치) 요청은 목록에서 제외된다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (학생만) |
| Response 200 | `[{ "request_id": 7, "requester_id": "20221234", "requester_name": "김서강", "department_name": "...", "date": "2026-08-10", "start_time": "14:00:00", "end_time": "18:00:00", "reason": "...", "requested_at": "..." }, ...]` |

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
| Response 409 | 이미 수락·승인·반려된 요청, 지난 근무의 요청, 근무표 재확정으로 유효하지 않은 요청 |

#### `PATCH /api/substitute-requests/{request_id}/approve`

담당 직원이 대타 요청을 최종 승인한다. (직원 전용)

승인되면 원래 근무자의 근무표는 취소되고, 대타 학생의 근무표에 해당 시간이 자동으로 추가된다 (REQ-SUB-005) — 같은 `work_schedule` 행의 담당 학생만 대타 학생으로 바뀐다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만) |
| Response 200 | `{ "request_id": 7, "status": "승인", "approved_by": "S001" }` |
| Response 400 | `{ "error": "아직 후보자가 수락하지 않았습니다." }` |
| Response 409 | 지난 근무의 요청, 근무표 재확정으로 유효하지 않은 요청 |

#### `PATCH /api/substitute-requests/{request_id}/reject`

담당 직원이 대타 요청을 반려한다. (직원 전용, REQ-SUB-008)

승인 전(대기·수락) 요청만 반려할 수 있다 — 승인된 요청은 이미 근무표가 교체되었으므로 반려 대상이 아니다.

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Request | `{ "reject_reason": "해당 주 근무 인원 조정 필요" }` (사유 생략 가능) |
| Response 200 | `{ "request_id": 7, "status": "반려", "reject_reason": "해당 주 근무 인원 조정 필요" }` |
| Response 409 | `{ "error": "이미 승인된 요청은 반려할 수 없습니다." }` |

#### `GET /api/substitute-requests/department/{department_id}`

부서 소속 근무에 걸린 대타 요청을 상태와 무관하게 전체 조회한다. (직원 전용, REQ-SUB-007)

| 항목 | 내용 |
| --- | --- |
| 인증 | 필요 (직원만, 본인 소속 부서만) |
| Response 200 | `[{ "request_id": 7, "requester_id": "20221234", "requester_name": "김서강", "department_name": "로욜라도서관 정보서비스팀", "date": "2026-08-10", "start_time": "14:00:00", "end_time": "18:00:00", "reason": "시험 일정과 겹침", "requested_at": "2026-08-05T10:00:00", "status": "수락", "substitute_id": "20225678", "substitute_name": "이서강", "approved_by": null, "approver_name": null, "reject_reason": null }, ...]` — `status`는 `"대기"` / `"수락"` / `"승인"` / `"반려"` |

---

## 6. 공통 지원서 (CommonApplication)

### 설명

학생이 한 번 써두고 여러 공고에 재사용하는 이력서입니다. **기본 인적사항**(SAINT 학적 정보 + 연락처·이메일)과 **경력·활동 / 어학성적 / 자격증** 세 가지 표로 이루어집니다.

SAINT 학적 항목(학과·학적상태·학년·학기·생년월일 등)은 실서비스에서 SAINT 연동으로 채워질 값이라 **읽기 전용**입니다. 학생이 직접 관리하는 값은 연락처·이메일과 세 표뿐입니다.

세 표는 화면에서 행을 추가·삭제·정렬하는 편집이라 **화면 전체 저장** 방식을 씁니다 — 저장 시 그 학생의 기존 행을 전량 지우고 요청 본문 순서대로 다시 만듭니다(`sort_order`로 순서 보존).

### 요구사항

| ID | 요구사항 |
| --- | --- |
| REQ-PROFILE-001 | 학생은 본인의 공통 지원서(기본 인적사항 + 경력·어학·자격증)를 한 번에 조회할 수 있다 |
| REQ-PROFILE-002 | 학생은 본인의 연락처·이메일과 경력·어학·자격증 목록을 저장할 수 있으며, SAINT 학적 항목은 저장 요청으로 바뀌지 않는다 |

### API 명세

#### `GET /api/students/me/common-application`

내 공통 지원서를 조회한다. (REQ-PROFILE-001)

| 항목 | 내용 |
| --- | --- |
| 인증 | 학생 토큰 필요 |
| Response 200 | `{ "basic": {...}, "careers": [...], "languages": [...], "certificates": [...] }` |
| Response 403 | 직원 토큰으로 호출한 경우 |
| Response 404 | 토큰의 학번에 해당하는 학생이 없는 경우 |

`basic` 필드 — `student_id`, `name`, `department_name`(학과·전공), `photo_url`, `enroll_status`(학적상태), `status_changed_at`(학적변동일자), `degree_course`(과정), `nationality`, `advisor`(지도교수), `grade_year`(학년), `semester`(학기), `completed_semesters`(이수학기), `birth_date`, `phone`, `email`, `interests`(관심 분야 목록), `funding_type`(근로 구분 `gyobi`|`gukga`)

#### `PUT /api/students/me/common-application`

내 공통 지원서를 저장한다. (REQ-PROFILE-002)

| 항목 | 내용 |
| --- | --- |
| 인증 | 학생 토큰 필요 |
| Request | `{ "basic": { "phone": "010-0000-0000", "email": "hong@sogang.ac.kr" }, "careers": [...], "languages": [...], "certificates": [...] }` |
| Response 200 | 저장 결과 (GET과 같은 형태) |
| Response 403 | 직원 토큰으로 호출한 경우 |

- `basic`은 `phone`·`email`·`interests`·`funding_type`만 받는다. SAINT 학적 항목은 스키마에서 아예 받지 않으므로 요청에 넣어도 무시된다
- `funding_type`은 `gyobi`(교비) / `gukga`(국가) 중 하나다. 주당 상한과 교내 휴강일 규칙이 달라 스케줄러 제약에 직접 영향을 준다 (docs/SCHEDULER_SPEC.md HC-TIME-1/2, HC-CLASS-4)
- `interests`는 고정 선택지에서 고른 태그 목록이다 (행정/사무 보조, 도서/자료 정리, 미디어/콘텐츠, IT/전산, 민원 응대, 튜터링/교육, 행사 운영, 연구 보조). 보낸 목록으로 통째 교체된다
- `basic`에서 **본문에 없는 필드는 기존 값을 유지**하고, **`null`로 보낸 필드는 지운다** (그러지 않으면 학생이 이메일을 비울 방법이 없다)
- `careers[]` — `career_type`(교내근로/인턴/대외활동/동아리/봉사/아르바이트/기타), `organization`, `role`, `period_start`, `period_end`, `detail`
- `languages[]` — `test_name`, `score`(OPIc `IH`처럼 문자열일 수 있다), `grade`, `acquired_at`
- `certificates[]` — `name`, `issuer`, `registration_number`, `acquired_at`
- 목록은 **전량 교체**된다. 빈 배열을 보내면 그 표는 비워진다

---

## 7. 요구사항 ID 전체 목록 (빠른 참조용)

| ID | 한 줄 요약 |
| --- | --- |
| REQ-AUTH-001-005 | 로그인, 토큰 발급, 비밀번호 암호화, 역할별 접근 제한 |
| REQ-POST-001-010 | 공고 등록(직원 전용), 조회·검색, 상세 필드, 마감 자동 처리 |
| REQ-APP-001-006 | 지원 제출, 중복·마감 방지, 상태 변경 (적합도 자동 계산은 MVP 제외) |
| REQ-SCHED-001-015 | 가능시간 입력·조회·교체·수합(지원서 연동 포함), 수업 시간 입력·조회·교체(SAINT 연동 전 임시 수단), 제약조건 기반 근무표 생성·확정, 날짜 단위 관리, 조회 권한 |
| REQ-SUB-001-008 | 대타 요청, 후보 탐색, 수락/거절, 직원 최종 승인·반려, 부서 전체 조회 |
| REQ-PROFILE-001-002 | 공통 지원서 조회·저장 (기본 인적사항 + 경력·어학·자격증) |

총 45개 요구사항 / 총 31개 API 엔드포인트로 정리되었습니다.