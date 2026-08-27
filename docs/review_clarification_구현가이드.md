# 되묻기 기능 — 구현 단계별 가이드

`review_clarification_설계문서.md`를 코드에 옮기는 순서입니다. 새 세션 시작 시 아래처럼 요청하세요:

> "이 구현가이드와 설계문서가 있어. `git log --oneline origin/develop`,
> `backend/app/routers/schedule.py`, `backend/app/scheduler/review.py`,
> `backend/app/models.py`, `backend/app/schema_patches.py`를 읽어서
> 실제 코드 상태 확인한 다음, 0단계부터 순서대로 진행해줘."

---

## 0단계 — Git 위생 (최우선, 절대 건너뛰지 말 것)

지난 세션 사고(머지된 죽은 브랜치에서 이어 작업) 재발 방지 규칙 그대로 적용합니다.

1. `git checkout develop && git pull`
2. `git log --oneline origin/develop`로 #77(`fix-schedule-manual-overlap-limits`)이 머지됐는지 확인
   - 머지 안 됐으면: 이번 작업은 새 기능이므로 #77과 독립적으로 진행 가능. 다만 `manual`/`confirm` 관련 코드를 건드릴 일은 없으니 충돌 위험은 낮음
3. 최신 develop 기준으로 새 브랜치 생성 (예: `feat-review-clarification`)
4. **커밋 직전마다** `git log --oneline origin/develop` 재확인 습관 유지

---

## 1단계 — DB 스키마: `clarification_answers` 테이블

**대상 파일**: `backend/app/models.py`, `backend/app/schema_patches.py`

1. `models.py`에 ORM 모델 추가 (설계문서 4번 섹션 컬럼 그대로):
   - `id`(PK), `target_type`(str/enum), `target_id`(int, nullable), `field_name`(str, nullable), `question`(text), `answer`(text), `answered_by`(str), `answered_at`(datetime), `applied_at`(datetime, nullable)
2. **반드시** `schema_patches.py`에도 마이그레이션 패치 추가 — 이 프로젝트 관례상 `models.py` 컬럼 추가만으론 실제 DB에 반영 안 됨 (지난 세션 `tenure_start_date` 작업 때와 동일 패턴)
3. 완료 체크: `docker exec -it stream-db psql -U stream_user -d stream_db`로 접속해 테이블 실제 생성 확인

---

## 2단계 — 프롬프트: 되묻기 기준 + 스키마 명시

**대상 파일**: `backend/app/scheduler/review_system_prompt.md`

1. 원칙 문장 추가 (설계문서 3번 섹션 문구 그대로 또는 다듬어서)
2. 긍정 예시 2개, 부정 예시 2개 few-shot 추가
3. 응답 JSON 스키마에 `clarification_requests` 필드 설명 추가 (기존 `findings` 필드 설명 옆에 병렬로)
4. **기존 가드레일("확인 불가하면 추측 금지") 문구는 그대로 유지** — 대체가 아니라 세분화이므로 삭제하지 말 것

---

## 3단계 — `review.py`: 프롬프트 조립 + 응답 파싱 확장

**대상 파일**: `backend/app/scheduler/review.py`

1. **응답 파싱**: LLM 응답에서 `clarification_requests` 배열을 파싱하는 로직 추가 (기존 `findings` 파싱과 병렬)
2. **과거 답변 조회 헬퍼 신설** (예: `_get_relevant_clarification_answers()`):
   - `student`/`department` 대상: 현재 배치 대상 학생/부서 ID로 `clarification_answers` 테이블 조회 (구조화된 키 매칭)
   - `rule_interpretation` 대상: 전체 `clarification_answers` 중 `target_type='rule_interpretation'`인 것 전부 조회 (필터링 없음)
3. `_build_prompt()` 확장:
   - 조회된 학생/부서 답변은 기존 `_tenure_label()` 패턴처럼 "확인된 정보" 섹션으로 주입
   - 조회된 규칙 해석 답변은 "확인된 규칙 해석" 섹션으로 통째로 주입
4. 기존 시그니처는 유지, 신규 인자는 옵션(기본값 `None`)으로 추가해 하위 호환 유지 — #79 때와 같은 원칙

---

## 4단계 — API 엔드포인트

**대상 파일**: `backend/app/routers/schedule.py`

1. `POST /api/schedule/review/clarifications` 신설
   - Body: `target_type`, `target_id`(nullable), `field_name`(nullable), `question`, `answer`
   - 처리: `clarification_answers`에 INSERT만 수행, 다른 부수효과 없음 (설계문서 6번 섹션)
2. `target_type` 값 검증(`student`/`department`/`rule_interpretation` 외 값 거부)
3. `student`/`department`인데 `target_id`가 없는 경우 등 잘못된 조합은 400 처리

---

## 5단계 — eval 케이스 추가

**대상 파일**: `backend/app/scheduler/eval_review.py`, `eval_review_cases.json`

1. 설계문서 7번 섹션의 4개 케이스 추가:
   - 학생 데이터 결손 → 되묻기 발생
   - 부서 정책 결손 → 되묻기 발생
   - 규칙 해석 모호 → 되묻기 발생
   - 정책성 질문(성별 등) → 되묻지 않고 확인 불가 유지 (부정 케이스)
2. **쿼터 관리**: Gemini 무료 티어 일일 20회 — 이 4개 케이스만 먼저 `--case` 옵션으로 개별 검증하고, 기존 9종 회귀 전체 실행은 쿼터 리셋 후 별도로 진행 (지난 세션과 동일한 방식)

---

## 6단계 — 문서화

**대상 파일**: `docs/API_SPEC.md`

1. 신규 엔드포인트 `POST /api/schedule/review/clarifications` 스펙 추가
2. 기존 review 응답 스펙에 `clarification_requests` 필드 추가 서술

---

## 7단계 — 검증

1. pytest 전체 통과 확인 (기존 스위트 + 신규 유닛 테스트 있다면)
2. 5단계에서 만든 4개 eval 케이스를 개별 실행(`--case`)으로 통과 확인
3. **실제 시나리오 재현**: #79 때처럼 실제 API 경로로 재현 — 예를 들어 특정 학생의 `tenure_start_date`를 임시로 NULL 처리 → review 재호출 → `clarification_requests`에 해당 학생이 잡히는지 확인 → 답변 API로 값 제출 → `clarification_answers`에 로그 남는지 확인 → 재호출 시 "확인된 정보"로 반영되는지 확인
4. 회귀 확인: 기존 9종 케이스가 여전히 통과하는지 (쿼터 여유 될 때)

---

## 8단계 — PR 정리

1. 설계문서 9번 섹션의 미해결 사항 처리:
   - 새 이슈 번호를 딸지, #80(neulbokim) 논의에 포함시킬지 팀 확인 — 확인 전엔 PR 본문에 "관련 이슈 미정, #80과 연관 있음"으로 명시해두는 것 권장
   - `department` 정책 필드 실제 구조는 1단계 착수 전 코드 조사로 먼저 확인해뒀어야 함 (2~3단계 진행 전 재확인)
2. PR 본문에 스코프 밖 항목(설계문서 8번 섹션: 자동 반영 없음, UI 없음, 개수 상한 없음) 명시 — #79 PR 때처럼 "알려진 한계"로 남겨서 다음 담당자가 헷갈리지 않게 할 것
3. 새 브랜치 생성 시점(0단계)과 머지 시점 사이 develop이 얼마나 앞서갔는지 마지막으로 한 번 더 확인 후 PR 생성

---

## 순서 요약

```
0. git 위생 확인 및 새 브랜치
1. clarification_answers 테이블 (models.py + schema_patches.py)
2. review_system_prompt.md (원칙 + few-shot + 스키마)
3. review.py (파싱 + 조회 헬퍼 + 프롬프트 조립)
4. schedule.py (POST /api/schedule/review/clarifications)
5. eval_review_cases.json (4개 케이스)
6. API_SPEC.md
7. 검증 (pytest + eval + 실제 시나리오 재현)
8. PR 정리 및 미해결 사항 팀 확인
```
