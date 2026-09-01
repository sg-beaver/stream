# CP-SAT 제약조건 코드 감사 (SCHEDULER_SPEC ↔ Solver 코드 1:1 대조)

- **관련 이슈**: #82 (멘토 피드백 P0 — "코드가 돌아가는 것"과 "의도한 알고리즘이 정확히 구현된 것"은 다르다)
- **최초 감사**: 2026-08-23, 기준 커밋 `f392f0e`
- **재감사**: 2026-09-01, 기준 커밋 `cc91f74` — 최초 감사 이후 제약 1건 신설·3건 변경
- **대조 대상**
  - 명세: [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) 3장 (HC-*, SC-*)
  - Hard Constraint: `backend/app/scheduler/constraints/hard.py`
  - Soft Constraint: `backend/app/scheduler/constraints/soft.py`
  - 등록 목록: `constraints/__init__.py` (`DEFAULT_HARD_CONSTRAINTS` 5 · `DEFAULT_SOFT_CONSTRAINTS` 9)
  - 변수 도메인 인코딩: `domain/student.py` (`Student.can_work`), `domain/calendar.py` (`OpeningHoursResolver`), `engine/solver.py` (`build_context`)
  - 슬롯 인원 해석: `domain/policy.py` (`resolve_slot_staffing`)
  - 가중치·정책값: `config/departments/*.json` — 3개 부서

> 이슈 본문의 경로 `engine/constraints/hard.py`·`soft.py`는 실제로는 `constraints/hard.py`·`soft.py`이다 (engine 하위가 아님).

## 감사 방법

SPEC의 제약 표 각 행에 대해 (1) 구현 위치, (2) 위반량/제약 인코딩 방식, (3) 가중치·정책값을 코드와 JSON에서 직접 확인했다. HC-OPEN·HC-CLASS 계열은 별도 제약 클래스가 아니라 **변수 생성 단계에서 도메인으로 인코딩**된다(변수가 없으면 위반 자체가 불가능) — SPEC 1.3·`hard.py` 모듈 주석과 일치하는 설계다.

재감사에서는 여기에 더해, 최초 감사 이후 들어온 변경(#89·#123·#161·#171·월 이월)이 SPEC과 코드 양쪽에 반영됐는지를 확인했다.

## 결과 요약

- **Hard 11건 + Soft 14건 전부 구현 확인, SPEC과 불일치 없음.**
- 최초 감사 대비 **Hard 1건 신설(HC-BLOCK-1) · 3건 동작 변경**(HC-STAFF 블록별 인원, HC-TIME-3 월 이월 차감, HC-TIME-1/2 부서 운영 상한 중첩). 셋 다 SPEC 3장에 먼저 반영돼 있고 코드가 그대로 따른다.
- 가중치는 SPEC 3.6 표와 `library_info_service.json`의 `soft_weights`·`preferred_staffing_bands[].weight`가 1:1로 일치. 부서가 3곳으로 늘며 값이 갈리는 지점은 아래 "부서별 정책값" 참고.
- **관찰 사항 6건** (SPEC 위반은 아니나 잠재 이슈·미정의 엣지·비활성 구간). 최초 감사의 4건 중 ①만 부분 해소, **신규 2건**.

**회귀 확인** — 재감사 시점에 스케줄러 테스트를 돌려 코드가 실제로 그 상태임을 확인했다.

```
.venv/bin/python3 -m pytest tests/scheduler/ -q \
    --ignore=tests/scheduler/test_chat_live.py --ignore=tests/scheduler/test_review_live.py
→ 180 passed in 11.73s   (2026-09-01 실행, 실 LLM 2파일 제외)
```

## Hard Constraint 대조표

| ID | 규칙 (SPEC) | 구현 위치 | 구현 방식 | 값 (SPEC ↔ JSON) | 판정 |
|---|---|---|---|---|---|
| HC-TIME-1 | 교비 주 ≤ 14h | `hard.py` `WeeklyHourLimitConstraint` | ISO 주(`isocalendar`)별로 학생 주간 변수 합 ≤ 상한 슬롯 | 14 ↔ `gyobi_weekly_max_hours: 14` | ✅ |
| HC-TIME-2 | 국가 주 ≤ 20h(학기)/40h(방학), 혼재 주는 낮은 상한 | 〃 | 그 주 날짜들의 `period_type`별 상한에 `min()` 적용 → 보수적 상한 | 20/40 ↔ `gukga_weekly_max_hours` | ✅ |
| HC-TIME-3 | 국가 월 ≤ 46h, **그 달 기근무를 뺀 잔여만 배정** | `hard.py` `MonthlyGukgaLimitConstraint` | (연,월)로 그룹핑, GUKGA만. 상한에서 `student.prior_monthly_hours[month]`를 빼고 `max(0, …)`로 바닥 처리 | 46 ↔ `gukga_monthly_max_hours: 46` | ✅ |
| HC-TIME-4 | 부서 전체 2주 교비 총합 상한, 시작일부터 14일 창 | `hard.py` `BiweeklyDeptGyobiLimitConstraint` | `dates[start:start+14]` 창별 교비 전원 변수 합 ≤ 상한 | 190 ↔ `gyobi_biweekly_dept_total_max_hours` (부서별, 아래 표) | ✅ |
| HC-OPEN-1 | 폐관일 배정 없음 (우선순위 1) | `calendar.py` `OpeningHoursResolver.resolve` | `is_closed` → `[]` (슬롯 미생성) | — | ✅ |
| HC-OPEN-2 | 방학 중 공휴일 폐관 | 〃 | 공휴일 ∧ VACATION → `[]` | — | ✅ |
| HC-OPEN-3 | 학기 중 공휴일 단축 개관, 원래 폐관 요일(일)은 폐관 유지 | 〃 | 공휴일 ∧ SEMESTER → `semester_public_holiday_hours`, 단 `default`가 비면(일요일) `[]` | 09:00-17:00 ↔ JSON `semester_public_holiday` | ✅ |
| HC-OPEN-4 | 학기 중 교내 휴강일 → 공휴일과 동일 단축 개관 | 〃 | `is_school_only_holiday` ∧ SEMESTER → 동일 처리 | 〃 | ✅ |
| HC-OPEN-5 | 시험 기간 연장 주말 (월/화 시작→직전 주말, 수/목/금→낀 주말) | `calendar.py` `_extended_weekend` + `resolve` | 시험 시작 요일로 토·일 쌍 계산, SEMESTER ∧ 해당일 → `exam_weekend_hours`. 우선순위는 공휴일보다 낮음(SPEC 순서와 동일) | 08:00-22:00 ↔ JSON `exam_weekend` | ✅ (관찰 ④) |
| HC-OPEN-6 | 그 외 기간·요일별 기본 개관 | 〃 + `policy.py` `default_open_ranges` | JSON `opening_hours.default[period][day]` | 학기 평일 08-22 등 | ✅ |
| HC-CLASS-1 | 가능 시간 외 배정 불가 | `student.py` `can_work` (→ `solver.py` 변수 생성 게이트) | `available`(또는 `date_schedule.available`)에 없으면 변수 미생성 | — | ✅ |
| HC-CLASS-2 | 수업 시간 절대 배정 불가 (시험 기간 포함) | 〃 | 수업 진행일이면 `available ∧ ¬classes` — 시험 기간 여부와 무관하게 차단 | — | ✅ |
| HC-CLASS-3 | 공휴일: 가능 ∪ 원래 수업 시간 배정 가능 | 〃 (`class_free` 분기, `_declared_or_class`) | 공휴일·교내휴강일이면 `available ∨ classes` | — | ✅ |
| HC-CLASS-4 | 교내 휴강일: 교비는 CLASS-3과 동일, 국가는 근로 불가 | 〃 | `school_only ∧ GUKGA → False` 선차단, 교비는 `class_free` 처리 | — | ✅ |
| HC-CLASS-5 | `unavailable_dates` 배정 불가 | 〃 | 최우선 체크 → 변수 미생성 | — | ✅ |
| HC-CLASS-6 | 활동 기간(`active_from`/`until`) 밖 배정 불가 | 〃 | 기간 밖 날짜 → 변수 미생성 | — | ✅ |
| **HC-BLOCK-1** | **부서 정의 블록은 (학생, 날짜)마다 전부 배정 or 전부 비움** | `hard.py` `WorkSlotBlockConstraint` (#89) | 블록 안 인접 변수 쌍의 **체인 등식** `x[t] == x[t+1]`. 변수 없는 슬롯이 하나라도 있으면 그 블록의 남은 변수를 `== 0`으로 고정 | — ↔ JSON `work_slots` (도서관·아텍만 정의) | ✅ |
| HC-STAFF-1 | 슬롯 인원 ≤ `max_per_slot` | `hard.py` `StaffingBoundsConstraint` | 슬롯별 `Σx ≤ max` — 항상 Hard. **상한값은 `ctx.staffing_bounds(day, minute)`가 결정**(#171) | 2 ↔ `max_per_slot` (부서별) | ✅ |
| HC-STAFF-2 | 슬롯 인원 ≥ `min_per_slot`, 완화 옵션 시 SC-UNDER-1로 | 〃 | `allow_understaffing_with_penalty`면 `Σx + shortage ≥ min` + 페널티, 아니면 Hard `Σx ≥ min`. `min ≤ 0`이면 제약 미생성 | 1 ↔ `min_per_slot: 1`, `allow…: true` | ✅ |

**HC-TIME-1/2에 부서 운영 상한이 겹쳐진다 (#161).** 제약 클래스는 정책 객체의 값을 그대로 읽을 뿐이고, `service.apply_department_overrides` → `_apply_department_weekly_limit`이 그 **앞에서** `department.weekly_hour_limit`을 법정 상한 위에 겹쳐(좁히는 방향으로만) 정책을 바꾼다. 확정 검증(`app/work_hours.py`)도 같은 두 상한을 보므로 생성 결과는 항상 확정 가능해야 한다. 현재 시드는 이 값을 비워 두어 실동작에는 나타나지 않는다.

**HC-STAFF의 기준 인원이 슬롯마다 다를 수 있다 (#171).** `ModelContext.staffing_bounds`가 `domain/policy.resolve_slot_staffing(day_blocks, staffing, minute)`을 호출해, 그 슬롯을 덮는 블록에 인원이 정의돼 있으면 블록 값을, 없으면 부서 기본값을 돌려준다. **솔버·사후 검증(`verify._check_staffing`)·미충원 보고가 같은 함수를 쓴다** — SPEC 3.4의 "적용 지점은 한 군데다"와 일치.

## Soft Constraint 대조표

가중치 등록 경로: 모든 Soft 페널티는 `constraints/base.py` `ModelContext.add_penalty`를 거치며, DB의 `department_policy.soft_weight_scales`(카테고리별 배율, 기본 1.0)가 여기서 일괄 반영된다. JSON 정책 파일에는 배율이 없으므로 아래 표의 가중치가 그대로 목적함수에 들어간다.

> **배율 0은 항을 아예 만들지 않는다.** `add_penalty`가 `scaled = round(weight × scale)`을 계산한 뒤 `scaled > 0`일 때만 항을 넣는다 — 가중치 0짜리 항이 목적함수·`penalty_breakdown`에 남지 않는다. 챗봇 세션 배율(#136)도 같은 경로를 탄다.

| ID | 제약 (SPEC) | 구현 위치 (`soft.py`) | 위반량 인코딩 | 가중치 (SPEC ↔ JSON 키) | 판정 |
|---|---|---|---|---|---|
| SC-UNDER-1 | 최소 인원 미달 | `hard.py` `StaffingBoundsConstraint` (완화 분기) | 슬롯별 부족 인원 IntVar `shortage ∈ [0, min_per_slot]` | 1000 ↔ `understaffing: 1000` | ✅ |
| SC-STAFF-1 | 선호 인원 (선생님 재실 시간대 2명) | `PreferredStaffingConstraint` | 밴드별 `Σx + deficit ≥ preferred_count`, deficit이 위반량. `preferred_count ≤ min_per_slot`인 밴드는 스킵 | 8 ↔ 밴드 `weight: 8` (학기 09-12·13-17, 방학 10-12·13-17) | ✅ |
| SC-STAFF-2 | 선생님 부재 시간대 가능하면 2명 | 〃 (같은 클래스, 밴드 데이터로 구분) | 〃 | 4 ↔ 밴드 `weight: 4` (학기 저녁 17-22, 방학 저녁 17-20·토 09-17) | ✅ |
| SC-PREF-1 | 희망 시간 우선 | `PreferenceMatchConstraint` | `is_preferred`가 아닌 슬롯의 배정 변수 자체에 페널티 | 3 ↔ `preferred_slot_miss: 3` | ✅ |
| SC-CONT-1 | 조각 근무 최소화 | `ContiguityConstraint` | 학생-일자별 블록 시작 지표 `start ≥ x[t] − x[t−1]` (배정 불가 슬롯은 경계로 리셋) | 4 ↔ `block_start: 4` | ✅ (관찰 ①) |
| SC-MEAL-1 | (학기) 점심 12-13 / 저녁 17-18 전부 수업+근무면 위반. 시험 기간 휴강 수업 시간은 식사 가능 | `MealBreakConstraint` + `Student.has_class` | 창 내 전 슬롯 바쁨(근무 변수 + 수업 상수)이면 `missed=1`. 항상 빈 슬롯 있으면 제약 미생성 | 20 ↔ `meal_missed: 20`, 창 ↔ `meal_windows` | ✅ (관찰 ②·⑥) |
| SC-MEAL-2 | (방학) 6h 이상 배정된 날 점심 미확보 | 〃 (방학 분기) | `long_day`(총 슬롯 ≥ 기준) ∧ `missed` 결합 지표에 페널티. `wants_meal_break` 선택제 | 20 ↔ 〃, 6h ↔ `vacation_long_shift_meal_hours: 6` | ✅ |
| SC-MORN-1 | 전날 마감 근무 후 아침 근무 | `MorningRulesConstraint._close_then_morning` | 그날 마지막 개관 슬롯 변수 ∧ 다음 날 아침 근무 지표 → 페널티. `no_morning_after_close` 선택제 | 15 ↔ `morning_after_close: 15` | ✅ |
| SC-MORN-2 | 주당 아침 근무 일수 초과 | `MorningRulesConstraint._weekly_cap` | ISO 주별 `excess ≥ Σ아침근무일 − cap` (초과 일수) | 10 ↔ `morning_days_excess: 10` | ✅ |
| SC-MORN-3 | 아침 근무 연속 일수 초과 | `MorningRulesConstraint._consecutive_cap` | 달력상 연속 `cap+1`일 창이 전부 아침 근무면 창별 0/1 위반 | 10 ↔ `consecutive_morning_excess: 10` | ✅ |
| (SC-MORN Hard 승격) | `max_*_morning_days = 0`이면 아침 배정 금지 | `MorningRulesConstraint` + `StudentPreferences.morning_forbidden` | 둘 중 하나라도 0이면 아침 슬롯 변수 `== 0` 강제 (Hard) | — | ✅ |
| SC-EXAM-1 | 시험 시작 전 버퍼 내 배정 | `ExamProximityConstraint` | `[시작−버퍼, 시작)` 구간의 배정 변수에 슬롯당 페널티 | 25 ↔ `exam_proximity: 25`, 3h ↔ `exam_buffer_minutes: 180` | ✅ |
| SC-AVOID-1 | 회피 요청 시간대 배정 | `AvoidRangeConstraint` | 회피 구간 내 배정 변수에 슬롯당 페널티 | 12 ↔ `avoid_range_slot: 12` | ✅ |
| SC-COMMUTE-1 | (학기) 비등교 요일 배정 | `NonCampusDayConstraint` | SEMESTER ∧ `campus_days` 미포함 요일의 '그날 근무 여부' 지표에 페널티. `campus_days` 비면 미적용 | 5 ↔ `non_campus_day: 5` | ✅ |
| SC-FAIR-1 | 공평 배분 — 주간 목표 미달 페널티 | `FairHoursConstraint` | 목표 = `min(주간 상한 슬롯, 그 주 가용 변수 수)`, `shortfall ≥ 목표 − Σ배정`. 상한 계산은 HC-TIME-1/2와 동일 로직 재사용 | 6 ↔ `fair_hours_shortfall: 6` | ✅ (관찰 ⑤ — **무효 구간 있음**) |

'아침' 경계는 `morning_end` **이전 시작** 슬롯(`m < morning_end`)으로, SPEC의 "morning_end 이전 슬롯" 정의와 일치한다. `morning_end` 값은 부서마다 다르다(아래 표).

## 부서별 정책값

최초 감사 때는 부서가 1곳이었다. 지금은 3곳이고, SPEC이 "부서별 입력 가능"이라고 둔 항목에서 값이 갈린다. **갈린 값은 전부 SPEC이 허용한 범위 안이며 제약 코드는 동일하다.**

| 항목 | 도서관 정보서비스팀 | 아텍 학과사무실 | 교육대학원 행정실 |
|---|---|---|---|
| `max_per_slot` | 2 | **1** | 2 |
| `min_per_slot` | 1 | 1 | 1 |
| 2주 교비 총합 상한 (HC-TIME-4) | 190h | **280h** | **200h** |
| `morning_end` (SC-MORN 경계) | 09:00 | 09:00 | **10:00** |
| `work_slots` (HC-BLOCK-1) | 정의됨 | 정의됨 (1.5h × 6블록) | **없음** — 자유 30분 그리드 |
| `preferred_staffing_bands` (SC-STAFF-1/2) | 7밴드 (weight 8·4) | **0밴드** | 1밴드 (weight 8, 학기 평일 18-21) |
| `meal_windows` (SC-MEAL-1/2) | 3창 | **빈 목록** | 3창 |
| `soft_weights` 11개 키 | 전부 동일 | 전부 동일 | 전부 동일 |

`soft_weights`의 11개 카테고리 값은 세 부서가 완전히 같다 — 부서 차이는 가중치가 아니라 **적용 대상(밴드·창·블록)** 에서 난다.

## 목적함수·부가 동작 (SPEC 3.7)

| 항목 | SPEC | 코드 | 판정 |
|---|---|---|---|
| 목적함수 | `minimize Σ(weight × violation)` | `solver.py` `Minimize(sum(t.weight * t.var))` | ✅ |
| `penalty_breakdown` | 제약별 페널티 합계 포함 | `_extract`가 breakdown + 위치 메타 포함 `penalty_events` 생성 | ✅ |
| 상태 처리 | INFEASIBLE→409, UNKNOWN→504 | `routers/schedule.py`에서 구분 응답 | ✅ |
| 동률 해 열거 | 페널티 ≤ V 제약 + 다양성 컷(기본 4슬롯), 해당 제한은 해 하나당 | `solve_alternatives` — 첫 해 후 `objective ≤ V` 추가, `_add_diversity_cut`, `min_difference_slots=4` 기본값 | ✅ |

## 관찰 사항 (SPEC 불일치 아님 — 잠재 이슈·엣지·비활성 구간)

**① `ContiguityConstraint`의 시간 불연속 처리 — 부분 해소.** 블록 경계 판정이 "개관 슬롯 목록상 인접"을 기준으로 하므로, 하루 개관이 여러 구간으로 끊기는 경우(점심 휴관 등) 휴관을 사이에 둔 두 근무가 **한 블록으로 계산**된다. `prev`가 리셋되는 것은 변수가 없는 슬롯(`ctx.var(...) is None`)일 때뿐이고, 개관하지 않는 시간은 애초에 `slots_of(day)`에 없어 리셋 기회가 없기 때문이다.
→ **#89에서 완화**: 근무 블록(HC-BLOCK-1)이 정의된 요일은 블록 경계가 명시돼 휴관을 가로지르는 병합이 발생하지 않는다(블록은 개관 구간을 정확히 타일링해야 하므로 휴관을 덮는 블록 자체가 검증에서 거부된다). **블록 미정의 요일의 자유 그리드에는 원 관찰이 여전히 유효하며, 교육대학원 행정실은 `work_slots`가 없어 전 요일이 여기 해당한다.**

**② SC-MEAL-1의 상수 페널티.** 학기 중 식사 창이 **수업만으로** 전부 채워진 학생(그날 다른 시간대 근무 변수는 있음)은 배정과 무관하게 `missed=1`이 강제되어, 고정 페널티 20이 항상 목적함수·`penalty_breakdown`·위반 이벤트에 잡힌다. SPEC의 위반 정의("수업+근무로 전부 채워지면")와 문언상 일치하고 최적화 결과를 왜곡하지도 않지만, 담당자 리포트에 "배정 때문이 아닌" 위반 이벤트가 노출된다.

**③ 시간 상한의 슬롯 변환 내림.** `TimeGrid.hours_to_slots`는 `int(hours * 60 / slot_minutes)` 절사라, 슬롯 길이로 나누어떨어지지 않는 상한(예: 30분 슬롯에 14.2h)은 더 낮은 쪽으로 적용된다. 상한(Hard)에는 보수적이므로 안전하고, 현재 값은 모두 정확히 나누어떨어진다. HC-TIME-3의 잔여량(`46 − prior`)에도 같은 절사가 걸린다.

**④ 토/일 시작 시험의 연장 주말 판정 미정의.** SPEC 3.2의 요일 규칙은 월-금 시작만 정의한다. `_extended_weekend`는 토 시작이면 다음 날 일요일, 일 시작이면 시작일 자신을 일요일로 잡아 그 전날 토요일과 쌍을 만든다 — 해당 케이스가 SPEC에 없으므로 실데이터에 등장하면 규칙을 SPEC에 명시해야 한다.

**⑤ (신규) SC-FAIR-1에 배분에 영향을 주지 못하는 구간이 있다.** 목표가 `min(주간 상한, 그 주 가용 슬롯)`인데, **그 부서 학생 전원의 가용 슬롯이 주간 상한 이상이면** 목표가 모두 상한값으로 같아진다. 그러면 주간 상한이 배정을 목표 이하로 묶으므로 `Σ미달 = Σ목표 − Σ배정`이 **배분과 무관한 상수**가 되어, 어떻게 나눠도 페널티가 같다.

실측으로 드러났다 (LOG.md 2026-08-29, #172) — 아텍 부서에서 근무 블록을 3시간에서 1.5시간으로 바꿔 학생별 배정이 `{0h: 5명, 3h: 6명, 6h: 6명, 12h: 3명}`에서 `{0h: 8명, 6h: 9명, 12h: 3명}`으로 달라졌는데도 **objective가 2484로 완전히 동일**했다(`fair_hours` 2280 = 380슬롯 × 6, 상수). 실제 배분을 정한 것은 `contiguity`(블록 시작당 4점)였고, 조각 근무를 줄이려 소수에게 몰아주는 쪽이 이겼다.

**총수요가 인원 총capacity보다 작은 부서는 모두 이 구간에 있다** — 아텍뿐 아니라 교육대학원·다른 검증 부서도 해당한다. SPEC 3.6의 SC-FAIR-1 설명("각자 가능한 만큼에 비례해 고르게 채워, 특정 학생에게 시간이 쏠리는 것을 방지")은 이 구간에서 성립하지 않는다. **코드가 SPEC을 잘못 구현한 것이 아니라, SPEC이 정의한 위반량 자체가 이 구간에서 상수라서 최적화에 기여하지 않는 것**이다. 배분 축 수정은 정보서비스팀까지 영향이 가므로 별도 작업으로 남아 있다.

**⑥ (신규) 아텍 학과사무실은 SC-STAFF-1/2와 SC-MEAL-1/2가 생성되지 않는다.** `preferred_staffing_bands`가 빈 목록이라 `PreferredStaffingConstraint`는 매 슬롯 `band is None`으로 스킵하고, `meal_windows`도 빈 목록이라 `MealBreakConstraint`가 창을 하나도 만들지 않는다. `soft_weights`에는 `meal_missed: 20`이 그대로 들어 있어 **파일만 보면 켜져 있는 것처럼 보인다.** 대기 근무가 주 7시간·1.5시간 블록이라 식사 창을 가로지를 일이 없다는 운영 판단으로 보이지만, 정책 파일에 그 의도가 적혀 있지 않다. 가중치는 있는데 적용 대상이 비어 있는 상태는 나중에 "왜 안 걸리지"로 돌아오기 쉽다.

## 결론

멘토 피드백의 우려 지점(SPEC의 제약 표와 Solver 구현의 괴리)은 **재감사에서도 발견되지 않았다.** 25개 제약 전부 구현 위치·방식·가중치가 SPEC 및 부서 정책 JSON과 일치하며, 최초 감사 이후 들어온 변경 4건(HC-BLOCK-1 신설, 블록별 인원, 월 이월 차감, 부서 운영 상한 중첩)도 SPEC에 먼저 반영된 뒤 코드가 따라간 순서였다.

다만 **"구현이 명세와 같다"와 "제약이 의도한 효과를 낸다"는 다르다**는 것이 이번 재감사의 소득이다. 관찰 ⑤가 그 예다 — SC-FAIR-1은 명세대로 구현돼 있지만, 총수요가 총capacity보다 작은 부서에서는 위반량이 상수가 되어 배분에 아무 영향을 주지 못한다. 다음 감사에서는 제약별로 **"이 제약을 껐을 때 결과가 달라지는가"** 를 함께 재는 것이 유효할 것이다.

후속으로 챙길 것: 관찰 ⑤(배분 축 수정), 관찰 ①(블록 미정의 부서의 다구간 개관), 관찰 ④(SPEC 엣지 명시), 관찰 ⑥(정책 파일에 의도 주석).
