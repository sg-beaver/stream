# DEVELOPER.md
### STREAM Backend 개발 환경 세팅 가이드

이 문서는 STREAM 백엔드(FastAPI + PostgreSQL)를 로컬 환경에서 처음부터 실행하는 방법을 안내합니다. 새로 합류한 팀원이나, 다른 컴퓨터에서 다시 세팅할 때 이 문서만 보고 따라오면 됩니다.

---

## 1. 필요 프로그램 (최초 1회 설치)

| 프로그램 | 확인 명령어 | 설치처 |
|---|---|---|
| Python 3.10+ | `python3 --version` | https://www.python.org |
| Docker Desktop | `docker --version` | https://www.docker.com |
| Claude Code (선택) | `claude --version` | `npm install -g @anthropic-ai/claude-code` |

> ⚠️ Docker Desktop은 반드시 **앱 자체가 실행 중**이어야 `docker` 명령어가 동작합니다. Mac 상단 메뉴바에 고래 아이콘이 떠 있는지 확인하세요.

---

## 2. 저장소 클론

```bash
mkdir -p ~/dev   # 개발 프로젝트 전용 폴더 (없다면 생성)
cd ~/dev
git clone <팀 GitHub 저장소 URL>
cd stream
```

> ⚠️ **iCloud Drive, OneDrive 등 클라우드 동기화 폴더 안에는 클론하지 마세요.** `.git` 폴더가 동기화되면서 충돌/손상이 발생할 수 있습니다. 또한 폴더 경로에 **한글이나 공백을 포함하지 마세요** (일부 Python 도구가 인식 못 함).

---

## 3. PostgreSQL 실행 (Docker)

```bash
docker run --name stream-db \
  -e POSTGRES_USER=stream_user \
  -e POSTGRES_PASSWORD=stream_pass \
  -e POSTGRES_DB=stream_db \
  -p 5432:5432 \
  -d postgres:16
```

확인:
```bash
docker ps   # stream-db가 "Up" 상태로 보이면 성공
```

> 💡 컴퓨터를 재부팅하거나 Docker Desktop을 껐다 켜면 컨테이너가 꺼져 있을 수 있습니다. 그럴 땐 다시 만들 필요 없이:
> ```bash
> docker start stream-db
> ```

---

## 4. Python 가상환경 및 패키지 설치

**반드시 저장소 최상위(`stream/`)에서 실행하세요.** (`backend/` 안이 아닙니다 — 아래 "폴더 구조" 참고)

```bash
cd ~/dev/stream
python3 -m venv venv
source venv/bin/activate        # Windows(PowerShell): venv\Scripts\Activate.ps1
cd backend
pip install -r requirements.txt
```

가상환경이 켜지면 터미널 프롬프트 앞에 `(venv)`가 붙습니다. 이게 안 보이면 명령어가 다 실패하니 항상 확인하세요.

---

## 5. 환경 변수 설정 (.env)

`backend/.env` 파일을 생성하고 아래 항목을 채웁니다.

```dotenv
DATABASE_URL=postgresql://stream_user:stream_pass@localhost:5432/stream_db
SECRET_KEY=여기에_랜덤_문자열_생성해서_넣기
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173
```

> 💡 `backend/.env.example`에 항목 이름만 정리되어 있으니, 이 파일을 복사해서 `backend/.env`로 저장한 뒤 값만 채워도 됩니다.

**SECRET_KEY는 직접 지어내지 말고 아래 명령어로 생성한 값을 사용하세요:**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

> ⚠️ **SECRET_KEY를 바꾸면 그 이전에 발급된 모든 토큰이 즉시 무효화됩니다.** 값을 변경한 뒤에는 반드시 토큰을 다시 발급받으세요 (7번 항목 참고).

> `.env`는 git에 커밋되지 않습니다(`.gitignore`에 등록됨). 팀원과 공유할 값의 "형식"만 알려주고 싶다면 `.env.example`(값은 비우고 키만 남긴 파일)을 대신 공유하세요.

---

## 6. 서버 실행

`backend/` 폴더 안에서 실행합니다.

```bash
cd ~/dev/stream/backend
uvicorn app.main:app --reload
```

성공하면:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

브라우저에서 확인:
- `http://127.0.0.1:8000/` → `{"status":"ok"}`
- `http://127.0.0.1:8000/docs` → API 테스트 화면(Swagger UI)

**정상 종료는 항상 Ctrl+C로 하세요.** 터미널 창을 그냥 닫으면 서버가 백그라운드에 남아 다음 실행 시 포트 충돌이 날 수 있습니다.

---

## 7. 테스트용 인증 토큰 발급

POST /api/auth/login으로 로그인하면 토큰이 발급됩니다.

Seed 데이터 기준 테스트 계정:
- 직원: id=STF001, password=test1234, role=staff
- 학생: id=20221234, password=test1234, role=student

/docs에서 로그인 API 실행 → 응답의 token 값을 복사 → Authorize 버튼에 붙여넣기
---

## 8. 초기 테스트 데이터 넣기 (Seed)

빈 DB로는 대부분의 API가 FK 제약조건 때문에 실패합니다. 최소한 아래 데이터는 넣어두고 테스트하세요.

로그인 API로 실제 인증을 테스트하려면 `password_hash`에 진짜 bcrypt 해시가 들어가야 합니다. 아래 스크립트로 평문 비밀번호를 해시로 변환하세요.

```bash
cd backend
python3 scripts/hash_password.py "테스트비밀번호1234"
# $2b$12$... 형태의 해시가 출력됩니다. 이 값을 password_hash 자리에 그대로 넣으세요.
```

```bash
docker exec -it stream-db psql -U stream_user -d stream_db -c "INSERT INTO department (department_id, name, weekly_hour_limit, headcount_to) VALUES (1, '로욜라도서관 정보서비스팀', 14, 5);"

docker exec -it stream-db psql -U stream_user -d stream_db -c "INSERT INTO staff (staff_id, name, department_id, email, phone, password_hash) VALUES ('STF001', '김직원', 1, 'staff1@sogang.ac.kr', '010-1234-5678', '<위에서 생성한 해시>');"

docker exec -it stream-db psql -U stream_user -d stream_db -c "INSERT INTO student (student_id, name, department_name, phone, password_hash) VALUES ('20221234', '김서강', '경영학부', '010-1111-2222', '<위에서 생성한 해시>');"
```

> 로그인 API 없이 토큰만 빨리 발급받아 테스트할 거라면(7번 항목의 대체 방법) `password_hash`는 아무 문자열이어도 상관없습니다 — FK 제약조건만 걸리기 때문입니다.

DB 직접 접속해서 확인하고 싶을 때:
```bash
docker exec -it stream-db psql -U stream_user -d stream_db
# 접속 후: SELECT * FROM staff;
# 나가기: \q
```

---

## 9. 폴더 구조

```
stream/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI 진입점
│   │   ├── database.py       # DB 연결 설정
│   │   ├── models.py         # 테이블 정의 (SQLAlchemy)
│   │   ├── schemas.py        # Request/Response 형식 (Pydantic)
│   │   ├── auth.py           # JWT 발급/검증
│   │   └── routers/          # API 엔드포인트별 파일 (auth.py, postings.py, ...)
│   ├── .env                  # (git 미포함, 직접 생성)
│   ├── .env.example          # 값은 비운 항목 목록 (git 포함)
│   └── requirements.txt
├── frontend/
├── docs/
│   ├── API_SPEC.md           # API 명세서 + 요구사항 통합본
│   ├── ERD.md                # ERD
│   ├── BRANCH_CONVENTION.md  # 브랜치 컨벤션
│   ├── COMMIT_CONVENTION.md  # 커밋 컨벤션
│   └── developer.md          # 이 문서
├── venv/                     # backend와 같은 레벨! (backend 안이 아님)
└── .gitignore
```

> ⚠️ **`venv`는 `backend/` 안이 아니라 저장소 최상위에 있습니다.** `backend` 폴더 안에서 `source venv/bin/activate`를 치면 "No such file" 에러가 납니다. 이 경우 `source ../venv/bin/activate`를 사용하세요.

---

## 10. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `ModuleNotFoundError: No module named 'app'` | `backend` 폴더 밖에서 uvicorn 실행 | `cd backend` 후 재실행 |
| `source: no such file or directory: venv/bin/activate` | venv 위치 착각 (backend 밖에 있음) | `source ../venv/bin/activate` |
| `ERROR: [Errno 48] Address already in use` | 8000번 포트를 이전 프로세스가 점유 | `kill -9 $(lsof -ti :8000)` 후 재실행 |
| `psycopg2.OperationalError: Connection refused` | Docker의 PostgreSQL 컨테이너가 꺼져 있음 | `docker start stream-db` |
| `ModuleNotFoundError: No module named 'passlib'` (또는 기타 패키지) | 패키지 설치 누락 | `pip install -r requirements.txt`, 없으면 개별 `pip install` 후 `pip freeze > requirements.txt` |
| `psycopg2.errors.ForeignKeyViolation: ... is not present in table "staff"` | 토큰의 staff_id가 실제 STAFF 테이블에 없음 | 8번 항목의 Seed 데이터 삽입 |
| `/docs`의 Authorize가 로그인 폼(username/password)으로 뜸 | auth 방식이 OAuth2PasswordBearer로 되어 있음 | HTTPBearer 방식으로 전환 (토큰 값만 붙여넣으면 되는 방식) |
| `{"error": "인증 정보가 유효하지 않습니다."}` (401) | SECRET_KEY 변경 후 예전 토큰 사용 | 토큰 재발급 (7번 항목) |
| `docker ps`에 컨테이너가 안 보임 | 컨테이너 자체가 생성된 적 없음 | 3번 항목의 `docker run` 명령어 재실행 |

---

## 11. Git 브랜치 작업 흐름 (요약)

자세한 내용은 `docs/BRANCH_CONVENTION.md` 참고. 핵심 흐름만 정리하면:

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

## 12. 참고 문서

- ERD: `docs/ERD.md` (또는 `STREAM_ERD_설명자료_v2.md`)
- API 명세서 + 요구사항: `docs/API_SPEC.md` (또는 `STREAM_API_요구명세서_통합본.md`)
- 브랜치 컨벤션: `docs/BRANCH_CONVENTION.md`
