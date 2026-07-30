# 통합 개발 환경 실행 가이드

프론트엔드(Vite) + 백엔드(FastAPI) + DB(PostgreSQL)를 로컬에서 함께 띄우고,
팀 공용 mock 시드 데이터로 작업하는 방법입니다. (이슈 #49)

## 0. 사전 준비

- Python 3.11+
- Node.js 18+
- Docker (또는 로컬 PostgreSQL 16)

## 1. DB 띄우기

### Docker 사용 (권장)

```bash
cd infra
docker compose up -d
```

`stream_user / stream_pass / stream_db` (포트 5432)로 뜹니다 —
`backend/.env.example`의 `DATABASE_URL`과 동일합니다.

### 로컬 PostgreSQL 사용

이미 로컬에 Postgres가 돌고 있다면 유저·DB만 만들어 주세요.

```bash
psql postgres -c "CREATE USER stream_user WITH PASSWORD 'stream_pass'" -c "CREATE DATABASE stream_db OWNER stream_user"
```

## 2. 백엔드 실행

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 최초 1회
uvicorn app.main:app --reload --port 8000
```

## 3. 공용 시드 데이터 주입

**팀원 모두 같은 데이터로 작업하기 위해 반드시 이 스크립트를 사용합니다.**
(수동으로 데이터를 넣지 말고, 시드 내용을 바꾸고 싶으면 스크립트를 수정해서 PR)

```bash
cd backend
source .venv/bin/activate
python3 scripts/seed_mock_data.py           # 빈 DB에 주입
python3 scripts/seed_mock_data.py --reset   # 기존 데이터 삭제 후 재주입
```

## 4. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

http://localhost:5173 로 접속합니다. `/api` 요청은 Vite 프록시가
`http://127.0.0.1:8000`(백엔드)으로 전달합니다.

> 백엔드가 꺼져 있으면 DEV 모드에선 `devMockFallback`(브라우저 내 mock)으로
> 동작합니다. 콘솔에 `[dev-mock]` 경고가 보이면 백엔드 미연결 상태입니다.

## 테스트 계정

모든 계정의 비밀번호는 **`stream1234`** 입니다. (로그인 화면은 ID가 숫자면 학생, 아니면 직원으로 판별)

**메인 데모 계정**

| 역할 | ID | 이름 | 비고 |
|---|---|---|---|
| 근로를 알아보는 학생 | `20220081` | 안희진 (국어국문학과) | 공고 조회·지원 데모 — 공고 5건 지원 상태 |
| 정보서비스팀 직원 | `A00123` | 이직원 | 정보서비스팀 근로 학생 관리 담당 |

**정보서비스팀 근로 학생 9명** — 시간표 생성 데모용. 지난 학기 공고(공고 6)에
"합격" 상태로, 부서 가능시간 수합 API(REQ-SCHED-002)와 시간표 생성
(`scheduler/config/sample/students_sample.json`)에 함께 등록돼 있습니다.

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

**부서별 직원 (공고 작성자)**

| ID | 이름 | 소속 | 비고 |
|---|---|---|---|
| `STF001` | 김직원 | 학생지원팀 | 공고 1 작성자 |
| `A00123` | 이직원 | 로욜라도서관 정보서비스팀 | 공고 2·6 작성자 |
| `STF003` | 이입학 | 입학처 | 공고 3 작성자 |
| `STF004` | 최민원 | 종합봉사실 학생서비스 | 공고 4 작성자 |
| `STF005` | 정국제 | 국제교류팀 | 공고 5 작성자 |

## 시드 데이터 개요

- 부서 5 (부서별 정책 `weekly_only` 포함) · 공고 6 (모집중 4 · 마감 2)
- 공고 1~5 내용은 `frontend/src/api/devMockData.js`와 동일 — 마감일은 학기 중
  유효하도록 9월로 설정돼 있고, devMockData.js도 같은 날짜를 사용
- 공고 6(마감)은 정보서비스팀 근로 학생 9명의 "합격" 근거 데이터
- 지원서(`cover_letter`)는 프론트 `buildCoverLetter()` 형식으로 저장돼
  지원 상세 화면에서 구조화된 형태로 렌더링됨
- 시간표 생성(`POST /api/schedule/generate`)은 `department_id: 2`(정보서비스팀)로
  호출 — 학생 데이터는 아직 DB가 아닌 `students_sample.json`에서 읽으며,
  국가/교비 구분도 이 JSON에 있음 (시드 명단과 동일)

## 트러블슈팅

- **로그인 500 / 공고 목록이 `[dev-mock]`으로만 뜸**: 백엔드(8000)가 안 떠 있거나 DB 연결 실패. `uvicorn` 로그 확인.
- **`connection refused` (DB)**: `docker compose ps`로 stream-db 컨테이너 확인, 또는 로컬 Postgres 5432 포트 충돌 확인.
- **공고가 전부 "마감"으로 보임**: 시드가 오래됐을 수 있음 — 마감일이 지났으면 `seed_mock_data.py`의 날짜를 조정해 PR 후 `--reset` 재시드.
