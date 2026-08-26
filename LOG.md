# 개발 로그

개발 과정에서 **발견한 문제를 어떻게 테스트하고 개선했는지** 남기는 기록입니다. 단순 작업 일지가 아니며, 문제 발견 → 검증 → 개선의 전후 비교가 있는 항목만 추가합니다. 작성 규칙은 `CLAUDE.md`의 "개발 로그 규칙"을 따릅니다.

핵심 기록 대상 (우선순위 순):

- Hard Constraint 검증: 반드시 지켜야 하는 근무 조건 위반이 0건인지
- 근무 형평성 검증: `fair_hours` 적용 전/후 특정 학생 편중 정도 변화
- Edge Case 검증: 인원 부족·조건 충돌 시 Solver가 의도한 결과를 내는지
- 성능 비교: 수작업 시간표 작성 시간 vs Solver 생성 시간

---

## 템플릿

새 항목은 아래 템플릿을 복사해 이 구분선 바로 아래(최신이 위)에 추가합니다.

```markdown
## YYYY-MM-DD — 제목 (한 줄 요약)

- **문제/가설**: 무엇이 잘못됐다고 판단했는가 / 무엇을 확인하려 했는가
- **테스트 조건**: 사용한 데이터·설정·실행 방법 (재현 가능하게)
- **Before**: 수정 전 실측 수치 (Solver status·solve time 포함)
- **수정 내용**: 바꾼 코드/설정과 그 이유 (커밋·PR 링크)
- **After**: 동일 조건 재실행 실측 수치
```

---

<!-- 여기부터 최신 항목이 위로 오도록 기록합니다. -->

## 2026-08-23 — 방학 기본 근무 슬롯 추가 — 방학 풀이가 OPTIMAL로 단축

- **문제/가설**: 방학 기간은 work_slots 미정의라 자유 30분 그리드로 배정 — 학기처럼 블록 단위 기본값이 필요. 블록 제약이 해공간을 좁혀 풀이에도 유리할 것으로 가정.
- **테스트 조건**: 샘플 데이터(`students_sample`, 학생 9명) + `library_info_service` 정책, 방학 기간 시작(2026-06-29 월) × 14일, `solve(time_limit_seconds=30.0)` 단독 실행. Before/After 차이는 정책 JSON의 `work_slots.default.vacation` 추가 여부뿐.
- **Before**: status=FEASIBLE, solve_time=30.02s(시간 제한 도달), objective=1994, 미충원 0, 배정 502슬롯.
- **수정 내용**: 방학 기본 블록 추가 — 평일 09-12·12-13·13-16·16-17·17-18·18-19·19-20(개관 09-20 정확 타일링), 토 09-12·12-13·13-16·16-17(09-17 타일링). 코드 변경 없음(정책 파일만).
- **After**: status=**OPTIMAL**, solve_time=**0.60s**(50배 단축 — 블록 등식으로 탐색 공간 축소), objective=1996(+0.1%), 미충원 0 동일, 배정 504슬롯, 블록 위반 0건(블록 있는 12일 전수). 전체 회귀 137건 통과.

## 2026-08-23 — 학기 고정 시간표: 서버 전개 + semester_pattern 국가 주간 상한 조임

- **문제/가설**: 기존 학기 고정은 프론트가 2주 결과를 그대로 복제해 확정 — 공휴일 단축·폐관·실제 학기 종료일을 무시하고, 국가근로 주 20h 패턴을 복제하면 월 46h 상한(HC-TIME-3) 위반. 복제를 서버로 옮겨 개관 시간 교집합을 취하고, 생성 시 국가 주간 상한을 9h로 조이면(9×5주=45≤46) 반복 후에도 규정이 구조적으로 지켜질 것으로 가정.
- **테스트 조건**: 샘플 데이터(`students_sample`, 학생 9명·2주) + `library_info_service` 정책, `solve(time_limit_seconds=30.0)` 단독 실행. Before/After 차이는 `_tighten_for_semester_pattern` 적용 여부뿐. 전개는 2026 실제 학사 캘린더로 브라우저 E2E 확인.
- **Before**: status=FEASIBLE, solve_time=30.04s, objective=13493, 국가 학생 주간 최대 20.0h (복제 시 월 80h+ 위반 가능).
- **수정 내용**: `expand_weekly_pattern`(confirm `repeat_until` 서버 전개 — 폐관 행 제거·단축 개관 클리핑·`adjusted_dates` 보고), `GenerateRequest.semester_pattern`(국가 주간 min(기존, 9h)), `AcademicCalendar.semester_containing`(응답 `semester_end`). 테스트 16건 추가(`test_semester_expand.py` 9, `test_schedule_confirm_repeat.py` 7).
- **After**: status=FEASIBLE, solve_time=30.04s, objective=13786(+2.2%), 국가 학생 주간 최대 **9.0h** — 월 상한 구조 보장. E2E(2026-09-07 시작, 12-21까지 반복 확정): 486건 저장, 조정 6일(추석 폐관 9/24-26 제외, 10/1·10/5·10/9 단축 클리핑) — 학사 캘린더와 일치. 전체 회귀 103건 통과.

## 2026-08-23 — 부서 정의 근무 슬롯(블록) all-or-none 제약 도입 (#89)

- **문제/가설**: 부서가 정의한 근무 슬롯(예: 학기 평일 09:00-10:30) 단위로 배정해야 하는데 솔버는 30분 슬롯을 자유롭게 조각 배정. 30분 그리드를 유지한 채 블록 단위 all-or-none Hard 제약만 추가하면 기존 시간 상한·인원 제약 무수정으로 동작할 것으로 가정.
- **테스트 조건**: 샘플 데이터(`students_sample`, 학생 9명·2주) + `library_info_service` 정책, `solve(time_limit_seconds=30.0)` 단독 실행. Before/After 차이는 정책 JSON의 `work_slots`(학기 평일 11블록·토 3블록) 추가 여부뿐.
- **Before**: status=FEASIBLE, solve_time=30.04s, objective=13470, 미충원 12슬롯(understaffing 12000), 배정 540슬롯.
- **수정 내용**: `WorkSlotBlockConstraint`(Hard, 블록 내 인접 변수 체인 등식) 추가, `DepartmentPolicy.work_slots` + `OpeningHoursResolver.resolve_work_blocks`(특별일 개관 구간과 교집합 클리핑), `department_policy.work_slots` DB 오버라이드, 정책 GET/PATCH API 확장 + 개관 시간 타일링 검증(400). 테스트 34건 추가(`test_work_slot_blocks.py` 18, `test_policy_work_slots_api.py` 16).
- **After**: status=FEASIBLE, solve_time=30.04s, objective=13892(+3.1%, 블록 등식으로 해공간 축소), 미충원 12슬롯 동일, 배정 540슬롯 동일, **블록 위반 0건**(블록 있는 12일 × 전 학생 전수 확인 — 모든 블록이 전부 배정 or 전무). 전체 회귀 121건 통과(라이브 LLM 8건 제외).

## 2026-08-23 — Solver status 기록 보강: solver_summary·로그에 status/solve_time 추가 (#84)

- **문제/가설**: DB `solver_summary`에 status·solve_time이 빠져 있어 확정된 시간표가 OPTIMAL이었는지 시간 제한 조기 종료(FEASIBLE)였는지 사후 추적 불가. 로그로도 남지 않아 이력 축적 안 됨.
- **테스트 조건**: 샘플 데이터(`students_sample`, 학생 9명·2주) + `library_info_service` 정책, `solve(time_limit_seconds=30.0)` 단독 실행.
- **Before**: `solver_summary` 키 = shortages·penalty_summary·per_student만 저장. Solver 실행 로그 없음.
- **수정 내용**: `routers/schedule.py` solver_summary에 `status`·`solve_time_seconds` 추가, `engine/solver.py` `_extract()`에 status·solve_time·objective INFO 로깅 추가. 테스트 2종(`test_solver_status_record.py`) 추가.
- **After**: 동일 조건 실행 시 로그 `Solver 종료: status=FEASIBLE solve_time=30.05s objective=13492` 출력 — 2주 샘플은 30초 제한에서 OPTIMAL이 아닌 FEASIBLE로 조기 종료됨이 실측으로 확인됨(= 동일 입력에도 결과가 달라질 수 있는 원인이 시간 제한임을 이제 기록으로 구분 가능). 신규 테스트 2건 통과.
## 2026-08-23 — Solver Edge Case 3종 검증 (인원 부족·학생 편중·조건 변경) (#83)

- **문제/가설**: `ScheduleSolver.solve()`/`solve_alternatives()` 직접 호출 테스트가 0건이라 극단 입력(인원 부족, 한 학생 편중, 재생성 안정성)에서의 동작이 미검증 상태였다.
- **테스트 조건**: `backend/tests/scheduler/test_solver_edge_cases.py` — 코드로 구성한 최소 정책(60분 슬롯, 평일 09-13시 개관 4슬롯, min 1/max 2, 가중치는 프로덕션과 동일)·전 기간 방학 캘린더·주 1회(7일) 시나리오. `pytest tests/scheduler/test_solver_edge_cases.py`로 재현.
- **Before**: Solver 직접 호출 테스트 0건 (검증 수치 없음).
- **수정 내용**: Edge Case 테스트 17건 추가 — 멘토 제안 3종(6건) + 추가 7종(11건: Hard 전수 검증·date_schedule 경로·시간 제한 status·부분 부족·빈 입력·아침 근무 불가 Hard·국가근로 특수 규칙). 코드 수정 없음 — 전부 기존 동작이 의도대로 확인됨.
- **After** (실측):
  - 인원 부족(완화 ON): `OPTIMAL` 0.023s — 가용 학생 없는 12슬롯이 shortage 리포트 12건 + understaffing 페널티 12,000으로 처리, 가용 슬롯 8건은 전부 배정. 부분 부족(min 2·1명 가용)도 required=2/assigned=1로 정확히 리포트.
  - 인원 부족(완화 OFF) 및 Hard 충돌(min 인원 20슬롯 vs 주간 상한 4시간): 둘 다 `INFEASIBLE` ≤0.002s.
  - 학생 편중: 전 시간대(20슬롯) 가용 학생이 주간 상한 14슬롯에서 멈추고, 가용 4슬롯 학생 2명은 각자 4슬롯 전부 배정 (`OPTIMAL` 0.010s, fair_hours shortfall 0). date_schedule 경로도 동일 결과.
  - 조건 변경 안정성: 학생 1명의 가용 슬롯 1개 제거 후 재생성 시 배정 34건 중 1건만 변경 (`OPTIMAL` 0.004s → 0.004s, diff=1).
  - Hard 전수 검증: 프로덕션 config + 샘플(9명·2주)로 풀어(`FEASIBLE` 10.04s, objective 13,501) 배정 540건을 전수 재검산 — max_per_slot·주간/월간/2주 상한·개관·can_work 위반 0건.
  - 시간 제한 조기 종료: 같은 샘플에 time_limit 0.001s → `UNKNOWN` 0.006s (INFEASIBLE과 구분됨을 검증, #84 status 기록과 연계).
