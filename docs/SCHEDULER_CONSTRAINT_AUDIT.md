# CP-SAT 제약조건 코드 감사 (SCHEDULER_SPEC ↔ Solver 코드 1:1 대조)

- **관련 이슈**: #82 (멘토 피드백 P0 — "코드가 돌아가는 것"과 "의도한 알고리즘이 정확히 구현된 것"은 다르다)
- **감사 일자**: 2026-08-23
- **기준 커밋**: `f392f0e` (develop)
- **대조 대상**
  - 명세: [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3장 (HC-*, SC-*)
  - Hard Constraint: `backend/app/scheduler/constraints/hard.py`
  - Soft Constraint: `backend/app/scheduler/constraints/soft.py`
  - 변수 도메인 인코딩: `backend/app/scheduler/domain/student.py` (`Student.can_work`), `domain/calendar.py` (`OpeningHoursResolver`), `engine/solver.py` (`build_context`)
  - 가중치·정책값: `backend/app/scheduler/config/departments/library_info_service.json`

> 이슈 본문의 경로 `engine/constraints/hard.py`·`soft.py`는 실제로는 `constraints/hard.py`·`soft.py`이다 (engine 하위가 아님).

## 감사 방법

SPEC의 제약 표 각 행에 대해 (1) 구현 위치, (2) 위반량/제약 인코딩 방식, (3) 가중치·정책값을 코드와 JSON에서 직접 확인했다. HC-OPEN·HC-CLASS 계열은 별도 제약 클래스가 아니라 **변수 생성 단계에서 도메인으로 인코딩**된다(변수가 없으면 위반 자체가 불가능) — SPEC 1.3·`hard.py` 모듈 주석과 일치하는 설계다.

## 결과 요약

- **Hard 10건 + Soft 14건 전부 구현 확인, SPEC과 불일치 없음.**
- 가중치는 SPEC 3.5 표와 `library_info_service.json`의 `soft_weights`·`preferred_staffing_bands[].weight`가 1:1로 일치.
- 사소한 **관찰 사항 4건** (SPEC 위반은 아니나 잠재 이슈·미정의 엣지) — 아래 "관찰 사항" 참고.

## Hard Constraint 대조표

| ID | 규칙 (SPEC) | 구현 위치 | 구현 방식 | 값 (SPEC ↔ JSON) | 판정 |
|---|---|---|---|---|---|
| HC-TIME-1 | 교비 주 ≤ 14h | `hard.py` `WeeklyHourLimitConstraint` | ISO 주(`isocalendar`)별로 학생 주간 변수 합 ≤ 상한 슬롯 | 14 ↔ `gyobi_weekly_max_hours: 14` | ✅ |
| HC-TIME-2 | 국가 주 ≤ 20h(학기)/40h(방학), 혼재 주는 낮은 상한 | 〃 | 그 주 날짜들의 `period_type`별 상한에 `min()` 적용 → 보수적 상한 | 20/40 ↔ `gukga_weekly_max_hours` | ✅ |
| HC-TIME-3 | 국가 월 ≤ 46h, 스케줄링 기간 내 날짜만 집계 | `hard.py` `MonthlyGukgaLimitConstraint` | (연,월)로 그룹핑, GUKGA만, 기간 내 날짜만 (`ctx.grid.dates`) | 46 ↔ `gukga_monthly_max_hours: 46` | ✅ |
| HC-TIME-4 | 부서 전체 2주 교비 총합 ≤ 190h, 시작일부터 14일 창 | `hard.py` `BiweeklyDeptGyobiLimitConstraint` | `dates[start:start+14]` 창별 교비 전원 변수 합 ≤ 상한 | 190 ↔ `gyobi_biweekly_dept_total_max_hours: 190` | ✅ |
| HC-OPEN-1 | 폐관일 배정 없음 (우선순위 1) | `calendar.py` `OpeningHoursResolver.resolve` | `is_closed` → `[]` (슬롯 미생성) | — | ✅ |
| HC-OPEN-2 | 방학 중 공휴일 폐관 | 〃 | 공휴일 ∧ VACATION → `[]` | — | ✅ |
| HC-OPEN-3 | 학기 중 공휴일 단축 개관, 원래 폐관 요일(일)은 폐관 유지 | 〃 | 공휴일 ∧ SEMESTER → `semester_public_holiday_hours`, 단 `default`가 비면(일요일) `[]` | 09:00~17:00 ↔ JSON `semester_public_holiday` | ✅ |
| HC-OPEN-4 | 학기 중 교내 휴강일 → 공휴일과 동일 단축 개관 | 〃 | `is_school_only_holiday` ∧ SEMESTER → 동일 처리 | 〃 | ✅ |
| HC-OPEN-5 | 시험 기간 연장 주말 (월/화 시작→직전 주말, 수/목/금→낀 주말) | `calendar.py` `_extended_weekend` + `resolve` | 시험 시작 요일로 토·일 쌍 계산, SEMESTER ∧ 해당일 → `exam_weekend_hours`. 우선순위는 공휴일보다 낮음(SPEC 순서와 동일) | 08:00~22:00 ↔ JSON `exam_weekend` | ✅ |
| HC-OPEN-6 | 그 외 기간·요일별 기본 개관 | 〃 + `policy.py` `default_open_ranges` | JSON `opening_hours.default[period][day]` | 학기 평일 08~22 등 | ✅ |
| HC-CLASS-1 | 가능 시간 외 배정 불가 | `student.py` `can_work` (→ `solver.py` 변수 생성 게이트) | `available`(또는 `date_schedule.available`)에 없으면 변수 미생성 | — | ✅ |
| HC-CLASS-2 | 수업 시간 절대 배정 불가 (시험 기간 포함) | 〃 | 수업 진행일이면 `available ∧ ¬classes` — 시험 기간 여부와 무관하게 차단 | — | ✅ |
| HC-CLASS-3 | 공휴일: 가능 ∪ 원래 수업 시간 배정 가능 | 〃 (`class_free` 분기, `_declared_or_class`) | 공휴일·교내휴강일이면 `available ∨ classes` | — | ✅ |
| HC-CLASS-4 | 교내 휴강일: 교비는 CLASS-3과 동일, 국가는 근로 불가 | 〃 | `school_only ∧ GUKGA → False` 선차단, 교비는 `class_free` 처리 | — | ✅ |
| HC-CLASS-5 | `unavailable_dates` 배정 불가 | 〃 | 최우선 체크 → 변수 미생성 | — | ✅ |
| HC-CLASS-6 | 활동 기간(`active_from`/`until`) 밖 배정 불가 | 〃 | 기간 밖 날짜 → 변수 미생성 | — | ✅ |
| HC-STAFF-1 | 슬롯 인원 ≤ `max_per_slot` | `hard.py` `StaffingBoundsConstraint` | 슬롯별 `Σx ≤ max` — 항상 Hard | 2 ↔ `max_per_slot: 2` | ✅ |
| HC-STAFF-2 | 슬롯 인원 ≥ `min_per_slot`, 완화 옵션 시 SC-UNDER-1로 | 〃 | `allow_understaffing_with_penalty`면 `Σx + shortage ≥ min` + 페널티, 아니면 Hard `Σx ≥ min`. shortage는 리포트용으로 별도 수집 | 1 ↔ `min_per_slot: 1`, `allow…: true` | ✅ |

## Soft Constraint 대조표

가중치 등록 경로: 모든 Soft 페널티는 `constraints/base.py` `ModelContext.add_penalty`를 거치며, DB의 `department_policy.soft_weight_scales`(카테고리별 배율, 기본 1.0)가 여기서 일괄 반영된다. JSON 정책 파일에는 배율이 없으므로 아래 표의 가중치가 그대로 목적함수에 들어간다.

| ID | 제약 (SPEC) | 구현 위치 (`soft.py`) | 위반량 인코딩 | 가중치 (SPEC ↔ JSON 키) | 판정 |
|---|---|---|---|---|---|
| SC-UNDER-1 | 최소 인원 미달 | `hard.py` `StaffingBoundsConstraint` (완화 분기) | 슬롯별 부족 인원 IntVar `shortage ∈ [0, min_per_slot]` | 1000 ↔ `understaffing: 1000` | ✅ |
| SC-STAFF-1 | 선호 인원 (선생님 재실 시간대 2명) | `PreferredStaffingConstraint` | 밴드별 `Σx + deficit ≥ preferred_count`, deficit이 위반량. `preferred_count ≤ min_per_slot`인 밴드는 스킵 | 8 ↔ 밴드 `weight: 8` (학기 09~12·13~17, 방학 10~12·13~17) | ✅ |
| SC-STAFF-2 | 선생님 부재 시간대 가능하면 2명 | 〃 (같은 클래스, 밴드 데이터로 구분) | 〃 | 4 ↔ 밴드 `weight: 4` (학기 저녁 17~22, 방학 저녁 17~20·토 09~17) | ✅ |
| SC-PREF-1 | 희망 시간 우선 | `PreferenceMatchConstraint` | `is_preferred`가 아닌 슬롯의 배정 변수 자체에 페널티 | 3 ↔ `preferred_slot_miss: 3` | ✅ |
| SC-CONT-1 | 조각 근무 최소화 | `ContiguityConstraint` | 학생-일자별 블록 시작 지표 `start ≥ x[t] − x[t−1]` (배정 불가 슬롯은 경계로 리셋) | 4 ↔ `block_start: 4` | ✅ (관찰 ① 참고) |
| SC-MEAL-1 | (학기) 점심 12~13 / 저녁 17~18 전부 수업+근무면 위반. 시험 기간 휴강 수업 시간은 식사 가능 | `MealBreakConstraint` + `Student.has_class` | 창 내 전 슬롯 바쁨(근무 변수 + 수업 상수)이면 `missed=1`. 항상 빈 슬롯 있으면 제약 미생성. `has_class`는 시험 기간·휴일이면 False → 식사 가능 간주 | 20 ↔ `meal_missed: 20`, 창 ↔ `meal_windows` (12~13, 17~18) | ✅ (관찰 ② 참고) |
| SC-MEAL-2 | (방학) 6h 이상 배정된 날 점심 미확보 | 〃 (방학 분기) | `long_day`(총 슬롯 ≥ 기준) ∧ `missed` 결합 지표에 페널티. `wants_meal_break` 선택제 | 20 ↔ 〃, 6h ↔ `vacation_long_shift_meal_hours: 6`, 창 12~13 | ✅ |
| SC-MORN-1 | 전날 마감 근무 후 아침 근무 | `MorningRulesConstraint._close_then_morning` | 그날 마지막 개관 슬롯 변수 ∧ 다음 날 아침 근무 지표 → 페널티. `no_morning_after_close` 선택제 | 15 ↔ `morning_after_close: 15` | ✅ |
| SC-MORN-2 | 주당 아침 근무 일수 초과 | `MorningRulesConstraint._weekly_cap` | ISO 주별 `excess ≥ Σ아침근무일 − cap` (초과 일수) | 10 ↔ `morning_days_excess: 10` | ✅ |
| SC-MORN-3 | 아침 근무 연속 일수 초과 | `MorningRulesConstraint._consecutive_cap` | 달력상 연속 `cap+1`일 창이 전부 아침 근무면 창별 0/1 위반 | 10 ↔ `consecutive_morning_excess: 10` | ✅ |
| (SC-MORN Hard 승격) | `max_*_morning_days = 0`이면 아침 배정 금지 | `MorningRulesConstraint` + `StudentPreferences.morning_forbidden` | 둘 중 하나라도 0이면 아침 슬롯 변수 `== 0` 강제 (Hard) | — | ✅ |
| SC-EXAM-1 | 시험 시작 전 버퍼 내 배정 | `ExamProximityConstraint` | `[시작−버퍼, 시작)` 구간의 배정 변수에 슬롯당 페널티 | 25 ↔ `exam_proximity: 25`, 3h ↔ `exam_buffer_minutes: 180` | ✅ |
| SC-AVOID-1 | 회피 요청 시간대 배정 | `AvoidRangeConstraint` | 회피 구간 내 배정 변수에 슬롯당 페널티 | 12 ↔ `avoid_range_slot: 12` | ✅ |
| SC-COMMUTE-1 | (학기) 비등교 요일 배정 | `NonCampusDayConstraint` | SEMESTER ∧ `campus_days` 미포함 요일의 '그날 근무 여부' 지표에 페널티. `campus_days` 비면 미적용 | 5 ↔ `non_campus_day: 5` | ✅ |
| SC-FAIR-1 | 공평 배분 — 주간 목표 미달 페널티 | `FairHoursConstraint` | 목표 = `min(주간 상한 슬롯, 그 주 가용 변수 수)`, `shortfall ≥ 목표 − Σ배정`. 상한 계산은 HC-TIME-1/2와 동일 로직 재사용 | 6 ↔ `fair_hours_shortfall: 6` | ✅ |

'아침' 경계는 `morning_end`(09:00) **이전 시작** 슬롯(`m < morning_end`)으로, SPEC의 "morning_end 이전 슬롯" 정의와 일치한다.

## 목적함수·부가 동작 (SPEC 3.6)

| 항목 | SPEC | 코드 | 판정 |
|---|---|---|---|
| 목적함수 | `minimize Σ(weight × violation)` | `solver.py` `Minimize(sum(t.weight * t.var))` | ✅ |
| `penalty_breakdown` | 제약별 페널티 합계 포함 | `_extract`가 breakdown + 위치 메타 포함 `penalty_events` 생성 | ✅ |
| 상태 처리 | INFEASIBLE→409, UNKNOWN→504 | `routers/schedule.py` 681~685에서 구분 응답 | ✅ |
| 동률 해 열거 | 페널티 ≤ V 제약 + 다양성 컷(기본 4슬롯), 해당 제한은 해 하나당 | `solve_alternatives` — 첫 해 후 `objective ≤ V` 추가, `_add_diversity_cut`, `min_difference_slots=4` 기본값 | ✅ |

## 관찰 사항 (SPEC 불일치 아님 — 잠재 이슈·엣지 기록)

1. **`ContiguityConstraint`의 시간 불연속 처리 (잠재)** — 블록 경계 판정이 "개관 슬롯 목록상 인접"을 기준으로 하므로, 하루 개관이 여러 구간으로 끊기는 경우(점심 휴관 등, `DepartmentPolicy.opening_hours` 주석이 명시적으로 지원하는 요구) 휴관을 사이에 둔 두 근무가 **한 블록으로 계산**된다. 현재 정보서비스팀 정책은 요일당 단일 구간이라 실동작 영향 없음. 다구간 개관 정책이 실제로 들어오기 전에 슬롯 간 시간 간격 검사 추가 필요.
2. **SC-MEAL-1의 상수 페널티** — 학기 중 식사 창이 **수업만으로** 전부 채워진 학생(그날 다른 시간대 근무 변수는 있음)은 배정과 무관하게 `missed=1`이 강제되어, 고정 페널티 20이 항상 목적함수·`penalty_breakdown`·위반 이벤트에 잡힌다. SPEC의 위반 정의("수업+근무로 전부 채워지면")와는 문언상 일치하고 최적화 결과를 왜곡하지도 않지만, 담당자 리포트에 "배정 때문이 아닌" 위반 이벤트가 노출된다.
3. **시간 상한의 슬롯 변환 내림** — `TimeGrid.hours_to_slots`는 `int()` 절사라, 슬롯 길이로 나누어떨어지지 않는 상한(예: 30분 슬롯에 14.2h)은 더 낮은 쪽으로 적용된다. 상한(Hard)에는 보수적이므로 안전하고, MVP 값은 모두 정확히 나누어떨어진다.
4. **토/일 시작 시험의 연장 주말 판정 미정의** — SPEC 3.2의 요일 규칙은 월~금 시작만 정의한다. `_extended_weekend`는 토/일 시작 시 "시작일이 속한/직후 주말"을 반환하는데, 해당 케이스가 SPEC에 없으므로 실데이터에 등장하면 규칙을 SPEC에 명시해야 한다.

## 결론

멘토 피드백의 우려 지점(SPEC의 제약 표와 Solver 구현의 괴리)은 **발견되지 않았다**. 24개 제약 전부 구현 위치·방식·가중치가 SPEC 및 부서 정책 JSON과 일치하며, HC-OPEN/HC-CLASS 계열의 "변수 미생성 인코딩"도 SPEC 1.3의 설계 의도대로다. 관찰 사항 4건은 현 시점 동작에 영향이 없는 잠재·엣지 항목으로, 다구간 개관 도입(관찰 ①)과 SPEC 엣지 명시(관찰 ④)만 후속 작업 시 챙기면 된다.
