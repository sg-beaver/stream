# 브랜치 컨벤션

STREAM 프로젝트의 브랜치 이름과 작업 흐름은 아래 규칙을 따릅니다.

---

## 1. 기본 브랜치

| 브랜치 | 역할 |
|---|---|
| `main` | 최종 안정 버전 |
| `develop` | 개발 통합 브랜치 |
| 작업 브랜치 | 기능 개발, 버그 수정, 문서 작업 등 실제 작업용 브랜치 |

기본 흐름은 아래와 같습니다.

```text
작업 브랜치 → PR → develop → 최종 확인 후 main
```

평소 작업은 `develop`에서 새 브랜치를 만들어 진행합니다.  
`main`에는 직접 커밋하지 않습니다.

---

## 2. 브랜치 이름 형식

브랜치 이름은 아래 형식을 사용합니다.

```bash
type-keyword
```

예시:

```bash
feat-job-list
fix-cors-error
docs-readme
chore-project-setup
```

브랜치 이름에는 슬래시(`/`)를 사용하지 않습니다.  
영어 소문자와 하이픈(`-`)만 사용합니다.

---

## 3. Type 규칙

| Type | 의미 | 예시 |
|---|---|---|
| `feat` | 새로운 기능 개발 | `feat-job-list` |
| `fix` | 버그 수정 | `fix-cors-error` |
| `docs` | 문서 작업 | `docs-readme` |
| `chore` | 설정, 구조, 템플릿 등 기타 작업 | `chore-project-setup` |
| `style` | UI/CSS/화면 스타일 수정 | `style-dashboard-layout` |
| `refactor` | 기능 변화 없는 코드 구조 개선 | `refactor-job-card` |
| `test` | 테스트, QA 체크리스트 작업 | `test-sprint1-qa` |
| `build` | 빌드, 배포 설정 | `build-deploy-config` |

---

## 4. 브랜치 이름 예시

### 프로젝트 초기 세팅

```bash
chore-project-setup
chore-github-template
chore-env-example
docs-readme
docs-commit-convention
docs-branch-convention
```

### 프론트엔드

```bash
feat-job-list
feat-job-detail
feat-application-form
feat-admin-dashboard
feat-substitute-request
style-status-badge
refactor-job-card
fix-job-card-layout
```

### 백엔드

```bash
feat-job-api
feat-application-api
feat-schedule-api
feat-substitute-api
fix-cors-error
fix-application-status
refactor-application-service
```

### QA / 문서 / 배포

```bash
test-sprint1-qa
test-demo-scenario
docs-api-spec
docs-mvp-scope
build-vercel-config
build-render-config
fix-deploy-api-url
```

---

## 5. 작업 흐름

### 1) develop 최신화

```bash
git checkout develop # 로컬에 있는 develop 브랜치로 이동
git pull origin develop # 로컬 develop을 원격 develop 기준으로 최신화 해 받아옴
```

### 2) 작업 브랜치 생성

```bash
git checkout -b feat-job-list # 로컬의 새로고침된 develop 브랜치를 기준으로 복제하여 새로운 로컬 작업 브랜치(feat-job-list)를 생성
```

### 3) 작업 후 커밋

```bash
git add .
git commit -m "feat(frontend): 공고 목록 페이지 추가"
```

### 4) 원격 브랜치 업로드

```bash
git push origin feat-job-list # 로컬 작업 브랜치 feat-job-list를 기준으로 원격 작업 브랜치 feat-job-list를 업데이트
```

### 5) Pull Request 생성

GitHub에서 `feat-job-list` → `develop` 방향으로 PR을 생성합니다.

---

## 6. PR 규칙

PR은 원칙적으로 `develop`을 대상으로 생성합니다.

```text
작업 브랜치 → develop
```

예시:

```text
feat-job-list → develop
fix-cors-error → develop
docs-readme → develop
```

최종 배포 또는 제출 전에는 `develop`에서 확인한 뒤 `main`으로 병합합니다.

```text
develop → main
```

---

## 7. 브랜치 삭제 기준

PR이 병합된 브랜치는 삭제합니다.

원격 브랜치 삭제:

```bash
git push origin --delete feat-job-list
```

로컬 브랜치 삭제:

```bash
git branch -d feat-job-list
```

---

## 8. 주의사항

- `main`에는 직접 커밋하지 않습니다.
- `develop`에도 가능하면 직접 커밋하지 않고 PR로 병합합니다.
- 브랜치 이름은 영어 소문자와 하이픈만 사용합니다.
- 브랜치 이름에 공백, 한글, 슬래시(`/`)를 사용하지 않습니다.
- 하나의 브랜치에서는 하나의 작업 목적만 처리합니다.
- 프론트엔드와 백엔드 작업이 모두 필요한 경우 가능하면 브랜치를 나눕니다.

권장:

```bash
feat-job-api
feat-job-list
```

한 브랜치에 묶어야 할 경우:

```bash
feat-job-flow
```

---

## 9. 커밋 메시지와의 관계

브랜치 이름은 작업 단위를 나타내고, 커밋 메시지는 변경 내용을 나타냅니다.

예시:

```bash
브랜치: feat-job-list
커밋: feat(frontend): 공고 목록 페이지 추가
```

```bash
브랜치: fix-cors-error
커밋: fix(backend): CORS 허용 주소 수정
```

```bash
브랜치: docs-branch-convention
커밋: docs(docs): 브랜치 컨벤션 문서 추가
```

---

## 10. 최종 원칙

브랜치 이름은 아래 질문에 바로 답할 수 있어야 합니다.

1. 어떤 종류의 작업인가?
2. 무엇을 작업하는가?

예시:

```bash
feat-application-form
```

위 브랜치는 다음처럼 해석됩니다.

- `feat`: 기능 개발
- `application-form`: 지원서 작성 화면 또는 기능 작업
