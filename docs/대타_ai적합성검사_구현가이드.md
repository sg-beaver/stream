# 대타 승인 AI 적합성 검사(`ai-check`) — 구현 단계별 가이드

`대타_ai적합성검사_설계문서.md`를 코드에 옮기는 순서입니다. 새 세션 시작 시 아래처럼 요청하세요:

> "이 설계문서와 구현가이드가 있어. `git log --oneline origin/develop`,
> `backend/app/routers/schedule.py`, `backend/app/models.py`,
> `backend/app/scheduler/review.py`, `backend/app/scheduler/review_system_prompt.md`를
> 읽어서 실제 코드 상태 확인한 다음, 0단계부터 순서대로 진행해줘."

---

## 0단계 — Git 위생 + 코드 조사 (설계문서 7번 섹션, 반드시 먼저)

1. `git checkout develop && git pull`, `git log --oneline origin/develop`로 상태 확인 후 새 브랜치(예: `feat-substitute-ai-check`) 생성
2. 설계문서 7번 섹션의 미확인 사항을 **코드 조사만으로** 먼저 확정 (수정 금지, 조사만):
   - 캐시 인프라(Redis 등) 존재 여부 — 없으면 DB 테이블 캐싱으로 확정
   - `substitute_request` 테이블의 실제 status enum 값 (`\d substitute_request` 또는 `models.py`의 `SubstituteRequest` 클래스 확인) — "수락됨"에 해당하는 실제 문자열이 뭔지
   - `approve` 엔드포인트의 부서 소속 직원 권한 체크 로직이 별도 헬퍼 함수로 분리돼 있는지, 아니면 인라인인지
   - `review.py`에서 Gemini 클라이언트 초기화/호출 부분이 재사용 가능한 형태(별도 함수)로 분리돼 있는지 — `ai-check`에서도 같은 초기화 로직을 쓸 수 있는지
3. 조사 결과가 설계문서 가정과 다르면(예: status 값이 예상과 다름) **여기서 멈추고 나에게 보고** — #79/되묻기 작업 때 `department_name` 오해처럼, 잘못된 가정 위에 코드를 쌓으면 나중에 더 큰 재작업이 됨

---

## 1단계 — 캐시 테이블 신설

**대상 파일**: `backend/app/models.py`, (신규 테이블이면 `schema_patches.py` 불필요 — 되묻기 기능 때와 동일 판단 기준 적용, 신규 테이블인지 재확인)

1. `substitute_ai_check_cache` (가칭) 테이블: `id`(PK), `request_id`(FK), `substitute_student_id`, `overall_verdict`, `findings`(JSON), `clarification_requests`(JSON), `computed_at`
2. 무효화 판단은 조회 시점에 `clarification_answer.answered_at > computed_at` 비교로 처리 (테이블 자체에 무효화 플래그를 미리 저장할 필요 없음 — 조회 로직에서 매번 판단)

---

## 2단계 — 프롬프트: `substitute_check_system_prompt.md` 신규 작성

**대상 파일**: `backend/app/scheduler/substitute_check_system_prompt.md` (신규)

1. `review_system_prompt.md`의 되묻기 원칙 + few-shot 문구를 복사해서 시작
2. "여러 학생/배치 전체"가 아니라 **"학생 1명이 규칙들을 만족하는지만 판단"**으로 지시 범위 축소
3. `overall_verdict`(적합/주의/판단불가) 필드 추가 + **"`clarification_requests`가 하나라도 있으면 반드시 `판단불가`"** 규칙 명시
4. 기존 되묻기 가드레일("확인 불가 시 추측 금지")과 3종 대상 범위(student/department/rule_interpretation)는 review와 동일하게 유지

---

## 3단계 — 서비스 로직: `ai-check` 핵심 함수

**대상 파일**: `backend/app/scheduler/substitute_check.py` (신규 모듈 — review.py와 분리)

1. 캐시 조회 함수: `(request_id, substitute_student_id)`로 캐시 조회 → `clarification_answer.answered_at` 비교로 유효성 판단 → 유효하면 캐시 반환(`cached: true`)
2. 무효/미존재 시: 대타 컨텍스트(원래 근무자, 대타 사유, 근무 일시, 부서 `custom_rules`, 대상 학생 정보) 조합 → `substitute_check_system_prompt.md` 기반 프롬프트 조립 → Gemini 호출
3. **되묻기 답변 재조회는 review.py의 `_get_relevant_clarification_answers()`를 그대로 임포트해서 재사용** (설계문서 결정 3번 — 완전 재사용 원칙)
4. 응답 파싱 후 서버 후처리: `if clarification_requests: overall_verdict = "판단불가"` 강제 적용 (프롬프트 지시와 별개로 코드 레벨에서 재확인)
5. 계산 결과를 캐시 테이블에 저장

---

## 4단계 — API 엔드포인트

**대상 파일**: `backend/app/routers/schedule.py` (또는 대타 라우터가 별도 파일이면 그쪽)

1. `GET /api/substitute-requests/{request_id}/ai-check` 신설
2. 사전 조건 검증: `request_id` 존재(404), 최소 "수락됨" 상태(409 — 0단계에서 확인한 실제 status 값 사용)
3. `approve` 기존 권한 체크 로직 재사용 (부서 소속 직원만)
4. `approve` 엔드포인트 자체는 **건드리지 않음** — 완전히 독립적인 조회 엔드포인트로만 추가 (설계문서 결정 8번)

---

## 5단계 — eval 검증 (mock 우선)

**대상 파일**: 신규 테스트 파일 (예: `tests/scheduler/test_substitute_check.py`)

1. **LLM 호출 없이 mock/DB로 검증 가능한 것부터** (쿼터 소모 없음, 우선순위 높음 — 설계문서 8번 섹션):
   - 캐시 재사용: 동일 요청 2회 호출 시 두 번째는 `cached: true`, Gemini 미호출 확인
   - 캐시 무효화: 캐시된 상태에서 `clarification_answer` 추가 → 재호출 시 `cached: false`로 재계산
   - 404(존재하지 않는 request_id), 409(미수락 상태) 검증
   - `overall_verdict` 강제 규칙: mock 응답이 `clarification_requests`를 채우면서 `overall_verdict="적합"`으로 왔다고 가정해도, 서버가 최종적으로 `판단불가`로 덮어쓰는지 (Gemini 응답을 mock으로 조작해서 검증 가능)
2. **실 Gemini 호출이 필요한 것** (쿼터 고려, `--case` 개별 실행):
   - 정상 적합 케이스
   - 학생 데이터 결손 → 되묻기 발생

---

## 6단계 — 문서화

**대상 파일**: `docs/API_SPEC.md`

- `GET /api/substitute-requests/{request_id}/ai-check` 스펙 추가

---

## 7단계 — 검증

1. pytest 전체 통과 확인 (mock 기반 신규 테스트 포함)
2. 실 API 경로 재현 (`/docs` 또는 스크립트):
   - 대타 요청 생성 → 후보 탐색 → 수락 → `ai-check` 호출 (1콜) → 결과 확인
   - **같은 요청으로 `ai-check` 재호출 → `cached: true` 확인 (Gemini 미호출, 쿼터 무료)**
   - 되묻기 발생 시 답변 제출 → 세 번째 `ai-check` 호출 → `cached: false`로 재계산 (1콜) → 반영 확인
   - `ai-check` 호출 여부와 무관하게 `approve`가 정상 작동하는지 확인 (설계문서 결정 8번 재확인)

---

## 8단계 — PR 정리

1. 설계문서 6번 섹션(스코프 밖 항목)을 PR 본문에 명시
2. `rule_interpretation` 포함 결정과 그 리스크(review에서 발견한 재현성 문제가 이 기능에도 적용됨)를 "알려진 리스크"로 명시 — verdict 강제 규칙으로 완화했으나 완전히 해결된 건 아니라는 점 포함
3. 관련 이슈 번호 확인 필요 (신규 이슈 vs 기존 대타 이슈에 연결)

---

## 순서 요약

```
0. git 위생 + 코드 조사(캐시 인프라, status 값, 권한 체크 재사용 가능 여부)
1. substitute_ai_check_cache 테이블
2. substitute_check_system_prompt.md
3. substitute_check.py (캐시 조회 + 프롬프트 조립 + verdict 강제)
4. GET /api/substitute-requests/{id}/ai-check
5. eval (mock 우선 → 실 Gemini 최소한만)
6. API_SPEC.md
7. 검증 (전체 흐름 + 캐싱 동작 확인)
8. PR 정리
```
