# STREAM

서강대학교 **교내 근로장학** 생애주기를 하나로 묶은 웹 서비스입니다. 공고 등록부터
지원·선발·근무표 편성·대타 처리까지를 한 곳에서 처리하며, SAINT ERP의 서브시스템으로
설계됐습니다.

**가장 큰 부분은 근무표를 사람이 손으로 짜지 않는다는 점입니다.** 학생들이 낸 가능 시간과
부서가 정한 운영 규칙을 제약으로 넣어 CP-SAT 솔버가 배정안을 만들고, AI가 그 결과를
부서 규칙 기준으로 검토합니다. **확정은 언제나 담당자가 합니다 — AI는 의견만 냅니다.**

## 데모

**http://3.34.82.68** — 로컬 세팅 없이 브라우저로 바로 접속할 수 있습니다.

| 역할 | ID | 이름 |
|---|---|---|
| 학생 | `20220081` | 안희진 |
| 직원 | `STF001` | 박정보 (로욜라도서관 정보서비스팀) |

비밀번호는 모두 `stream1234`입니다. 전체 계정 명단과 배포 절차는
[docs/DEPLOY.md](docs/DEPLOY.md)에 있습니다.

> HTTPS는 아직 적용돼 있지 않습니다(도메인 미발급). 데모 계정 외의 실제 정보를 넣지 마세요.

## 주요 기능

**공고 · 지원 · 선발** — 부서가 공고를 올리고, 학생이 공통 지원서로 지원하고, 담당자가
지원자를 비교해 선발합니다.

**근무표 자동 편성** — 학생 가능 시간 · 수업 시간표 · 부서 운영 규칙(개관 시간, 근무 슬롯,
슬롯당 인원, 주간 상한)을 제약으로 넣어 CP-SAT 솔버가 배정안을 만듭니다. 제약과 목적함수
정의는 [docs/SCHEDULER_SPEC.md](docs/SCHEDULER_SPEC.md)에 있습니다.

**AI 검토와 되묻기** — 부서가 자연어로 적어 둔 운영 규칙을 기준으로 AI가 초안을 점검하고,
판단에 정보가 부족하면 담당자에게 되묻습니다.

**시간표 검토 챗봇** — 초안을 보면서 대화로 고칩니다("수요일 조수현 근무 다 빼줘"). 수정은
한 번에 되돌릴 수 있습니다.

**대타 요청 · 승인** — 학생이 근무 일부 시간만 골라 동료에게 넘길 수 있고, 담당자가
승인합니다. 승인 시 AI가 적합성(가능 시간·주간 상한 등)을 함께 검사합니다.

> AI에 보내는 프롬프트에서는 학번·이름 같은 식별자를 치환해 내보냅니다.

## 로컬 실행

전체 순서 · 테스트 계정 · 트러블슈팅은 [docs/DEV_SETUP.md](docs/DEV_SETUP.md)를 보세요.

```bash
# 1. DB (PostgreSQL) — 유저·DB 생성 (설치 방법과 Docker 대안은 DEV_SETUP.md 3절)
psql postgres -c "CREATE USER stream_user WITH PASSWORD 'stream_pass'" -c "CREATE DATABASE stream_db OWNER stream_user"
```

```bash
# 2. Backend — http://localhost:8000 (API 문서는 /docs)
cd backend
python3 -m venv .venv            # 최초 1회
source .venv/bin/activate        # macOS/Linux (Windows: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
cp .env.example .env             # 최초 1회 (Windows: copy .env.example .env)
uvicorn app.main:app --reload --port 8000
```

```bash
# 3. 공용 시드 데이터 — 팀원 모두 같은 mock 데이터로 맞춘다 (backend/ 안에서)
python3 scripts/seed_mock_data.py
```

```bash
# 4. Frontend — http://localhost:5173
cd frontend && npm install && npm run dev
```

프론트는 API를 상대경로(`/api`)로 부릅니다. 로컬은 Vite 프록시가, 배포는 nginx가 같은
오리진에서 백엔드로 넘기므로 **API 주소를 따로 설정할 필요가 없습니다.**

## 기술 스택

| 영역 | 스택 |
|---|---|
| 백엔드 | Python 3.13 · FastAPI 0.139 · SQLAlchemy 2.0 · Pydantic 2.13 |
| 스케줄러 | Google OR-Tools 9.15 (CP-SAT) |
| AI | Google Gemini (`google-genai`) |
| 프론트엔드 | React 18 · Vite 6 · React Router 7 |
| DB | PostgreSQL 16 |
| 배포 | AWS EC2 · RDS · nginx · GitHub Actions(OIDC) + SSM |

## 저장소 구조

```text
STREAM/
├── backend/      FastAPI 앱 — REST API, CP-SAT 스케줄러, AI 모듈, 테스트
│   ├── app/routers/     HTTP 경계 (공고·지원·근무표·대타·챗봇 등)
│   ├── app/scheduler/   배정 솔버, AI 검토·챗봇·대타검사, 비식별화
│   ├── scripts/         시드 데이터, eval 하네스
│   └── tests/
├── frontend/     React 앱 — 학생 포털 + 직원/관리자 콘솔
├── docs/         명세·규칙·설계 문서 (아래 '문서' 절)
├── infra/        배포 스크립트, docker-compose
├── uiux/         디자인 시스템 — 토큰·컴포넌트·화면 UI 키트
├── ai/           교내 근로 공고 크롤링·정제 파이프라인
├── research/     교대 근무 스케줄링 알고리즘·사례 조사
├── CLAUDE.md     AI 코딩 도구용 프로젝트 규칙
└── LOG.md        개발 로그 (문제 → 검증 → 수정 → 실측)
```

## 문서

**시작하기**

- 개발 환경 세팅 & 실행: [docs/DEV_SETUP.md](docs/DEV_SETUP.md)
- AWS 배포: [docs/DEPLOY.md](docs/DEPLOY.md)

**설계·명세**

- 프로젝트 배경·용어·기능 요구사항: [docs/STREAM_CONTEXT.md](docs/STREAM_CONTEXT.md)
- API 명세: [docs/API_SPEC.md](docs/API_SPEC.md)
- 스케줄러(CP-SAT) 명세: [docs/SCHEDULER_SPEC.md](docs/SCHEDULER_SPEC.md)
- 데이터 모델: [docs/ERD.md](docs/ERD.md)

**협업 규칙**

- 브랜치 규칙: [docs/BRANCH_CONVENTION.md](docs/BRANCH_CONVENTION.md)
- 커밋 규칙: [docs/COMMIT_CONVENTION.md](docs/COMMIT_CONVENTION.md)

## 개발 가이드

- `develop`에서 작업 브랜치를 따고, PR로 `develop`에 머지합니다. `main`·`develop`에 직접
  커밋하지 않습니다.
- 커밋 메시지는 `type(scope): 한국어 메시지` 형식입니다.
- 문서 변경, UI 자산 변경, 기능 구현은 가능하면 서로 다른 커밋으로 나눕니다.
- 스케줄러(CP-SAT)를 손봤다면 [LOG.md](LOG.md)에 문제 → 테스트 조건 → Before → 수정 →
  After를 남깁니다. **수치는 실제 실행 결과만 적습니다.**
