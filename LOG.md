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

## 2026-08-27 — AI 검토 모델 실험 2라운드: GPT·Claude 실측 + gemini-3.7-flash 클린 재측정 (#114)

- **문제/가설**: 8/24 라운드는 OPENAI_API_KEY·ANTHROPIC_API_KEY 미발급으로 GPT·Claude를 아예 못 돌렸고, gemini-3.7-flash는 무료 티어 일일 할당량(20/일, 프로젝트 단위) 소진으로 9케이스 완주를 못 했다. 세 키를 모두 유료로 발급해 #114 완료 기준(gpt/gemini/claude 실행 결과 저장)을 채우고, "호스팅 모델도 온프레미스처럼 재실행 시 검출률이 흔들리는가"를 같이 확인하려 함.
- **테스트 조건**: 8/24와 동일한 검출력 케이스 9개(`scripts/eval_review_cases.json`) · 동일 프롬프트(`review_system_prompt.md`) · 동일 스키마(`ReviewResult`), `eval_review.py --provider {openai,claude,gemini}`, repeat=1을 provider마다 2회 별도 실행(1차/2차). gemini-3.7-flash만 `--delay 15`(RPM 회피), 나머지는 딜레이 없음. 모델은 `.env` 기본값 — `gpt-4.1-mini`, `claude-sonnet-5`, `gemini-3.7-flash`, 프로덕션 대조군 `gemini-3.5-flash`(같은 날 1회 재측정 — 8/24 수치와 날짜가 달라 동일 조건 비교가 안 되므로 오늘 다시 잼).
- **Before**: 8/24 기준 — GPT·Claude는 `not_configured` 스킵으로 **측정치 없음**, gemini-3.7-flash는 4번의 조각난 시도 합산으로 9케이스 중 7개만 1회 이상 성공(429로 나머지 실패)해 **비교표에 못 올림**. 온프레미스 3종은 최고가 gemma3:12b 7/9(78%)→5/9(56%).
- **수정 내용**: 코드 변경 없음 — `.env`에 세 키 채우고 기존 하네스(PR #117)를 그대로 실행만 함. 원본 결과 JSON은 `backend/output/eval_2026-08-27_*.json`(gitignore, 로컬 보관).
- **After**: 호출 실패(429·quota 등) **0건**, 4개 모델 × 2라운드(3.5-flash만 1라운드) 전부 완주.

  | Provider | Model | 검출률(1차→2차) | 평균 응답시간(최소~최대, 2차) | 평균 토큰/호출(2차) |
  |---|---|---|---|---|
  | Claude | claude-sonnet-5 | **9/9 (100%) → 9/9 (100%)** | 5.3s (2.6~10.9s) | 3,461 (입력 3,068/출력 393) |
  | Gemini | gemini-3.7-flash | **9/9 (100%) → 9/9 (100%)** | 4.6s (2.4~8.7s) | 2,000 (입력 1,324/출력 249) |
  | Gemini(프로덕션) | gemini-3.5-flash | 9/9 (100%) — 1라운드 | 5.9s (2.9~9.8s) | 2,492 (입력 1,324/출력 239) |
  | OpenAI | gpt-4.1-mini | 7/9 (78%) → 8/9 (89%) | 2.8s (1.4~4.2s) | 1,619 (입력 1,457/출력 161) |

  관찰 3가지:

  1. **gemini-3.7-flash 클린 측정 완료** — 할당량 리셋 후 두 라운드 다 9/9, 429 0건. 프로덕션 3.5-flash 대비 응답시간(4.6s vs 5.9s)·토큰(2,000 vs 2,492) 모두 낮으면서 검출률은 동일 → 프로덕션 모델 업그레이드 후보로 볼 근거는 생겼다(단 3.7은 2라운드, 3.5는 1라운드라 표본이 비대칭).
  2. **gpt-4.1-mini만 유일하게 미검출 발생** — `daily-max`(하루 연속 근무 상한)는 **두 라운드 모두** 미검출로 재현됐고, `closing-gap`(마감 시간대 공백)은 1차만 미검출. 응답은 가장 빠르고(2.8s) 토큰도 가장 적지만(1,619) 이 케이스 세트에선 검출력이 한 단계 아래.
  3. **호스팅 모델은 온프레미스와 달리 재실행에 안정적** — 8/24에 온프레미스 3종이 재실행 시 22~23%p씩 떨어진 것과 대조적으로, claude-sonnet-5·gemini-3.7-flash는 두 라운드 다 9/9로 동일했고 gpt-4.1-mini만 ±1건 흔들렸다. 8/24의 "1회 측정으로 우열 판단 위험" 결론은 온프레미스 한정이고 호스팅 모델엔 그대로 적용되지 않는다.

  **토큰 수치 비교 시 주의(측정 방식 차이)**: 세 provider의 "총 토큰"은 정의가 다르다. OpenAI·Claude는 총계 = 입력+출력이 정확히 맞지만, Gemini의 `total_token_count`는 사고(thinking) 토큰을 따로 포함해서 입력+출력보다 크다(3.5-flash 22,427 vs 입력+출력 14,066 → 사고 8,361 / 3.7-flash 18,003 vs 14,155 → 사고 3,848). 또 Claude의 입력 토큰이 같은 프롬프트인데도 3,068/호출로 Gemini(1,324)의 2.3배인데, 이는 Claude에 구조화 출력이 없어 `ReviewResult`의 JSON 스키마 전체를 tool `input_schema`로 매 호출 넘기기 때문이다(하네스 구현상 오버헤드지 모델 특성이 아님). 따라서 위 표의 토큰 열은 provider 간 절대 비교가 아니라 같은 provider의 라운드 간 비교로만 쓴다.

  **결론**: 검출력만 보면 claude-sonnet-5 = gemini-3.7-flash = gemini-3.5-flash(9/9) > gpt-4.1-mini(7~8/9) > 온프레미스 최고 gemma3:12b(5~7/9). 프로덕션 provider를 Gemini에서 바꿀 근거는 여전히 없고(REQ-SCHED-016 유지), 다만 **같은 Gemini 안에서 3.5-flash → 3.7-flash 업그레이드는 검토할 만하다** — 다음 라운드에서 3.5/3.7을 같은 횟수로 맞춰 재측정 필요. claude-sonnet-5는 검출력 동률의 유효한 대안이지만 위 tool-schema 오버헤드를 걷어낸 뒤에 비용 비교를 해야 의미가 있다.

## 2026-08-24 — AI 검토 모델 실험: Gemini(프로덕션) vs 온프레미스 3종 (#114)

- **문제/가설**: 프로덕션 AI 검토(REQ-SCHED-016)는 Gemini 고정인데, 다른 provider(GPT·Claude)나 온프레미스 모델이 같은 규칙 위반 검출 과제에서 얼마나 쓸만한지 실측 데이터가 없었다. 온프레미스 7~12B급 모델이 무료 대안으로 쓸 만한 검출력이 나올지 확인하려 함.
- **테스트 조건**: 기존 검출력 케이스 9개(`scripts/eval_review_cases.json`, #80) 그대로, `eval_review.py --provider {gemini,local}`로 동일 프롬프트·스키마(`ReviewResult`) 통과, repeat=1. 온프레미스는 Mac M2/16GB + Ollama 0.32.15, 모델은 Ollama 라이브러리 기본 태그(q4 양자화) 그대로. GPT/Claude는 OPENAI_API_KEY·ANTHROPIC_API_KEY 미발급으로 이번 라운드 제외(`not_configured`로 스킵 확인만 함).
- **Before**: 비교 데이터 없음 — Gemini 외 provider는 검출력·응답속도 실측 이력 없었음.
- **수정 내용**: `eval_review.py`에 `--provider` 옵션 추가(gemini/openai/claude/local), 케이스별 호출 소요시간(elapsed_s)·토큰 사용량(input/output/total) 계측 추가. Gemini는 `review.py._call_gemini`가 `usage_metadata`를 `LAST_USAGE` 모듈 변수에 기록하는 side channel로, 기존 함수 시그니처·프로덕션 호출부는 변경 없음(Gemini 고정 유지, AI Layer 분리 원칙 그대로).
- **After**: 동일 조건으로 2회 반복 실행(1차 → 2차, repeat=1씩 별도 실행) — LLM 출력이 비결정적이라 재실행 시 검출률이 달라지는 것 자체도 기록.

  | Provider | Model | 검출률(1차→2차) | 평균 응답시간(최소~최대, 2차 기준) | 평균 토큰/호출(2차 기준) | 비고 |
  |---|---|---|---|---|---|
  | Gemini(프로덕션) | gemini-3.5-flash | 9/9 (100%) → 9/9 (100%) | 8.6s (2.7~44.3s) | 2,257 (입력 1,324/출력 234) | 두 라운드 다 429 1회(무료 티어 20회/일) 포함해도 안정적 |
  | 온프레미스 | gemma3:12b | 7/9 (78%) → 5/9 (56%) | 33.6s (11.8~50.6s) | 1,603 (입력 1,338/출력 265) | 1차 도중 Ollama Metal GPU OOM(`kIOGPUCommandBufferCallbackErrorOutOfMemory`)으로 전체 실패 → 서비스 재시작 후 정상화, 이후 수치는 재시작 후 값 |
  | 온프레미스 | deepseek-r1:7b | 6/9 (67%) → 4/9 (44%) | 36.6s (9.8~58.0s) | 2,017 (입력 1,456/출력 561) | "확인 불가 규칙" 케이스에서 `[time slot]`/`[adjective]` 같은 미채움 템플릿 placeholder를 그대로 출력하는 오류 관찰(2차) |
  | 온프레미스 | qwen2.5:7b | 2/9 (22%) → 2/9 (22%) | 7.6s (3.7~25.9s) | 1,558 (입력 1,466/출력 92) | 유일하게 재현됨(빈 findings로만 응답) — 검출력 부족이 부하·비결정성보다 모델 자체 한계로 보임 |

  호출 실패(quota 등) 0건(gemma3 1차의 GPU OOM 실패는 인프라 문제로 quota 실패와 별개, 재실행으로 회복). 원본 결과는 `backend/output/eval_2026-08-24_*.json`, `*-v2.json`(gitignore 대상, 로컬 보관). 결론: 이번 케이스 세트 기준으로는 Gemini가 검출력·응답속도·안정성 모두 압도적이라 프로덕션 provider 변경 근거는 없음. 온프레미스 3종 모두 재실행 시 검출률이 하락하는 경향(gemma3 -22%p, deepseek-r1 -23%p)을 보여 1회 측정만으로 우열을 단정하기 어렵고, qwen2.5:7b만 일관되게 낮음(이 과제엔 부적합). GPT/Claude는 키 발급 후 같은 케이스로 재측정 필요.

**추가: gemini-3.7-flash는 오늘 측정 불가 (할당량 소진)** — 같은 프로젝트의 다른 API 키로 바꿔도, 케이스 사이 15~40초 딜레이(`--delay` 옵션 신규 추가)를 줘도 9케이스 중 매번 대부분이 `429 RESOURCE_EXHAUSTED`로 실패했다. 에러 메시지가 명시한 quotaId는 `GenerateRequestsPerDayPerProjectPerModel-FreeTier`(한도 20/일) — RPM이 아니라 **일일 할당량이 Google Cloud 프로젝트 단위로 API 키와 무관하게 공유**되는 것으로 보이고, 여러 차례 재시도로 이미 소진됨. 4번의 조각난 시도를 합치면 9개 중 7개(weekly-hours·daily-max·multi-rule·closing-gap·clean-no-violation·unverifiable-rule·tenure-relative-comparison)는 최소 1회 성공(전부 PASS), sunday-forbidden·morning-min-staff 2개는 한 번도 성공 못함 — 표본이 동일 조건이 아니라 위 비교표에는 넣지 않는다. 할당량 리셋 후(`--model gemini-3.7-flash`, delay 불필요할 수도 있음) 깨끗한 9/9 재측정 필요.

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
