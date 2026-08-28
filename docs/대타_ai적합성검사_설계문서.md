# 대타 승인 — AI 적합성 검사(`ai-check`) 기능 설계 문서

**작성일**: 2026-08-27
**관련 배경**: 되묻기(clarification) 기능(review AI 검토용)의 두 번째 실사용처. 대타 승인 시 부서 자연어 규칙(`custom_rules`) 기준으로 대타 학생이 조건에 맞는지 직원에게 알려주고, 필요하면 되묻는 기능.
**전제**: 대타 API(REQ-SUB-001~006, PR #73)는 이미 구현·병합 완료된 상태. 되묻기 인프라(`clarification_requests`, `clarification_answer`, `POST /api/schedule/review/clarifications`)도 구현 완료된 상태.

---

## 0. 배경 및 목표

기존 대타 승인 흐름(`GET .../candidates` → `PATCH .../respond` → `PATCH .../approve`)은 "가능시간 있음 + 다른 근무 없음"이라는 **결정론적(hard) 조건**으로만 후보를 걸러낸다. 부서의 자연어 규칙(예: "신입은 마감 시간대 단독 배치 금지", "경력자 우선")처럼 **소프트 판단이 필요한 조건**은 검증되지 않는다.

이번 기능은 이미 수락한 대타 후보 1명에 대해, 직원이 최종 승인(`approve`)하기 전에 부서 규칙 기준으로 적합한지 AI가 검토 의견을 제공하고, 판단 근거가 부족하면 되묻도록 한다.

**핵심 원칙**: AI는 참고 의견만 제공하고, 확정 권한은 없다. `approve`는 이 검사와 무관하게 항상 독립적으로 작동한다.

---

## 1. 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | AI 판단 시점 | `approve` 직전, 이미 `respond`로 수락한 학생 1명만 검사 (candidates 전체 아님) |
| 2 | API 트리거 지점 | `approve`와 별개인 조회 전용 `GET /api/substitute-requests/{id}/ai-check` 신설 |
| 3 | 되묻기 인프라 연결 | 기존 `clarification_requests`/`clarification_answer` 그대로 재사용 (`target_type: student` 등 review와 완전 동일한 키 체계) |
| 4 | 응답 구성 | `findings`(규칙별 내역) + `clarification_requests` + 종합 `overall_verdict` |
| 5 | `rule_interpretation` 포함 여부 | 포함 (3종 전부 사용, review와 일관성 유지) |
| 6 | 프롬프트 파일 | `substitute_check_system_prompt.md` 신규 분리 작성 (review 프롬프트와 공유하지 않음) |
| 7 | verdict 강제 규칙 | `clarification_requests`가 하나라도 있으면 `overall_verdict`는 무조건 `"판단불가"` — 프롬프트 지시 + 서버 코드 후처리 이중 검증 |
| 8 | `approve` 강제 여부 | `ai-check`는 완전 선택 사항. 호출 이력 유무와 무관하게 `approve`는 항상 가능 |
| 9 | 반복 호출 처리 | 결과 캐싱. 해당 요청/학생 관련 `clarification_answer`가 새로 추가되면 캐시 무효화 후 재계산 |

---

## 2. API 스펙

### `GET /api/substitute-requests/{request_id}/ai-check`

**인증**: 직원만 (해당 부서 소속 직원 — 기존 `approve`와 동일한 권한 체크 재사용)

**사전 조건**:
- `request_id`가 존재해야 함 (404)
- 해당 요청의 상태가 최소 "수락됨"(대타 학생이 `respond`로 수락 완료)이어야 함. 아직 후보가 없거나 미수락 상태면 409 (검사할 대상 학생이 없으므로)
- 이미 `approve`/거절 처리된 요청에 대한 호출은 허용하되(과거 기록 조회 목적), 응답에 참고용임을 명시하는 필드(`is_stale` 등, 구현 시 재검토) 고려

**응답 (예시)**:
```json
{
  "request_id": 7,
  "substitute_student_id": "20211357",
  "overall_verdict": "판단불가",
  "findings": [
    {
      "severity": "info",
      "rule": "금요일 마감 시간대(17시 이후)에는 경험자가 최소 1명 있어야 한다",
      "message": "...",
      "suggestion": "..."
    }
  ],
  "clarification_requests": [
    {
      "target_type": "student",
      "target_id": "20211357",
      "field_name": "tenure_start_date",
      "question": "...",
      "reason": "..."
    }
  ],
  "cached": false
}
```

- `cached`: 이번 응답이 캐시에서 나온 것인지, 새로 계산된 것인지 (디버깅/투명성 목적)

---

## 3. 캐싱 설계

**캐시 키**: `(request_id, substitute_student_id)` — 대타 학생이 바뀌면(이론상 불가하지만 방어적으로) 캐시 미스 처리

**무효화 조건**: 이 학생과 관련된 `clarification_answer`에 새 로우가 추가된 시각이, 캐시된 결과의 계산 시각보다 이후이면 무효화. 구체적으로:
```
IF EXISTS (
  SELECT 1 FROM clarification_answer
  WHERE target_id = <substitute_student_id>
    AND answered_at > <캐시 계산 시각>
) THEN 캐시 무효화, 재계산
```

**저장 위치**: 별도 캐시 테이블(`substitute_ai_check_cache` 등) 신설 검토. Redis 등 외부 캐시 인프라가 없다는 전제 하에 DB 테이블로 구현하는 것을 기본으로 함 (코드 조사로 기존 캐시 인프라 유무 먼저 확인 필요 — 구현 착수 전 확인 사항 참고).

---

## 4. 프롬프트 설계 (`substitute_check_system_prompt.md`)

review 프롬프트와 별개 파일이지만, 아래 요소는 그대로 가져와 재사용(복사 후 문맥에 맞게 수정):

- 되묻기 원칙 문장 + 긍정/부정 few-shot (review에서 검증된 문구 기반)
- `clarification_requests`/`findings` 스키마 설명

새로 추가/수정할 부분:

- **지시 범위를 "학생 1명"으로 명확히 축소**: "여러 학생 중 배정을 검토하라"가 아니라 "이 학생 한 명이 아래 규칙들을 만족하는지만 판단하라"
- **`overall_verdict` 필드 지시 추가**: "적합" / "주의" / "판단불가" 3단계, 그리고 "`clarification_requests`가 하나라도 있으면 반드시 `판단불가`를 반환하라"는 명시적 규칙
- 대타 컨텍스트 정보 주입: 원래 근무자, 대타 사유, 근무 일시, 부서 규칙 원문, 대상 학생의 기존 근속/가용시간 등 (review의 `_build_prompt()` 패턴 참고해 유사하게 구성)

---

## 5. 서버 후처리 (verdict 이중 검증)

프롬프트 지시만으로는 100% 보장이 안 되므로, 응답 파싱 후 코드에서 강제:

```python
if response.clarification_requests:
    response.overall_verdict = "판단불가"
```

이건 review에서 겪은 재현성 문제(AI가 지시를 항상 지키지는 않음)에 대한 방어적 조치.

---

## 6. 스코프 밖 (이번 단계에서 하지 않음)

- `candidates` 조회 단계에서의 사전 필터링/태깅 (질문 1에서 기각된 A/C안)
- `ai-check`를 `approve`의 필수 사전 조건으로 강제하는 것 (질문 8에서 기각)
- `rule_interpretation` 재현성 문제 자체의 원인 조사/수정 — 이번엔 그대로 포함하되 verdict 강제 규칙으로 리스크만 완화. 근본 원인 조사는 review 쪽 "다음 담당자 숙제"와 함께 별도로 다뤄야 함
- 프롬프트 공통부(review와 substitute_check) 리팩터링 — 지금은 완전 분리, 안정화 후 공통 모듈 추출은 추후 과제

---

## 7. 구현 착수 전 확인 필요 (코드 조사 선행)

- 기존 캐시 인프라(Redis 등)가 이 프로젝트에 있는지, 없다면 DB 테이블 캐싱이 맞는 접근인지
- `substitute_request` 테이블의 현재 상태 필드(status enum 값들)가 "수락됨" 상태를 정확히 뭐라고 표현하는지 (예: `"수락"`, `"accepted"` 등 — review 때 `department_name` 사례처럼 실제 스키마 재확인 필수)
- `approve` 엔드포인트의 기존 권한 체크 로직(부서 소속 직원 검증) 함수를 그대로 재사용할 수 있는지, 헬퍼가 분리되어 있는지
- Gemini 무료 티어 쿼터 상황 — review 기능과 이 기능이 **같은 프로젝트/키를 공유**하는지, 공유한다면 두 기능의 합산 호출량이 하루 20회를 더 빠듯하게 만든다는 점을 팀에 공지 필요

---

## 8. eval 검증 계획 (제안, 확정 아님)

review 때와 동일한 원칙(quota 고려, positive/negative 축 최소화)으로:

| 케이스 | 목적 |
|---|---|
| 정상 적합 (되묻기 없음) | `overall_verdict = "적합"` 정상 산출 확인 |
| 학생 데이터 결손 | `clarification_requests`에 student 항목 발생 + `overall_verdict = "판단불가"` 강제 확인 |
| 캐시 재사용 | 동일 요청 2회 호출 시 두 번째는 `cached: true`, Gemini 미호출 확인 (LLM 호출 없이 mock으로 검증 가능) |
| 답변 후 캐시 무효화 | 캐시된 상태에서 `clarification_answer` 추가 → 재호출 시 `cached: false`로 재계산되는지 (mock으로 검증 가능) |

캐싱 관련 케이스 2개는 LLM 호출 없이 mock/DB만으로 검증 가능하므로 우선순위 높음. 나머지는 review 때처럼 `--case` 개별 실행 권장.
