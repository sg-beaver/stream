# 커밋 컨벤션

STREAM 프로젝트의 커밋 메시지는 아래 형식을 사용합니다.

```bash
type(scope): 커밋 메시지
```

예시:

```bash
feat(frontend): 공고 목록 페이지 추가
feat(backend): 공고 조회 API 추가
docs(readme): 로컬 실행 방법 추가
chore(github): 이슈 및 PR 템플릿 추가
test(qa): Sprint 1 QA 체크리스트 추가
```

---

## 1. 기본 규칙

- 커밋 메시지는 한국어로 작성합니다.
- 형식은 `type(scope): 커밋 메시지`를 사용합니다.
- 커밋 메시지는 명사형 또는 간단한 서술형으로 작성합니다.
- 한 커밋에는 하나의 목적만 담습니다.
- `scope`는 담당자가 아니라 변경된 영역을 기준으로 작성합니다.

좋은 예시:

```bash
feat(frontend): 지원서 작성 페이지 추가
fix(backend): CORS 허용 주소 수정
docs(readme): 백엔드 실행 방법 추가
```

피해야 할 예시:

```bash
수정함
최종 수정
이거 고침
프론트 조금 만짐
진짜 최종
```

---

## 2. Type 규칙

| Type | 의미 | 예시 |
|---|---|---|
| `feat` | 새로운 기능 추가 | `feat(frontend): 공고 상세 페이지 추가` |
| `fix` | 버그 수정 | `fix(backend): 지원 상태 변경 오류 수정` |
| `docs` | 문서 수정 | `docs(readme): 로컬 실행 방법 추가` |
| `chore` | 설정, 구조, 템플릿, 기타 작업 | `chore(project): 프로젝트 폴더 구조 초기화` |
| `style` | UI/CSS/포맷 수정 | `style(frontend): 상태 배지 스타일 수정` |
| `refactor` | 기능 변화 없는 코드 구조 개선 | `refactor(frontend): 공고 카드 컴포넌트 분리` |
| `test` | 테스트 코드, QA 체크리스트, 검증 항목 추가 | `test(qa): Sprint 1 서비스 QA 체크리스트 추가` |
| `build` | 빌드, 배포, 의존성 설정 | `build(deploy): Render 실행 명령어 추가` |

---

## 3. Scope 규칙

| Scope | 사용 범위 |
|---|---|
| `frontend` | React/Vite 화면, 컴포넌트, 프론트 API 연결 |
| `backend` | FastAPI, DB, API, 서버 로직 |
| `docs` | `docs/` 폴더 문서 |
| `readme` | `README.md` |
| `github` | Issue/PR 템플릿, GitHub 관련 설정 |
| `env` | `.env.example`, 환경변수 예시 |
| `qa` | QA 체크리스트, 테스트 시나리오 |
| `project` | 전체 폴더 구조, 공통 설정, 여러 영역에 걸친 변경 |
| `deploy` | 배포 설정, 배포 환경 관련 작업 |

---

## 4. 커밋 메시지 작성 규칙

커밋 메시지는 아래처럼 간단하고 명확하게 작성합니다.

| 표현 | 사용 상황 |
|---|---|
| `추가` | 새 파일, 기능, 항목 추가 |
| `수정` | 기존 내용 변경 |
| `삭제` | 불필요한 파일/코드 제거 |
| `분리` | 파일 또는 컴포넌트 분리 |
| `변경` | 이름, 구조, 방식 변경 |
| `연결` | API, 화면, 데이터 연결 |
| `초기화` | 초기 설정 |
| `정리` | 구조, 문서, 스타일 정리 |
| `개선` | 기존 코드나 화면 개선 |

예시:

```bash
feat(frontend): 공고 목록 페이지 추가
feat(backend): 지원서 제출 API 추가
fix(frontend): 공고 카드 레이아웃 수정
docs(docs): API 명세서 수정
chore(env): 환경변수 예시 파일 추가
```

---

## 5. 커밋 분리 기준

가능하면 프론트엔드와 백엔드는 커밋을 나눕니다.

권장:

```bash
feat(backend): 공고 조회 API 추가
feat(frontend): 공고 조회 API 연결
```

한 번에 묶어야 할 때:

```bash
feat(project): 공고 조회 흐름 추가
```

문서와 설정도 가능하면 분리합니다.

권장:

```bash
chore(github): 이슈 및 PR 템플릿 추가
docs(readme): 프로젝트 실행 방법 추가
```

---

## 6. 자주 쓰는 예시

### 프로젝트 초기 세팅

```bash
chore(project): 프로젝트 기본 구조 초기화
chore(github): 이슈 및 PR 템플릿 추가
chore(env): 환경변수 예시 파일 추가
docs(readme): 프로젝트 실행 방법 추가
```

### 프론트엔드

```bash
feat(frontend): 공고 목록 페이지 추가
feat(frontend): 지원서 작성 페이지 추가
style(frontend): 관리자 대시보드 레이아웃 수정
fix(frontend): API 기본 주소 적용 오류 수정
refactor(frontend): 상태 배지 컴포넌트 분리
```

### 백엔드

```bash
feat(backend): 공고 조회 API 추가
feat(backend): 지원서 제출 API 추가
fix(backend): CORS 허용 주소 수정
refactor(backend): 지원서 서비스 로직 분리
```

### 문서/QA

```bash
docs(docs): MVP 범위 문서 추가
docs(docs): API 명세서 수정
test(qa): Sprint 1 서비스 QA 체크리스트 추가
test(qa): 데모 시나리오 체크리스트 수정
```

### 배포

```bash
build(deploy): Vercel 빌드 설정 추가
build(deploy): Render 실행 명령어 추가
fix(deploy): 배포 환경 API 주소 수정
```

---

## 7. 이번 프로젝트 권장 커밋 흐름

초기 세팅 시에는 아래처럼 나눕니다.

```bash
git add .env.example backend/ frontend/ docs/
git commit -m "chore(project): 프로젝트 기본 구조 초기화"

git add .github/
git commit -m "chore(github): 이슈 및 PR 템플릿 추가"

git add README.md
git commit -m "docs(readme): 프로젝트 실행 방법 추가"
```

일반 기능 개발 시에는 아래처럼 나눕니다.

```bash
git add backend/
git commit -m "feat(backend): 공고 조회 API 추가"

git add frontend/
git commit -m "feat(frontend): 공고 조회 API 연결"

git add docs/
git commit -m "docs(docs): API 명세서 수정"
```

---

## 8. 최종 원칙

커밋 메시지는 나중에 팀원이 변경 이력을 봤을 때 아래 질문에 바로 답할 수 있어야 합니다.

1. 어떤 종류의 변경인가?
2. 어느 영역을 바꿨는가?
3. 무엇을 바꿨는가?

예시:

```bash
feat(frontend): 공고 상세 페이지 추가
```

위 메시지는 다음처럼 해석됩니다.

- `feat`: 기능 추가
- `frontend`: 프론트엔드 변경
- `공고 상세 페이지 추가`: 공고 상세 페이지를 새로 추가함
