# 시간표 검토(Review) AI — "되묻기" 기능 설계 문서

**작성일**: 2026-08-27
**관련 배경**: 이슈 #79 인수인계 코멘트("정책 필드 폭발 위험 — AI가 판단 근거 부족을 사람에게 되묻는 흐름 검토 필요")에 대한 후속 설계
**성격**: 이 문서는 grill 방식 논의로 확정된 결정 사항의 기록이며, 실제 구현 시 세부 사항은 코드 조사를 거쳐 조정될 수 있음

---

## 0. 배경 및 목표

기존 review 기능은 판단 근거가 불충분하면 무조건 "확인 불가"로만 응답했다. 이는 안전하지만(추측 방지) 실효성이 낮다. 이번 기능은 "확인 불가" 중 **답변 가능한 좁은 사실 결손**에 한해 사용자에게 되물어, 다음 판단에 활용할 수 있게 한다.

**핵심 원칙**: 되묻기는 기존 가드레일("근거 없으면 추측 금지")을 대체하지 않고 세분화한다. 정책적 판단이 필요한 애매함(예: 성별 피처 같은 사안)은 여전히 "확인 불가"로만 남긴다.

---

## 1. 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 응답 스키마 표현 | `clarification_requests` 별도 배열 신설 (findings와 분리) |
| 2 | 지목 대상 범위 | 학생 / 부서 / 규칙 해석 3종 전부, `target_type`으로 구분 |
| 3 | 되묻기 vs 확인불가 기준 | 원칙 문장 + 긍정 예시 2개 / 부정 예시 2개 few-shot |
| 4 | 답변 저장 방식 | `clarification_answers` 로그 테이블 신설. 실제 데이터(학생/부서 컬럼) 반영은 **사람이 수동으로** 수행 |
| 5 | 과거 답변 재활용 | 하이브리드 — 학생/부서는 구조화된 키로 매칭, 규칙 해석은 전부 프롬프트에 주입 |
| 6 | 답변 제출 API | 범용 엔드포인트 1개 (`target_type`으로 내부 분기) |
| 7 | eval 검증 | `target_type` 3종 긍정 각 1개 + 정책성 질문 부정 1개, 총 4개 케이스 |

---

## 2. 응답 스키마

기존 findings 배열과 병렬로 신설:

```json
{
  "findings": [ /* 기존과 동일 */ ],
  "clarification_requests": [
    {
      "target_type": "student | department | rule_interpretation",
      "target_id": "학생 ID 또는 부서 ID (rule_interpretation이면 null)",
      "field_name": "예: tenure_start_date (rule_interpretation이면 null)",
      "question": "사람이 읽을 자연어 질문",
      "reason": "왜 이 정보가 판단에 필요한지 (어떤 규칙 때문인지)"
    }
  ]
}
```

- `target_type`이 `student`/`department`인 경우: `target_id` + `field_name`으로 구조화된 키 완성
- `target_type`이 `rule_interpretation`인 경우: `target_id`, `field_name` 모두 `null`, `question`/`reason`만 사용

---

## 3. 되묻기 vs 확인불가 판단 기준 (프롬프트 설계)

`review_system_prompt.md`에 추가할 원칙 + few-shot:

**원칙**: "판단에 필요한 정보가 **특정 대상의 명확한 사실 하나**로 좁혀지고, 그 하나만 채워지면 규칙 적용이 가능한 경우에만 되물어라. 정책적 해석이나 조직의 결정이 필요한 사안은 되묻지 말고 기존처럼 확인 불가로 남겨라."

**긍정 예시 (되물어야 함)**:
1. 학생의 `tenure_start_date`가 NULL이라 상대 비교 규칙 적용 불가 → 되묻기
2. 부서의 특정 정책 값(예: 상한 기준)이 비어 있어 규칙 판단 불가 → 되묻기

**부정 예시 (되물으면 안 됨)**:
1. "힘쓰는 업무엔 남자 선호" 같은 성별 관련 규칙 — 데이터 결손이 아니라 조직 차원의 정책 결정이 필요한 사안 → 확인 불가로만 남김
2. "마감"의 정확한 시각 기준처럼, 규칙 문구 자체의 해석이 여러 방향으로 가능한 경우 → 확인 불가로만 남김 (단, 이런 규칙 해석 답변이 이미 `clarification_answers`에 존재하면 그걸 사용해 판단하는 것은 가능 — 되묻는 것과 활용하는 것은 별개)

---

## 4. 저장 스키마

### `clarification_answers` 테이블 (신설, `schema_patches.py`에 마이그레이션 추가 필요)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | |
| `target_type` | enum/str | `student` / `department` / `rule_interpretation` |
| `target_id` | int, nullable | 학생/부서 ID. rule_interpretation이면 NULL |
| `field_name` | str, nullable | 예: `tenure_start_date`. rule_interpretation이면 NULL |
| `question` | text | 원래 질문 |
| `answer` | text | 사용자 답변 |
| `answered_by` | str | 답변자 (계정/이름) |
| `answered_at` | datetime | |
| `applied_at` | datetime, nullable | 사람이 실제 데이터에 수동 반영한 시각. NULL이면 미반영 |

**중요**: 이 테이블은 로그일 뿐, 학생/부서 실제 컬럼을 자동으로 UPDATE하지 않는다. `applied_at`은 사람이 반영을 완료했다고 표시하는 용도(추적용, 자동화 아님).

---

## 5. 다음 review 실행 시 재활용 로직

`review.py`의 `_build_prompt()` 확장 (기존 `_tenure_label()` 패턴과 동일한 스타일):

- **학생/부서 (`target_type` in `student`, `department`)**: 현재 판단 대상 학생/부서의 ID로 `clarification_answers`를 조회, 있으면 `## 확인된 정보` 섹션에 필드값처럼 주입. 없으면 기존처럼 되묻기 트리거 로직 적용
- **규칙 해석 (`rule_interpretation`)**: 매칭 로직 없음. 저장된 모든 규칙 해석 답변을 `## 확인된 규칙 해석` 섹션으로 통째로 프롬프트에 주입 (개수가 적을 것으로 가정, 많아지면 재검토)

---

## 6. API 엔드포인트

```
POST /api/schedule/review/clarifications
Body: {
  "target_type": "student | department | rule_interpretation",
  "target_id": int | null,
  "field_name": string | null,
  "question": string,
  "answer": string
}
```

- `clarification_answers`에 INSERT만 수행 (실제 데이터 반영 없음)
- 기존 `POST /api/schedule/manual`과는 완전히 분리된 책임

---

## 7. eval 검증 계획

`eval_review_cases.json`에 추가할 4개 케이스:

| 케이스 | target_type | 기대 동작 |
|---|---|---|
| 1 | student | `tenure_start_date` NULL인 학생 관련 규칙 적용 시 되묻기 발생 |
| 2 | department | 부서 정책 값 부재 시 되묻기 발생 |
| 3 | rule_interpretation | 규칙 문구가 모호해 특정 해석 하나만 있으면 판단 가능한 경우 되묻기 발생 |
| 4 (부정) | — | 성별 피처처럼 정책적 판단이 필요한 사안은 되묻지 않고 기존처럼 확인 불가로만 남는지 확인 |

**쿼터 고려**: Gemini 무료 티어 일일 20회 제한 — 신규 4케이스 + 기존 9케이스 회귀를 하루에 다 못 돌릴 수 있음. 신규 케이스 우선 검증 후, 회귀는 쿼터 리셋 뒤 별도 실행 권장.

---

## 8. 스코프 밖 (이번 단계에서 하지 않음)

- 학생/부서 실제 컬럼에 답변을 자동 반영하는 기능 (사람이 수동으로 판단 후 반영)
- 규칙 해석 답변이 많아졌을 때의 검색/필터링 (임베딩 등) — 필요성 확인되면 다음 단계에서 검토
- 되묻기 개수 상한 강제 로직 — 실사용 데이터 없이 임의로 정하지 않음, eval 결과 보고 필요시 추가
- FE에서 이 질문에 답변을 입력하는 UI 자체의 설계 (API 스펙까지만 이번 범위, UI는 별도 논의)

---

## 9. 미해결 — 구현 착수 전 확인 필요

- 새 이슈 번호를 딸지, #80(neulbokim, 설계 방향 재검토 담당) 논의에 포함시킬지 팀 확인 필요
- `department` 대상일 때 "어떤 정책 필드"를 지목할 수 있는지 실제 `department` 테이블 구조 확인 필요 (코드 조사 선행)
- `docs/API_SPEC.md`에 신규 엔드포인트 문서화 필요
