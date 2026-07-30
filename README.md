# STREAM

STREAM은 교내 근로 공고, 지원, 선발, 근무표, 대타 관리를 통합적으로 관리하기 위한 프로젝트입니다.

## 프로젝트 개요

- 공고 등록 및 관리
- 지원서 접수 및 상태 확인
- 선발 및 근무 일정 관리
- 대타 요청 및 승인 흐름 지원

현재 저장소는 초기 설계 및 문서 정리 단계이며, 백엔드/프론트엔드 구현과 UI/UX 자산이 함께 정리되어 있습니다.

## 로컬 실행 (FE + BE 통합)

전체 순서·테스트 계정·트러블슈팅은 [docs/DEV_SETUP.md](docs/DEV_SETUP.md)를 참고하세요.

```bash
# 1. DB (PostgreSQL) — 로컬 설치 또는 Docker 중 하나. 자세한 선택 기준은 DEV_SETUP.md 3절
cd infra && docker compose up -d

# 2. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 최초 1회
uvicorn app.main:app --reload --port 8000

# 3. 공용 시드 데이터 (팀원 모두 동일한 mock 데이터 사용)
python3 scripts/seed_mock_data.py

# 4. Frontend — http://localhost:5173
cd frontend && npm install && npm run dev
```

## 저장소 구조

```text
STREAM/
├── ai/                 # AI 관련 실험/기획 자산
├── backend/            # 백엔드 설정 및 의존성
│   ├── .env.example
│   └── requirements.txt
├── docs/               # 요구사항, API 명세, 브랜치/커밋 규칙 등 문서
├── frontend/           # 프론트엔드 초기 구성 파일
│   └── .env.example
├── infra/              # 인프라/배포 관련 자산
├── qa/                 # QA 체크리스트 및 검증 자료
├── uiux/               # 디자인 시스템, UI 컴포넌트, 스타일 자산
├── .gitignore
└── README.md
```

## 문서

- 개발 환경 세팅 & 실행: [docs/DEV_SETUP.md](docs/DEV_SETUP.md)
- 브랜치 규칙: [docs/BRANCH_CONVENTION.md](docs/BRANCH_CONVENTION.md)
- 커밋 규칙: [docs/COMMIT_CONVENTION.md](docs/COMMIT_CONVENTION.md)
- API 명세: [docs/API_SPEC.md](docs/API_SPEC.md)
- MVP 범위: [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md)

## 개발 가이드

- 작업 전에는 브랜치 규칙을 따라 작업 브랜치를 생성합니다.
- 커밋 메시지는 커밋 컨벤션을 따릅니다.
- 문서 변경, UI 자산 변경, 기능 구현은 가능하면 서로 다른 커밋으로 분리합니다.
