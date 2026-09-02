# IA · 역할별 접근 구조 · 화면 구현 현황

**누가 어떤 화면을 보고, 그 화면이 무엇을 부르며, 어디까지 만들어졌는가**를 적습니다.
`frontend/src` 기준. 마지막 갱신: 2026-09-01.

| 알고 싶은 것 | 문서 |
|---|---|
| 서버가 실제로 거는 권한 | [AUTH_SPEC.md](AUTH_SPEC.md) |
| 엔드포인트별 입출력 | [API_SPEC.md](API_SPEC.md) |
| 색·타이포·컴포넌트 | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |

---

## 1. 역할별 접근 구조

STREAM은 서강대 학사포털 SAINT 안에 들어가는 화면이라, **SAINT 껍데기(헤더·좌측 크롬)를
재현한 뒤 그 안쪽만** STREAM 화면으로 채웁니다. 로그인하면 역할에 따라 다른 첫 화면으로
보냅니다.

| 역할 | 첫 화면 | 사이드바 | 셸 |
|---|---|---|---|
| 학생 | `/home` (SAINT 홈) | `streamMenu` 6개 | `Shell` |
| 학생팀장 | `/home` — 일반 학생과 같다 | `teamLeadMenu` = 학생 6개 **+ 근무표 편성 · 부서 설정** | `Shell` / 편성 화면은 `AdminShell` |
| 직원 | `/admin/posts` | `adminMenu` 7개 | `AdminShell` |

**학생팀장을 관리자 첫 화면으로 보내지 않습니다.** 팀장도 근로 학생이라 공고·지원·본인
근무표 화면을 그대로 쓰기 때문이고, 편성은 사이드바의 '근무표 편성'으로 들어갑니다.
그래서 팀장의 사이드바는 관리자 메뉴가 아니라 **학생 메뉴 + 2개**입니다.

### 메뉴

| `streamMenu` (학생) | `adminMenu` (직원) |
|---|---|
| 교내 근로 모집 공고 | 교내 근로 모집 공고 |
| 관심 공고 | 학생 선발 |
| 공통 지원서 | 학생 관리 |
| 내 지원 현황 | 근무표 편성 |
| 근무 시간표 | 수업 조교 편성 † |
| 대타 요청 | 대타 승인 |
| — | 부서 설정 |

† **수업 조교 편성은 `course_ta_enabled` 부서에만 보입니다** — 근무 단위가 시간대가 아니라
과목인 학과·학부 사무실만 해당하고, 도서관·행정 부서는 개설 과목이 없어 화면이 무의미합니다.
판정 값은 로그인 응답의 `course_ta_enabled`(부서 컬럼)입니다.

학생팀장에게 열리는 관리자 메뉴는 `TEAM_LEAD_MENUS = ['schedule', 'settings']` 둘뿐이며,
이는 백엔드 `require_schedule_editor`가 여는 범위와 같습니다 — 대타 승인·공고·선발은
메뉴에서도 빠집니다.

### 화면 가드는 라우트가 아니라 셸에 있다

`App.jsx`의 20개 라우트(`/` 리다이렉트 포함)에는 가드가 없고, 아래 셸이 리다이렉트합니다.

| 셸 | 가드 |
|---|---|
| `Shell` | 세션 없음 → `/login`, 직원 → `/admin/posts`, 그 뒤 `return null` |
| `AdminShell` | 세션 없음 → `/login`, `canUseAdmin`(직원 ∨ 학생팀장) 아니면 → `/posts`. 학생팀장이 `TEAM_LEAD_MENUS` 밖 화면에 오면 `return null` |

`LoginPage`와 `SaintHomePage`만 셸 밖에 있습니다. **이 가드는 사용자 편의이지 권한이
아닙니다** — 판단 근거가 `sessionStorage`라 사용자가 고칠 수 있습니다. 실제 차단은 서버가
합니다 ([AUTH_SPEC.md](AUTH_SPEC.md) 6절).

---

## 2. 라우트 · 화면 목록

### 학생 (12개)

| 경로 | 화면 | 부르는 API |
|---|---|---|
| `/login` | 로그인 | `login` |
| `/home` | SAINT 홈 (STREAM 진입점) | — |
| `/posts` | 공고 목록 | `fetchPostings` · `fetchMyApplications` |
| `/posts/:id` | 공고 상세 | `fetchPosting` · `fetchMyApplications` |
| `/liked` | 관심 공고 | `fetchPostings` · `fetchMyApplications` |
| `/profile` | 공통 지원서 (경력·어학·자격증·가능시간·수업시간) | 7개 |
| `/apply` | 지원서 작성 | 6개 |
| `/apply/complete` | 지원 완료 | — |
| `/applications` | 내 지원 현황 | `fetchMyApplications` |
| `/applications/:id` | 지원 상세 | `fetchMyApplications` · `fetchMyClassTime` |
| `/schedule` | 근무 시간표 (본인 확정 근무표 + 대타 표시) | 6개 |
| `/substitute` | 대타 요청·받은 요청 | 9개 |

### 관리자 · 학생팀장 (7개)

| 경로 | 화면 | 부르는 API | 학생팀장 |
|---|---|---|---|
| `/admin/posts` | 공고 관리 | 5개 | ✕ |
| `/admin/selection` | 학생 선발 (지원서 검토·합불) | 5개 | ✕ |
| `/admin/students` | 학생 관리 (활동기간·주차별 시간표) | 8개 | ✕ |
| `/admin/schedule` | **근무표 편성** (생성·검토·챗봇·확정) | **15개** | ✓ |
| `/admin/courses` | 수업 조교 편성 | 4개 | ✕ |
| `/admin/substitute` | 대타 승인 (AI 적합성 검사) | 5개 | ✕ |
| `/admin/settings` | **부서 설정** (개관시간·근무슬롯·인원·가중치) | 3개 | ✓ |

`/admin/schedule`이 15개 API를 부르는 가장 무거운 화면입니다 — 수합 조회·정책·생성·AI 검토·
draft 편집·확정·대타 겹쳐 그리기가 한 화면에 모여 있습니다.

---

## 3. 구현 현황

### 화면과 서버가 모두 있는 기능

공고 등록·조회·지원·선발, 공통 지원서, 가능시간·수업시간 제출, 근무표 생성·검토·챗봇·확정,
draft 편집, 부서 설정, 대타 요청·수락·승인·반려·AI 검사, 수업 조교 편성 — **`client.js`의
60개 바인딩 중 57개가 실제로 호출됩니다.**

### 서버만 있고 화면이 없는 기능 (6개 엔드포인트)

| 엔드포인트 | 기능 | 비고 |
|---|---|---|
| `GET`·`PUT /api/availability/me/note` | 학생 자연어 특이사항 입력 (#185) | AI 검토·챗봇은 이 값을 읽지만 **학생이 넣을 화면이 없다** |
| `POST /api/availability/me/note/suggest` | 특이사항 → 슬롯 선호도 AI 제안 | 〃 |
| `GET /api/availability/department/{id}/notes` | 담당자가 특이사항 모아보기 | 〃 |
| `GET /api/schedule/verify` | 배치 Hard Constraint 검증 (#156) | 챗봇 `verify_schedule` 툴로는 쓰이지만 **화면 버튼이 없다** |
| `PATCH /api/students/{id}/team-lead` | 학생팀장 지정·해제 (#156) | API로만 가능 |

**#185의 학생 특이사항은 파이프라인이 한쪽만 뚫려 있습니다.** 저장 테이블(`student_note`)·
프롬프트 섹션·AI 제안·담당자 조회 API까지 다 있는데 학생이 문장을 넣을 입구가 없어,
실제로는 시드로 넣은 값만 흐릅니다.

### 바인딩은 있는데 호출부가 없는 것 (3개)

`createAvailability`(`POST /api/availability`) · `importAvailabilityFromApplications` ·
`createManualSchedule`. 가능시간은 `replaceMyAvailability`(PUT)로 제출하므로 첫 번째는 사실상
대체됐고, 나머지 둘(지원서 연동·수동 근무 등록)은 **버튼이 만들어지지 않았습니다.**

> `AdminSchedulePage.jsx`에 "지원서 연동만 직원 권한이라 버튼을 감춘다"는 주석이 있지만,
> 감추는 게 아니라 **버튼 자체가 없습니다.**

### 라우트에 연결되지 않은 화면 (1개)

`pages/admin/AdminDashboardPage.jsx` — `App.jsx`에 경로가 없고 저장소 어디에서도 참조되지
않습니다. 내부에서 API 3개(`fetchPostings`·`fetchApplicants`·`fetchDepartmentSubstituteRequests`)를
부르는 완성된 화면이지만 **도달할 방법이 없습니다.**

### 데이터 소스

화면은 모두 실제 API를 씁니다. `data/mockData.js`가 남아 있지만 쓰이는 곳은 **메뉴 정의와
`TimeGrid` 상수**뿐입니다. `api/devMockFallback.js`는 개발 중 백엔드가 안 떠 있을 때
(`import.meta.env.DEV` ∧ 5xx ∧ 빈 본문) 공고·지원 3종만 mock으로 대체하며, 배포 빌드에서는
동작하지 않습니다.
