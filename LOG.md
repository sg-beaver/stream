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

## 2026-08-23 — Solver status 기록 보강: solver_summary·로그에 status/solve_time 추가 (#84)

- **문제/가설**: DB `solver_summary`에 status·solve_time이 빠져 있어 확정된 시간표가 OPTIMAL이었는지 시간 제한 조기 종료(FEASIBLE)였는지 사후 추적 불가. 로그로도 남지 않아 이력 축적 안 됨.
- **테스트 조건**: 샘플 데이터(`students_sample`, 학생 9명·2주) + `library_info_service` 정책, `solve(time_limit_seconds=30.0)` 단독 실행.
- **Before**: `solver_summary` 키 = shortages·penalty_summary·per_student만 저장. Solver 실행 로그 없음.
- **수정 내용**: `routers/schedule.py` solver_summary에 `status`·`solve_time_seconds` 추가, `engine/solver.py` `_extract()`에 status·solve_time·objective INFO 로깅 추가. 테스트 2종(`test_solver_status_record.py`) 추가.
- **After**: 동일 조건 실행 시 로그 `Solver 종료: status=FEASIBLE solve_time=30.05s objective=13492` 출력 — 2주 샘플은 30초 제한에서 OPTIMAL이 아닌 FEASIBLE로 조기 종료됨이 실측으로 확인됨(= 동일 입력에도 결과가 달라질 수 있는 원인이 시간 제한임을 이제 기록으로 구분 가능). 신규 테스트 2건 통과.
