# 인증·권한 설계

**누가 무엇에 닿을 수 있는가**를 적습니다. 토큰 발급·검증, 역할 정의, 엔드포인트별
접근 권한, 그리고 그 경계를 지키는 테스트입니다.

`backend/app/auth.py`·`app/services.py`·`app/routers/*.py` 기준. 마지막 갱신: 2026-09-01.

| 알고 싶은 것 | 문서 |
|---|---|
| 엔드포인트별 입출력 | [API_SPEC.md](API_SPEC.md) |
| 모듈 경계와 요청 경로 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 계정·부서 테이블 | [ERD.md](ERD.md) |
| 운영 환경변수(`SECRET_KEY` 등) | [DEPLOY.md](DEPLOY.md) |

---

## 1. 인증 — 토큰 발급과 검증

```
POST /api/auth/login  { id, password, role }
   role로 조회할 테이블을 고른다 (student → student, staff → staff)
   passlib bcrypt로 password_hash 검증
   실패하면 401 "아이디 또는 비밀번호가 올바르지 않습니다."
   ↓
JWT 발급 — HS256, payload { sub: id, role, exp }
   ↓
이후 모든 요청: Authorization: Bearer <token>
   auth.get_current_user가 서명·만료를 검증하고 CurrentUser(id, role)로 바꾼다
```

| 항목 | 값 | 출처 |
|---|---|---|
| 서명 알고리즘 | HS256 | `ALGORITHM` (기본 `HS256`) |
| 서명 키 | 운영은 `.env`로 주입 (`secrets.token_hex(32)`) | `SECRET_KEY` |
| 만료 | 60분 | `ACCESS_TOKEN_EXPIRE_MINUTES` |
| 비밀번호 해시 | bcrypt (passlib `CryptContext`) | `app/auth.py` |
| 토큰 payload | `sub`(학번/사번) · `role` · `exp` — 그 외 없음 | `create_access_token` |

**토큰에는 학번/사번과 역할만 들어갑니다.** 부서·팀장 여부는 토큰에 넣지 않고 매
요청 DB에서 확인합니다. 권한이 바뀐 사람이 이미 받아 둔 토큰으로 옛 권한을 계속 쓰는
상태를 만들지 않기 위해서입니다 — 지금은 로그아웃해도 서버가 토큰을 무효화하지
않으므로(8절), 토큰에 넣은 값은 만료까지 그대로 살아 있게 됩니다.

> **`role`을 요청이 고른다는 점**은 권한 상승이 아닙니다. `role`은 "어느 테이블에서
> 계정을 찾을지"의 선택일 뿐이고, 그 테이블에 그 ID의 행이 있고 비밀번호가 맞아야
> 토큰이 나옵니다. 학생이 `role: "staff"`로 보내면 `staff` 테이블에서 자기 학번을
> 찾다 실패해 401입니다. 프론트는 ID 형식으로 역할을 추론합니다 — 숫자만이면 학번
> (`student`), 아니면 사번(`staff`) (`LoginPage.jsx`의 `inferRole`).

**클라이언트 저장**: 로그인 응답을 `sessionStorage`의 `stream_user` 한 곳에 넣고
(`utils/session.js`), 모든 HTTP 호출이 지나는 `api/client.js`가 거기서 토큰을 꺼내
`Authorization` 헤더를 붙입니다. 탭을 닫으면 사라집니다.

---

## 2. 역할 — 토큰에는 둘, 실제로는 셋

토큰의 `role`은 `student`와 `staff` 둘뿐입니다. 그런데 **근무표를 짜는 사람이 늘
직원인 것은 아닙니다** — 근로 학생 중 '학생팀장'이 부서 근무표를 편성합니다 (#156).

| 역할 | 판별 | 성격 |
|---|---|---|
| 학생 | `role == "student"` | 지원·가능시간 제출·본인 근무표·대타 요청 |
| 직원 | `role == "staff"` | 부서의 모든 운영 권한 |
| 학생팀장 | `role == "student"` **and** `student.is_team_lead` | 학생 권한 + 근무표 편성 경로 |

**팀장에게 `role`을 새로 주지 않은 이유**는 그러면 경계를 다시 그려야 하기
때문입니다. 직원 권한을 통째로 주면 대타 승인·공고 관리까지 함께 열립니다. 그래서
토큰의 `role`은 `student` 그대로 두고, **편성 경로에만 통하는 권한**을 따로 뒀습니다.

`is_team_lead`는 DB 컬럼이라 토큰을 다시 받지 않아도 즉시 반영됩니다. 승격·해제는
직원만 할 수 있고(`PATCH /api/students/{id}/team-lead`), 그 직원의 부서 소속 학생만
대상입니다 — 팀장이 팀장을 만들 수 있으면 권한 경계가 스스로 넓어집니다.

---

## 3. 세 겹 게이트

권한 판정은 한 군데서 끝나지 않고 세 겹입니다.

```
① Depends(...)      토큰 검증 + 역할 게이트           → 401 / 403
② 본문 역할 확인     "학생만" · "직원만"                → 403
③ 본문 스코프 확인   부서 경계 · 본인 소유 · 세션 개설자  → 403
```

### ① 역할 게이트 — Depends

| 게이트 | 통과 | 정의 |
|---|---|---|
| `auth.get_current_user` | 로그인한 누구나 | `app/auth.py` |
| `auth.require_staff` | 직원만 | `app/auth.py` |
| `services.require_schedule_editor` | 직원 **또는** 학생팀장 | `app/services.py` (#156) |

66개 엔드포인트의 분포: 무인증 1(로그인) · 로그인 30 · 편성자 25 · 직원 10.

### ② 본문 역할 확인

`get_current_user`만 걸린 엔드포인트는 두 역할이 모두 통과하므로, 본문에서
`current_user.role != "student"` 같은 확인을 다시 합니다. 학생 전용 화면이 쓰는
`/me` 계열이 대부분 여기 해당합니다.

### ③ 스코프 확인 — 부서 경계

역할이 맞아도 **남의 부서**는 막습니다.

| 헬퍼 | 판정 |
|---|---|
| `require_own_department` | 직원의 `staff.department_id`와 일치하는가 |
| `require_own_department_or_lead` | 편성자의 부서 목록(`editor_department_ids`)에 있는가 |
| `_require_own_department_student` | 그 학생이 내 부서 소속인가 |
| `_get_own_session` | 그 챗봇 세션을 내가 열었는가 |

**부서 소속 판정 기준이 역할마다 다릅니다.** 직원은 `staff.department_id`,
학생팀장은 **합격 공고의 부서**입니다. 근로 학생의 소속 판정과 똑같은 기준을 써서
(해당 부서 공고에 `status="합격"`인 지원서), 팀장이 자기가 일하는 부서 밖의 근무표를
건드릴 수 없게 합니다.

스코프 확인이 헬퍼 안쪽에 들어가 있는 경우도 있습니다 — `POST /api/schedule/draft/edits`는
편집 항목마다 `_get_draft_schedule_row`/`apply_draft_edit`가 `require_own_department_or_lead`를
부릅니다. 엔드포인트 함수 본문만 보면 안 보이지만 경계는 그대로입니다.

---

## 4. 엔드포인트별 접근 권한

`게이트` = ① Depends, `역할` = ② 본문 확인, `스코프` = ③ 본문 확인.

### 인증
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `POST /api/auth/login` | (없음) | - | - |

### 공고
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `GET /api/postings` | 로그인 | - | - |
| `GET /api/postings/{posting_id}` | 로그인 | - | - |
| `POST /api/postings` | 직원 | - | 부서(직원) |
| `PATCH /api/postings/{posting_id}` | 직원 | - | 부서(직원) |

### 지원서
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `POST /api/applications` | 로그인 | 학생만 | - |
| `GET /api/applications/me` | 로그인 | 학생만 | - |
| `GET /api/applications/posting/{posting_id}` | 로그인 | 직원만 | 부서(직원) |
| `PATCH /api/applications/{application_id}/status` | 로그인 | 직원만 | 부서(직원) |

### 학생 · 학사
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `GET /api/academic/terms` | 로그인 | - | - |
| `GET /api/students/me/common-application` | 로그인 | 학생만 | 본인 |
| `PUT /api/students/me/common-application` | 로그인 | 학생만 | 본인 |
| `GET /api/students/department/{department_id}` | 편성자 | - | 부서(편성자) |
| `PATCH /api/students/{student_id}/active-period` | 직원 | - | 부서 소속 학생 |
| `PATCH /api/students/{student_id}/team-lead` | 직원 | - | 부서 소속 학생 |

### 가능시간 · 수업 시간표
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `POST /api/availability` | 로그인 | 학생만 | - |
| `GET · PUT /api/availability/me` | 로그인 | 학생만 | - |
| `GET · PUT /api/availability/me/note` | 로그인 | 학생만 | - |
| `POST /api/availability/me/note/suggest` | 로그인 | 학생만 | - |
| `POST /api/availability/exceptions` | 로그인 | 학생만 | - |
| `GET /api/availability/exceptions/me` | 로그인 | 학생만 | - |
| `DELETE /api/availability/exceptions/{exception_id}` | 로그인 | 학생만 | - |
| `GET · PUT /api/class-time/me` | 로그인 | 학생만 | - |
| `GET /api/availability/department/{department_id}` | 편성자 | - | 부서(편성자) |
| `GET /api/availability/department/{department_id}/dates` | 편성자 | - | 부서(편성자) |
| `GET /api/availability/department/{department_id}/notes` | 편성자 | - | 부서(편성자) |
| `GET /api/class-time/department/{department_id}` | 편성자 | - | 부서(편성자) |
| `GET /api/class-time/department/{department_id}/dates` | 편성자 | - | 부서(편성자) |
| `POST /api/availability/department/{department_id}/import-from-applications` | **직원** | - | 부서(직원) |

### 근무표
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `GET /api/schedule/me` | 로그인 | 학생만 | - |
| `GET · PATCH /api/schedule/policy/{department_id}` | 편성자 | - | 부서(편성자) |
| `GET /api/schedule/policy/me`, `/me/days` | 로그인 | 학생만 | - |
| `POST /api/schedule/generate` | 편성자 | - | 부서(편성자) |
| `POST /api/schedule/review` | 편성자 | - | 부서(편성자) |
| `GET /api/schedule/verify` | 편성자 | - | 부서(편성자) |
| `POST /api/schedule/confirm` | 편성자 | - | 부서(편성자) |
| `GET /api/schedule/draft` | 편성자 | - | 부서(편성자) |
| `POST /api/schedule/draft/edits` | 편성자 | - | 부서(편성자) — 항목마다 |
| `GET /api/schedule/department/{department_id}` | 편성자 | - | 부서(편성자) |
| `POST /api/schedule/manual` | **직원** | - | 부서(직원) |
| `POST /api/schedule/review/clarifications` | **직원** | - | 없음 (8절) |

### 검토 챗봇
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `POST /api/schedule/chat/sessions` | 편성자 | - | 부서(편성자) |
| `GET · POST /api/schedule/chat/sessions/{id}/messages` | 편성자 | - | 세션 개설자 |
| `POST .../messages/{message_id}/revert` | 편성자 | - | 세션 개설자 |
| `POST .../weights/persist` | 편성자 | - | 세션 개설자 · 부서(편성자) |

### 대타
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `POST /api/substitute-requests` | 로그인 | 학생만 | 본인 근무 |
| `GET /api/substitute-requests/me` · `/open` | 로그인 | 학생만 | - |
| `GET /api/substitute-requests/preview-candidates` | 로그인 | 학생만 | 본인 근무 |
| `PATCH /api/substitute-requests/{id}/respond` | 로그인 | 학생만 | - |
| `PATCH /api/substitute-requests/{id}/cancel` | 로그인 | - | 요청자 본인 |
| `GET /api/substitute-requests/{id}/candidates` | 로그인 | - | 직원은 부서, 학생은 요청자 본인 |
| `GET /api/substitute-requests/department/{department_id}` | 편성자 | - | 부서(편성자) |
| `GET /api/substitute-requests/{id}/ai-check` | **직원** | - | 부서(직원) |
| `PATCH /api/substitute-requests/{id}/approve` | **직원** | - | 부서(직원) |
| `PATCH /api/substitute-requests/{id}/reject` | **직원** | - | 부서(직원) |

### 과목 TA
| 엔드포인트 | 게이트 | 역할 | 스코프 |
|---|---|---|---|
| `GET /api/course-ta/{department_id}/courses` | 편성자 | - | 부서(편성자) |
| `GET .../courses/{course_id}/candidates` | 편성자 | - | 부서(편성자) |
| `POST .../courses/{course_id}/tas` | 편성자 | - | 부서(편성자) |
| `DELETE .../courses/{course_id}/tas/{student_id}` | 편성자 | - | 부서(편성자) |

---

## 5. 학생팀장에게 열린 것과 닫힌 것

| | 경로 |
|---|---|
| **열림** | 근무표 생성·확정 · draft 조회/편집 · 검토 챗봇 · AI 검토 · 배치 검증 · 부서 가능시간/수업시간/특이사항 수합 조회 · 부서 확정 근무표 조회 · 부서 학생 목록 · **부서 정책 조회/변경** · 과목 TA 배정 |
| **닫힘** | 대타 승인·반려·AI 검사 · 공고 등록/수정 · 지원서 조회/합불 처리 · 학생 활동기간 수정 · 팀장 승격 · 지원서 가능시간 연동 · 수동 근무 등록 |

**부서 정책 변경까지 연 이유**는 개관 시간·근무 슬롯·배정 인원이 곧 편성 결과이기
때문입니다. 편성만 맡기고 기준값은 직원 몫으로 두면 팀장이 근무표를 짤 때마다 직원
응답을 기다리게 됩니다. 처음에는 조회만 열었다가 변경까지 넓혔습니다.

**지원서 조회를 닫아 둔 이유**는 그 API가 자소서 본문을 담기 때문입니다 — 팀장은
동료 학생이므로 동료의 자소서를 열어 줄 수 없습니다.

---

## 6. 프론트엔드는 게이트가 아니다

`App.jsx`에는 라우트 가드가 없습니다. `/admin/*`을 포함한 모든 경로가 조건 없이
렌더링되고, 각 페이지가 `getSessionUser()`로 **메뉴와 버튼을 조정할 뿐**입니다
(`AdminShell.jsx`는 `is_team_lead`로 사이드바 메뉴를, `AdminSchedulePage.jsx`는
지원서 연동 버튼을 감춥니다).

**이건 표시 제어이지 권한 제어가 아닙니다.** 주소를 직접 쳐서 관리자 화면에 들어가도
화면은 뜨지만, 그 화면이 부르는 API가 전부 3절의 게이트를 지나므로 데이터는 401/403만
돌아옵니다. 권한의 진실은 서버에만 있습니다.

로그인 응답이 `department_id`·`is_team_lead`·`course_ta_enabled`를 함께 주는 것도
같은 성격입니다 — 편성 화면이 부서 스코프로 API를 부르기 위한 **입력값**이지 권한
근거가 아닙니다. 서버는 이 값들을 매 요청 DB에서 다시 확인합니다.

---

## 7. 경계를 지키는 테스트

`backend/tests/test_schedule_editor_permission.py` — 부서 2곳, 직원 1명, 같은 부서의
학생팀장과 일반 학생, 다른 부서의 학생팀장을 세워 두고 경계를 확인합니다.

```
.venv/bin/python3 -m pytest tests/test_schedule_editor_permission.py -q
→ 24 passed in 2.78s   (2026-09-01 실행)
```

확인하는 것:

- 학생팀장이 편성 경로(생성·확정·draft·챗봇·검증·수합 조회)를 통과한다
- 팀장이 아닌 근로 학생은 편성 경로에 못 들어온다
- **다른 부서** 팀장은 권한이 있어도 403 — 정책 변경·AI 검토(배치 ID만 받는 경로 포함)
- 팀장은 대타 승인·공고 관리·지원자 자소서 조회를 할 수 없다
- 팀장은 다른 팀장을 만들 수 없고, 직원도 자기 부서 학생만 승격할 수 있다
- 로그인 응답이 팀장에게 부서 스코프를 준다

---

## 8. 알려진 한계

문서가 현재 구조를 기록하는 것이므로, 지금 약한 곳도 함께 적습니다.

- **HTTPS가 적용돼 있지 않습니다** (도메인 미발급). Bearer 토큰과 비밀번호가 평문으로
  오갑니다. 데모 환경 한정으로 감수 중이며, 실서비스 전에 반드시 닫아야 합니다.
- **서버 측 토큰 무효화가 없습니다.** 로그아웃은 `sessionStorage`를 지울 뿐이고,
  발급된 토큰은 60분 만료까지 유효합니다. 리프레시 토큰도 블랙리스트도 없습니다.
- **회원가입·비밀번호 변경 엔드포인트가 없습니다** (`routers/auth.py`의 TODO).
  계정은 시드 스크립트로 만듭니다.
- **`SECRET_KEY` 기본값이 `"change-this-secret-key"`** 입니다. 운영은 `.env`로
  주입하지만(`DEPLOY.md`), 주입을 빠뜨려도 앱이 그냥 뜹니다 — 기동 시 검증이 없습니다.
- **`POST /api/schedule/review/clarifications`에 부서 스코프 검사가 없습니다.**
  직원이면 다른 부서의 `target_id`로도 되묻기 답변을 남길 수 있습니다. INSERT 전용
  로그 테이블이라 실제 데이터를 바꾸지는 않지만, 다른 직원 전용 경로와 기준이 다릅니다.
- `app/auth.py`에 `OAuth2PasswordBearer` 방식으로 재정리하겠다는 TODO가 남아 있습니다.
  지금은 `HTTPBearer`를 씁니다.
