# 개발 환경 세팅 & 실행 가이드

프론트엔드(Vite) + 백엔드(FastAPI) + DB(PostgreSQL)를 로컬에서 함께 띄우고,
팀 공용 mock 시드 데이터로 작업하는 방법입니다.

새로 합류한 팀원이나 다른 컴퓨터에서 다시 세팅할 때 이 문서만 보고 따라오면 됩니다.

---

## 1. 사전 준비 (최초 1회 설치)

| 프로그램 | 확인 명령어 | 설치처 |
|---|---|---|
| Python 3.11+ | `python3 --version` | https://www.python.org |
| Node.js 18+ | `node --version` | https://nodejs.org |
| PostgreSQL **또는** Docker | `psql --version` / `docker --version` | 3절에서 둘 중 하나만 선택 |
| Claude Code (선택) | `claude --version` | `npm install -g @anthropic-ai/claude-code` |

> **Docker는 필수가 아닙니다.** DB를 띄우는 두 가지 방법 중 하나일 뿐이고,
> 백엔드는 `DATABASE_URL`만 보기 때문에 그 Postgres가 컨테이너인지 로컬 설치인지
> 구분하지 않습니다. 3절에서 편한 쪽을 고르세요.

---

## 2. 저장소 클론 (최초 1회)

```bash
git clone <팀 GitHub 저장소 URL>
cd stream
```

> ⚠️ **iCloud Drive, OneDrive 등 클라우드 동기화 폴더 안에는 클론하지 않는 것을 추천.**
> `.git` 폴더가 동기화되면서 충돌·손상이 발생할 수 있습니다.
> ⚠️ 경로에 **한글이나 공백을 포함하지 않는 것을 추천.** (일부 Python 도구가 인식하지 못합니다).

---

## 3. DB 띄우기

**A안(로컬 설치)과 B안(Docker) 중 하나만 하면 됩니다.** 둘 다 하면 5432 포트가
충돌합니다. 어느 쪽이든 접속 정보는 동일하게 `stream_user / stream_pass / stream_db`
(포트 5432)이고, `backend/.env.example`의 `DATABASE_URL`을 그대로 씁니다.

| | A안: 로컬 설치 | B안: Docker |
|---|---|---|
| 장점 | Docker Desktop 불필요, 메모리 절약, 항상 켜져 있음 | 버전이 팀 전체 동일, 지우고 다시 만들기 쉬움 |
| 단점 | 각자 설치 버전이 다를 수 있음 | Docker Desktop 상시 실행 필요 |

### A안: 로컬 PostgreSQL 설치

**macOS (Homebrew)**

```bash
brew install postgresql@16
brew services start postgresql@16
```

`postgresql@16`은 keg-only라 PATH 등록이 필요합니다.

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

**Windows** — [공식 설치 프로그램(EDB)](https://www.postgresql.org/download/windows/)으로 설치하고,
설치 마법사에서 정한 슈퍼유저 비밀번호로 SQL Shell(psql) 또는 pgAdmin에 접속합니다.

설치가 끝나면 유저·DB를 만듭니다. (이미 Postgres가 돌고 있다면 이 단계만 하면 됩니다)

```bash
psql postgres -c "CREATE USER stream_user WITH PASSWORD 'stream_pass'" -c "CREATE DATABASE stream_db OWNER stream_user"
```

확인:

```bash
psql -h localhost -U stream_user -d stream_db -c "select current_database()"
```

> 💡 `brew services start`로 등록해두면 재부팅 후에도 자동으로 올라옵니다.
> 상태 확인은 `brew services list`.

### B안: Docker Compose

```bash
cd infra
docker compose up -d
docker compose ps    # stream-db가 "running"이면 성공
```

컨테이너 이름은 `stream-db`이고, 데이터는 named volume에 보존됩니다.
Docker Desktop은 **앱 자체가 실행 중**이어야 `docker` 명령이 동작합니다.

> 💡 컴퓨터를 재부팅하거나 Docker Desktop을 껐다 켜면 컨테이너가 꺼져 있을 수 있습니다.
> 다시 만들 필요 없이 `docker start stream-db` 또는 `docker compose up -d`로 올리면 됩니다.

> ⚠️ 로컬 Postgres가 이미 5432를 쓰고 있으면 컨테이너가 뜨지 않습니다.
> `brew services stop postgresql@16`으로 먼저 내리거나, A안을 그대로 쓰세요.

---

## 4. 백엔드 세팅

가상환경은 **`backend/` 안에 `.venv`로** 만듭니다.

```bash
cd backend

# 가상환경 생성(1번만)
python3 -m venv .venv

# 가상환경 활성화
source .venv/bin/activate      # macOS 가상환경 활성화
.venv\Scripts\Activate.ps1  # Windows(PowerShell) 가상환경 활성화

# 패키지 설치
pip install -r requirements.txt
```

가상환경이 켜지면 프롬프트 앞에 `(.venv)`가 붙습니다. 이게 안 보이면 이후 명령이 전부
실패하니 항상 확인하세요.

### 환경 변수 (.env)

`.env.example`을 복사해서 `backend/.env`를 만듭니다. (최초 1회)

```bash
cp .env.example .env
```

| 키 | 설명 |
|---|---|
| `DATABASE_URL` | `postgresql://stream_user:stream_pass@localhost:5432/stream_db` — 기본값 그대로 사용 |
| `SECRET_KEY` | JWT 서명 키. **아래 명령으로 생성한 값으로 바꾸세요** |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` |
| `CORS_ORIGINS` | `http://localhost:5173` (프론트 dev 서버) |
| `GEMINI_API_KEY` | **AI 기능(근무표 검토·챗봇·대타 적합성)을 쓸 때 필요.** 비어 있으면 해당 API만 실패하고 나머지는 정상 동작 |
| `REVIEW_MODEL` / `CHAT_MODEL` | 프로덕션 AI가 쓰는 Gemini 모델. 비워두면 코드 기본값(#177) |
| `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `LOCAL_BASE_URL` | **모델 비교 실험 전용**(#114, `scripts/eval_review.py --provider`). 평소 개발에는 필요 없습니다 |

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

> ⚠️ **`SECRET_KEY`를 바꾸면 그 이전에 발급된 모든 토큰이 즉시 무효화됩니다.**
> 값을 변경한 뒤에는 반드시 토큰을 다시 발급받으세요 (9번 항목).

> `.env`는 git에 커밋되지 않습니다(`.gitignore` 등록). 팀원과는 값을 비운
> `.env.example`만 공유하세요.

---

## 5. 백엔드 실행

`backend/` 폴더 안에서 실행합니다.

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

성공하면:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

브라우저에서 확인:

- `http://127.0.0.1:8000/` → `{"status":"ok"}`
- `http://127.0.0.1:8000/docs` → API 테스트 화면(Swagger UI)

**정상 종료는 항상 Ctrl+C로 하세요.** 터미널 창을 그냥 닫으면 서버가 백그라운드에 남아
다음 실행 시 포트 충돌이 납니다.

### 테스트 실행

```bash
cd backend
.venv/bin/python3 -m pytest -q                   # 전체
.venv/bin/python3 -m pytest tests/scheduler -q   # 근무표 생성 엔진만
```

> ⚠️ **반드시 `backend/.venv`의 파이썬으로 실행하세요.** conda 등 다른 파이썬으로 돌리면
> CP-SAT 솔버가 응답 없이 멈추는 경우가 있습니다. `.venv`를 activate 했더라도
> `which python3`로 경로를 한 번 확인하는 편이 안전합니다.

---

## 6. 공용 시드 데이터 주입

**팀원 모두 같은 데이터로 작업하기 위해 반드시 이 스크립트를 사용합니다.**
수동으로 데이터를 넣지 말고, 시드 내용을 바꾸고 싶으면 아래를 수정해서 PR을 올리세요.

- **계정 명단·가능시간**: `backend/scripts/seed_data/*.csv` (엑셀 편집 가능 — 규칙은 그 폴더의 README.md)
- **공고·지원서** 등 구조가 복잡한 데이터: `scripts/seed_mock_data.py` 내부

```bash
cd backend
source .venv/bin/activate
python3 scripts/seed_mock_data.py                    # 빈 DB에 주입 (데이터가 있으면 중단)
python3 scripts/seed_mock_data.py --reset           # 기존 데이터 삭제 후 재주입
python3 scripts/seed_mock_data.py --only aat-dept   # 기존 데이터를 두고 검증용 부서 하나만 최신화
```

빈 DB로는 대부분의 API가 FK 제약조건 때문에 실패하므로, 백엔드를 붙여 테스트하기 전에
반드시 한 번 실행해야 합니다. 로컬 개발은 `--reset`이 기본입니다.

`--only`는 **없는 행만 채우는 멱등 동작**이라 여러 번 실행해도 안전하고, 담당자가 화면에서
고친 부서 정책·기존 지원서는 덮지 않습니다. 선택지는 `test-dept`(부서 6) ·
`aat-dept`(부서 7) · `grad-edu-dept`(부서 8) 세 가지입니다 (8.3 참고).

> ⚠️ `--reset`은 시드 테이블을 통째로 지웁니다. `STREAM_ENV=production`이면 거부되며,
> 운영 DB에 데이터를 붙일 때는 `--only`를 씁니다.

> 개별 비밀번호 해시가 필요할 때는 `python3 scripts/hash_password.py "평문비밀번호"`로
> bcrypt 해시를 만들 수 있습니다. (시드 스크립트는 내부적으로 알아서 처리합니다)

---

## 7. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

http://localhost:5173 으로 접속합니다. `/api` 요청은 Vite 프록시가
`http://127.0.0.1:8000`(백엔드)으로 전달합니다.

> 백엔드가 꺼져 있으면 DEV 모드에선 `devMockFallback`(브라우저 내 mock)으로
> 동작합니다. 콘솔에 `[dev-mock]` 경고가 보이면 백엔드 미연결 상태입니다.

---

## 8. 테스트 계정

모든 계정의 비밀번호는 **`stream1234`** 입니다.
(로그인 화면은 ID가 숫자면 학생, 아니면 직원으로 판별)

명단은 `backend/scripts/seed_data/students.csv` · `staff.csv`가 원본이고, 아래 표는
그 CSV를 옮긴 것입니다. 계정을 늘리거나 고칠 때는 CSV를 고쳐 PR을 올리세요.

### 8.1 메인 데모 계정

| 역할 | ID | 이름 | 비고 |
|---|---|---|---|
| 근로를 알아보는 학생 | `20220081` | 안희진 (국어국문학과) | 공고 조회·지원 데모 — 공고 1-5에 지원(제출완료 2 · 검토중 2 · 불합격 1) |
| 정보서비스팀 직원 | `STF001` | 박정보 | 정보서비스팀 근로 학생 관리·근무표 생성 담당 |

### 8.2 정보서비스팀(부서 2) 근로 학생 11명

근무표 생성 데모용. 지난 학기 공고(공고 6)에 "합격" 상태로 들어 있어 부서 가능시간
수합 API(REQ-SCHED-002)가 이 기록으로 부서 소속을 판별합니다.

> 9명 → 11명으로 늘린 이유: 인력이 개관 수요보다 적으면 솔버가 capacity를 100%
> 소진해 **대타를 설 여력이 0**이 되고, 그러면 대타 요청이 하나도 생성되지 않습니다
> (#164). 계산 근거는 `backend/scripts/seed_data/README.md` 참고.

| ID | 이름 | 학과 | 장학 구분 |
|---|---|---|---|
| `20220042` | 김현서 | 국어국문학과 | 국가 |
| `20220912` | 조수현 | 경영학과 | 국가 |
| `20240673` | 권지영 | 경영학과 | 교비 |
| `20211357` | 오규원 | 생명과학과 | 교비 |
| `20220055` | 박민진 | 국어국문학과 | 교비 |
| `20220091` | 윤영민 | 철학과 | 교비 |
| `20220077` | 송형준 | 국어국문학과 | 교비 |
| `20221818` | 정창범 | 기계공학과 | 교비 |
| `20220557` | 안승준 | 경제학과 | 교비 |
| `20230415` | 최유나 | 사회학과 | 교비 |
| `20240922` | 배시온 | 컴퓨터공학과 | 교비 |

### 8.3 검증용 test 부서 3곳 (#172)

실제 운영 시트에서 받은 수합 데이터로 근무표 생성을 검증하는 부서입니다. 부서 이름에
`-test`가 붙어 있고, 공고 설명에도 "실제 모집 공고가 아닙니다"라고 적혀 있습니다.

| 부서 | 직원 | 공고 | 근로 학생 | 특징 |
|---|---|---|---|---|
| 정보서비스팀-test (6) | `STF010` 이정보 | 7 | `20261001`\~`20261010` (10명) | 운영 시트 전사 — **날짜별** 수합(가능/희망/수업)과 날짜 예외까지 재현. `20261005` 김찬우는 학생팀장 |
| 아트&테크놀로지학과-test (7) | `STF011` 윤아텍 | 8 | `20262001`\~`20262022` (22명) | 수업 조교(TA) 부서 — 개설 과목·과목 TA 배정까지 함께 시드(#173). 부서 주간 상한 7시간 |
| 교육대학원 행정팀-test (8) | `STF012` 한교육 | 9 | `20263001`\~`20263010` (10명) | 부서 주간 상한 14시간 |

학생 이름은 `students.csv`의 `role` 열로 구분됩니다 — `test-worker`(부서 6) ·
`aat-worker`(부서 7) · `grad-edu-worker`(부서 8).

이 세 부서는 `--only`로 **운영 DB에도 따로 붙일 수 있습니다** (6번 항목).

### 8.4 부서별 직원 (공고 작성자)

| ID | 이름 | 소속 (부서 id) | 비고 |
|---|---|---|---|
| `STF001` | 박정보 | 로욜라도서관 정보서비스팀 (2) | **메인 관리자** — 공고 2·6 작성자 |
| `STF002` | 김학지 | 학생지원팀 (1) | 공고 1 작성자 |
| `STF003` | 이입학 | 입학팀 (3) | 공고 3 작성자 |
| `STF004` | 최종합 | 종합봉사실 (4) | 공고 4 작성자 |
| `STF005` | 정대외 | 발전홍보팀 (5) | 공고 5 작성자 |
| `STF010` | 이정보 | 정보서비스팀-test (6) | 공고 7 작성자 |
| `STF011` | 윤아텍 | 아트&테크놀로지학과-test (7) | 공고 8 작성자 |
| `STF012` | 한교육 | 교육대학원 행정팀-test (8) | 공고 9 작성자 |

---

## 9. Swagger로 API 테스트하기

`POST /api/auth/login`으로 로그인하면 토큰이 발급됩니다.

1. `http://127.0.0.1:8000/docs` 접속
2. 로그인 API 실행 (위 계정 + 비밀번호 `stream1234`)
3. 응답의 `token` 값 복사
4. 우측 상단 **Authorize** 버튼에 붙여넣기

이후 인증이 필요한 API를 그대로 호출할 수 있습니다.

DB를 직접 들여다보고 싶을 때 — **A안(로컬 설치)**:

```bash
psql -h localhost -U stream_user -d stream_db
```

**B안(Docker)** — 컨테이너 안의 psql을 쓰므로 로컬에 psql이 없어도 됩니다:

```bash
docker exec -it stream-db psql -U stream_user -d stream_db
```

```
접속 후: \dt (테이블 목록) · SELECT * FROM staff;
나가기: \q
```

---

## 10. 시드 데이터 개요

- 부서 8 (실서비스 5 + 검증용 test 3) · 공고 9 (모집중 4 · 마감 5)
- 공고 1-5 내용은 `frontend/src/api/devMockData.js`와 동일 — 마감일은 학기 중
  유효하도록 9월로 설정돼 있고, devMockData.js도 같은 날짜를 사용
- 공고 6(마감)은 정보서비스팀 근로 학생 11명의, 공고 7-9는 검증용 test 부서
  학생들의 "합격" 근거 데이터 — 부서 소속 판정이 이 기록을 봅니다 (8.2·8.3)
- 지원서(`cover_letter`)는 프론트 `buildCoverLetter()` 형식으로 저장돼
  지원 상세 화면에서 구조화된 형태로 렌더링됨
- 근무표 생성(`POST /api/schedule/generate`)은 학생·가능시간·부서 정책을 모두
  **DB에서 읽습니다**. `scheduler/config/sample/students_sample.json`은 이제
  프로토타입(`prototype.py`)과 단위 테스트에서만 쓰는 더미 데이터입니다
- 대타 데모(#72): 시드가 **다음 주부터 2주 확정 근무표를 솔버로 생성**하고 그 위에
  상태별 대타 요청 4건(대기·수락·승인·반려)을 얹습니다. 날짜를 실행일 기준으로
  잡으므로 언제 시드해도 학생 '대타 요청' 화면과 관리자 처리 화면에 바로 보입니다
- 가능시간·수업 시간표는 학기(`term`)별로 들어갑니다 — `2026-2`(가을)와
  `2026-summer`(여름방학) 두 벌. 지금 학기 데이터가 없으면 화면이 빈 채로 보입니다

---

## 11. 폴더 구조

```
stream/
├── ai/                       # AI 관련 실험·분석 노트북
├── research/                 # 조사·분석 자료
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI 진입점
│   │   ├── database.py       # DB 연결 설정
│   │   ├── models.py         # 테이블 정의 (SQLAlchemy)
│   │   ├── schemas.py        # Request/Response 형식 (Pydantic)
│   │   ├── auth.py           # JWT 발급/검증
│   │   ├── services.py
│   │   ├── routers/          # API 엔드포인트별 파일
│   │   │                     #   auth · postings · applications · students · academic
│   │   │                     #   schedule · schedule_chat · substitutes · class_time · course_ta
│   │   └── scheduler/        # 근무표 생성 엔진 (CP-SAT) + AI 검토·챗봇
│   ├── scripts/
│   │   ├── seed_mock_data.py # 팀 공용 시드 (6번 항목)
│   │   ├── seed_data/        # 계정 명단·가능시간 CSV
│   │   ├── eval_*.py         # AI 기능 평가 스크립트
│   │   ├── import_courses.py · sync_holidays.py
│   │   └── hash_password.py
│   ├── tests/                # pytest
│   ├── .venv/                # 가상환경 (git 미포함)
│   ├── .env                  # (git 미포함, 직접 생성)
│   ├── .env.example
│   └── requirements.txt
├── frontend/                 # Vite + React
├── infra/
│   ├── docker-compose.yml    # 로컬 PostgreSQL
│   └── deploy.sh · ssm-deploy.sh
├── docs/                     # 명세·컨벤션 문서 (QA 체크리스트 포함)
└── uiux/                     # 디자인 시스템·UI 자산
```

> ⚠️ 가상환경은 **`backend/.venv`** 입니다. 저장소 최상위에는 `venv/`가 없습니다.
> `backend/` 밖에서 `source .venv/bin/activate`를 치면 "No such file" 에러가 납니다.

---

## 12. Git 브랜치 작업 흐름 (요약)

자세한 내용은 [BRANCH_CONVENTION.md](BRANCH_CONVENTION.md) 참고. 핵심 흐름만 정리하면:

```bash
git checkout develop
git pull origin develop
git checkout -b feat-example-api      # type-keyword 형식

# ... 개발 ...

git add .
git commit -m "feat(backend): 예시 API 구현"
git push origin feat-example-api
# GitHub에서 feat-example-api → develop PR 생성
```

`main`, `develop`에는 직접 커밋하지 않습니다.

---

## 13. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 로그인 500 / 공고 목록이 `[dev-mock]`으로만 뜸 | 백엔드(8000)가 안 떠 있거나 DB 연결 실패 | `uvicorn` 로그 확인 |
| `ModuleNotFoundError: No module named 'app'` | `backend` 폴더 밖에서 uvicorn 실행 | `cd backend` 후 재실행 |
| `source: no such file or directory: .venv/bin/activate` | venv 위치 착각 | `backend/`로 이동 후 `source .venv/bin/activate` |
| `ERROR: [Errno 48] Address already in use` | 8000번 포트를 이전 프로세스가 점유 | `kill -9 $(lsof -ti :8000)` 후 재실행 |
| `psycopg2.OperationalError: Connection refused` | DB가 꺼져 있음 | A안: `brew services list` 확인 → `brew services start postgresql@16` / B안: `docker compose ps` → `docker start stream-db` |
| `Error: port is already allocated` (docker) | 로컬 Postgres가 이미 5432를 점유 | `lsof -ti :5432`로 확인. A·B안 중 하나만 쓰세요 (3절) |
| `role "stream_user" does not exist` | 유저·DB 생성 단계 누락 | 3절 A안의 `CREATE USER` / `CREATE DATABASE` 실행 |
| `ModuleNotFoundError: No module named 'passlib'` 등 | 패키지 설치 누락 | `pip install -r requirements.txt` |
| `ForeignKeyViolation: ... is not present in table "staff"` | 시드 데이터 없음 | 6번 항목의 시드 스크립트 실행 |
| `{"error": "인증 정보가 유효하지 않습니다."}` (401) | `SECRET_KEY` 변경 후 예전 토큰 사용 | 토큰 재발급 (9번 항목) |
| 공고가 전부 "마감"으로 보임 | 시드의 마감일이 지남 | `seed_mock_data.py`의 날짜를 조정해 PR 후 `--reset` 재시드 |
| `DB에 이미 데이터가 있습니다` 하고 시드가 중단됨 | 옵션 없이 실행 — 빈 DB에만 주입 | 로컬이면 `--reset`, 부서 하나만 붙일 거면 `--only` (6번 항목) |
| 근무표를 만들었는데 전부 "미충원" | 생성 날짜가 근로 기간 밖 (`active_from`/`until`) 또는 그 학기 가능시간 없음 | 공고 6 기준 2026-03-02\~2026-12-18 안의 날짜로 생성 (10번 항목) |
| AI 검토·챗봇 API만 500 | `GEMINI_API_KEY` 미설정 | `backend/.env`에 키 입력 후 서버 재시작 (4번 항목) |
| pytest가 CP-SAT 테스트에서 멈춤 | conda 등 `.venv` 밖 파이썬으로 실행 | `backend/.venv/bin/python3 -m pytest` 로 실행 (5번 항목) |

---

## 14. 참고 문서

- AWS 배포 절차: [DEPLOY.md](DEPLOY.md)
- API 명세 + 요구사항: [API_SPEC.md](API_SPEC.md)
- 근무표 생성 엔진 명세: [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md)
- 시스템 아키텍처: [ARCHITECTURE.md](ARCHITECTURE.md)
- 프로젝트 컨텍스트: [STREAM_CONTEXT.md](STREAM_CONTEXT.md)
- ERD: [ERD.md](ERD.md)
- QA 체크리스트: [QA_CHECKLIST.md](QA_CHECKLIST.md)
- 시드 명단 CSV 편집 규칙: [../backend/scripts/seed_data/README.md](../backend/scripts/seed_data/README.md)
- 브랜치 컨벤션: [BRANCH_CONVENTION.md](BRANCH_CONVENTION.md)
- 커밋 컨벤션: [COMMIT_CONVENTION.md](COMMIT_CONVENTION.md)
