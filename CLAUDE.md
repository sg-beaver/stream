# STREAM

교내 근로장학 공고·지원·근무표(CP-SAT 자동 배정) 서비스. FastAPI 백엔드(`backend/`)와 React/Vite 프론트엔드(`frontend/`)로 구성됩니다.

## 주요 문서

- 아키텍처(모듈 경계·핵심 흐름·상태 전이): `docs/ARCHITECTURE.md`
- 프로젝트 배경·용어: `docs/STREAM_CONTEXT.md`
- API 명세: `docs/API_SPEC.md`
- 인증·권한 설계: `docs/AUTH_SPEC.md`
- AI 시스템(비식별화·결정적 검증·품질 계측): `docs/AI_SYSTEM.md`
- 스케줄러(CP-SAT) 명세: `docs/SCHEDULER_SPEC.md`
- 개발 환경 세팅: `docs/DEV_SETUP.md`
- AWS 배포 절차: `docs/DEPLOY.md`

## 브랜치·커밋 규칙

- 브랜치: `type-keyword` 형식(슬래시 금지), `develop`에서 분기 → PR → `develop`. 상세: `docs/BRANCH_CONVENTION.md`
- 커밋: `type(scope): 한국어 메시지` 형식. 상세: `docs/COMMIT_CONVENTION.md`
- `main`·`develop`에 직접 커밋하지 않습니다.

## 개발 로그 규칙 (필수)

주요 테스트 수행, 기능 수정, 알고리즘 개선 후에는 반드시 `LOG.md`에 개발 과정을 기록합니다. 특히 **스케줄러(CP-SAT) 관련 변경은 예외 없이 기록**합니다.

기록 형식 (한 항목당 이 5단계를 짧게):

```
문제/가설 → 테스트 조건 → Before 수치 → 수정 내용 → After 수치
```

작성 원칙:

- 길게 쓰지 않습니다. 항목당 위 5단계를 각 1~3줄로 요약합니다.
- **수치는 실제 실행 결과만 기록합니다.** 추정치·기대값을 실측처럼 적지 않으며, AI가 작성한 수치는 사람이 실제 실행 결과와 대조해 확인한 뒤 남깁니다.
- Before/After는 동일한 테스트 데이터·조건 기준으로 비교합니다.
- Solver 관련 기록에는 Solver status(`OPTIMAL`/`FEASIBLE`/`INFEASIBLE`)와 solve time을 함께 남깁니다.
- 최신 항목을 위에 추가합니다.
- 단순 기능 나열("오늘 ~를 개발했다")은 기록 대상이 아닙니다. 문제를 발견하고 검증·개선한 과정만 남깁니다.
