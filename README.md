# STREAM

교내 근로 공고, 지원, 선발, 근무표, 대타 관리를 통합하는 프로젝트입니다.

## Backend 실행

```bash
cd backend

python3 -m venv .venv               # 가상환경 생성   

source .venv/bin/activate           # 가상환경 활성화(macOS)
source .venv/Scripts/activate       # 가상환경 활성화(Windows)

pip install -r requirements.txt     # 패키지 설치

uvicorn app.main:app --reload --port 8000
```

## Frontend 실행
새로운 터미널을 열어 다음 명령어를 실행합니다.
```bash
cd frontend
npm install
npm run dev
```

## 프로젝트 폴더 구조
```
STREAM/
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   └── app/
│       └── main.py
├── frontend/
│   ├── .env.example
│   ├── package.json
│   └── src/
├── docs/
├── .gitignore
└── README.md
```