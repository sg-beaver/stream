# 근무표 편성 알고리즘 리서치

교대 근무 편성 문제는 조합 최적화 분야에서 **간호사 근무표 문제(Nurse Rostering Problem, NRP)** 또는 **직원 근무표 편성 문제(Employee Shift Scheduling)** 로 잘 알려져 있으며, `docs/SCHEDULER_SPEC.md` 1.1절에서도 STREAM의 문제를 이와 동일하게 정의하고 있다. 이번 조사에서 확인한 알고리즘 계열을 정리한다.

## 1. 문제 정의 관점 정리

- NRP는 일반적으로 **NP-hard** 문제로 분류된다 (DBpia 자료 확인).
- 핵심은 두 층위의 제약을 동시에 다루는 것:
  - **Hard Constraint**: 반드시 만족해야 함 (예: 최소 휴식시간, 법정 근로시간 상한).
  - **Soft Constraint**: 위반량×가중치 합을 최소화 (예: 선호 근무 반영, 공정한 분배).
- 이 구조는 STREAM `SCHEDULER_SPEC.md`의 정의와 동일하다.

## 2. 알고리즘 계열별 정리

### 2.1 정수계획법(ILP) / 제약 프로그래밍(CP) — 업계·학계 주류

- **대표 도구**: Google OR-Tools **CP-SAT** solver.
- **원리**: 결정 변수(`x[nurse, day, shift] ∈ {0,1}`)에 대해 Hard Constraint를 선형/논리 제약으로, Soft Constraint를 가중 목적함수로 인코딩 후 솔버가 최적해(또는 실행 가능해)를 탐색.
- **강점**: 해가 존재하면 **Hard Constraint 충족을 수학적으로 보장**. 실무에서 "이 근무표는 법적/병동 규정을 절대 어기지 않는다"는 신뢰가 필수적인 도메인(병원, 노동법 준수)에 적합.
- **약점**: 문제 규모(변수·제약 수)가 커지면 풀이 시간이 증가할 수 있으나, 부서 단위(수십 명 × 1~2주 × 슬롯) 규모에서는 수 초~수십 초 내 실용적.
- **실제 적용 사례**:
  - Google 공식 OR-Tools 문서의 [Employee Scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling) 예제가 정확히 이 유형.
  - SolverMax, Medium 등 다수의 실전 튜토리얼이 CP-SAT로 Nurse Rostering을 구현.
  - 일본 논문 *"A Two-Stage Scheduling Method for Nurse Scheduling and Its Practical Application"* (Nakashima, Furuike, Inoue, [arXiv:2507.05182](https://arxiv.org/abs/2507.05182))도 정수계획법 솔버 기반.
- **STREAM 연관성**: `docs/SCHEDULER_SPEC.md` 1.2절에서 이미 CP-SAT를 채택 근거와 함께 명시 — 이번 리서치 결과, 이 선택은 업계·학계 표준과 정확히 부합한다.

### 2.2 유전 알고리즘(GA) / 시뮬레이티드 어닐링(SA) / 메미틱 알고리즘 — 메타휴리스틱

- 국내 논문(DBpia, KCI)에서 다수 확인됨. "간호사 니즈형 근무 편성 자동화 시스템을 위한 간호사 스케줄링 최적화 모델 연구"(한국컴퓨터정보학회논문지) 등.
- **원리**: 후보 근무표 집단을 돌연변이·교차 연산으로 진화시켜 목적함수(제약 위반 최소화)를 개선.
- **강점**: 문제 구조에 대한 가정이 적어 구현이 유연하고, 매우 큰 탐색 공간에서도 "적당히 좋은 해"를 빠르게 찾을 수 있음.
- **약점**: `docs/SCHEDULER_SPEC.md`가 이미 지적한 대로 **Hard Constraint 충족을 보장하지 못함** — "제약 만족이 필수"인 STREAM 요구사항과 정면으로 충돌. 병원 도메인 논문에서도 CP-SAT/ILP 대비 열위로 평가되는 경우가 많다.
- **STREAM 연관성**: 채택 배제 근거가 이미 스펙 문서에 명시되어 있으며, 이번 조사는 그 판단이 타당함을 재확인시켜준다.

### 2.3 직접 구현 휴리스틱 (그래프 탐색·분할정복·비트마스킹 등)

- 국내 오픈소스 [DutyForNurses](https://github.com/alexuhn/DutyForNurses)가 대표 사례. "다익스트라 알고리즘 기반 + 스택 + 분할정복 + 비트마스킹" 조합으로 근무표를 생성.
- **강점**: 매우 빠름(사례: 18명 규모 평균 7ms). 솔버 의존성 없이 자체 구현 가능.
- **약점**: 범용 최적화 솔버가 아니므로 제약 인코딩이 코드에 하드코딩되기 쉽고, 제약 종류가 늘어날수록 유지보수 비용이 커짐. Hard Constraint 보장 여부가 알고리즘 설계자의 구현 정확성에 전적으로 의존.
- **STREAM 연관성**: STREAM처럼 제약조건이 계속 늘어나는(개인 편의 옵션, 부서별 정책 등) 도메인에서는 선언적으로 제약을 추가할 수 있는 CP-SAT가 장기적으로 더 안전하다.

### 2.4 강화학습(RL) + 그래프 신경망(GNN) — 최신 연구 흐름

- Fraunhofer IKS의 병원 인력배치 RL 에이전트 사례([기사](https://safe-intelligence.fraunhofer.de/en/articles/reinforcement-learning-shift-planning-agent-for-hospital-staffing)): GNN과 심층 RL을 결합해 에이전트가 여러 스케줄링 설정을 반복 탐색하며 개선.
- **강점**: 결근·수요 변화 등 **동적 환경에 실시간 재적응**이 가능하고, 선형계획법 대비 고차원 입력에 대한 확장성이 우수하다고 주장.
- **약점**: (1) 훈련 데이터 품질 의존도가 높음, (2) **설명 가능성 부족** — 왜 이 배정이 나왔는지 설명하기 어려움(병원처럼 배정 근거를 감사해야 하는 도메인에서 치명적), (3) 리워드 설계(reward shaping)가 성능을 크게 좌우해 튜닝 난이도가 높음, (4) **Hard Constraint 보장 메커니즘이 CP-SAT처럼 명확하지 않음**.
- 관련 서베이: *"Graph Neural Networks for Job Shop Scheduling Problems: A Survey"* ([arXiv:2406.14096](https://arxiv.org/abs/2406.14096)).
- **STREAM 연관성**: 학습 데이터(과거 배정 이력)가 충분히 쌓이지 않은 초기 서비스 단계, 그리고 "왜 이 학생이 이 시간에 배정됐는지" 설명 가능해야 하는 대학 행정 특성상 **현재로선 부적합**. 다만 향후 데이터가 누적되면 "CP-SAT가 만든 여러 실행가능해 중 어느 것이 실제로 선호되는지"를 학습하는 **재순위화(reranking) 보조 모델** 정도로는 검토 여지가 있다.

### 2.5 ML과 CP의 하이브리드 — 절충안

- *"Machine Learning and Constraint Programming for Efficient Healthcare Scheduling"* ([arXiv:2409.07547](https://arxiv.org/pdf/2409.07547)) — 제목상 ML로 탐색을 가속하거나 파라미터를 추정하고, 최종 해의 타당성은 CP로 보장하는 방향의 연구로 추정(이번 조사에서 PDF 바이너리 파싱 실패로 본문 상세 확인은 못함 — 후속 조사 필요).
- *"Machine Learning for Scheduling: A Paradigm Shift from Solver-Centric to Data-Centric Approaches"* ([arXiv:2512.22642](https://arxiv.org/pdf/2512.22642)) — 스케줄링 연구가 "솔버 중심"에서 "데이터 중심"으로 이동하는 흐름을 다루는 최신 논문(2025년 12월). 업계 상용 서비스(Legion 등)의 "ML 예측 + 최적화 결합" 트렌드와 같은 방향.
- **STREAM 연관성**: 장기적으로 참고할 방향이지만, 현재 STREAM 단계(제약조건 정의·CP-SAT 구현 자체가 진행 중)에서는 우선순위가 낮다.

### 2.6 2단계(Two-Stage) 스케줄링 — 실무 적용 관점의 시사점

- *A Two-Stage Scheduling Method for Nurse Scheduling and Its Practical Application* ([arXiv:2507.05182](https://arxiv.org/abs/2507.05182), Nakashima et al.): 야간/주간을 분리해 1단계는 정수계획법으로 자동 생성하고, **2단계에서 책임 간호사가 수동 조정**하는 구조를 실제 급성기·만성기 병원에 배포.
- 핵심 통찰: 간호사들의 **암묵지(tacit knowledge)** 를 제약조건으로 완전히 형식화하기 어렵다는 점이 실무 적용의 최대 난관이며, 이를 해결하기 위해 "자동 생성 → 사람이 마지막 조정"이라는 하이브리드 워크플로우를 설계함.
- **STREAM 연관성**: 이는 `docs/SCHEDULER_SPEC.md`가 이미 전제하는 "Soft Constraint로 다 표현 못하는 부분은 관리자 UI에서 조정" 구조와 정확히 일치하며, STREAM 관리자 화면 설계 시 "확정 전 셀 단위 수동 수정 가능" 기능의 근거로 인용할 수 있다.

## 3. 알고리즘 계열 비교표

| 계열 | Hard Constraint 보장 | 설명 가능성 | 구현 난이도 | 실무 채택도(조사 기준) | STREAM 적합도 |
|---|---|---|---|---|---|
| CP-SAT / ILP | O (해 존재 시 보장) | 높음 | 중간(솔버 활용) | 매우 높음 | ★★★★★ (이미 채택) |
| 유전 알고리즘/SA | X (보장 안 됨) | 중간 | 낮음~중간 | 학술 연구 위주 | ★★ |
| 직접 구현 휴리스틱 | 구현 의존적 | 낮음~중간 | 높음(직접 구현) | 소규모/오픈소스 | ★★ |
| RL + GNN | X | 낮음 | 매우 높음 | 연구/일부 대기업 파일럿 | ★ (현시점) |
| ML+CP 하이브리드 | O (CP 부분에서) | 중간 | 매우 높음 | 신흥 연구 | ★★★ (장기 검토) |

## 4. 학술 논문 목록 (수집분)

### 간호사 근무표 문제(NRP) 개론/서베이

- Cheang, B. et al. — *Nurse rostering problems: a bibliographic survey*, European Journal of Operational Research. ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0377221703000213))
- Burke, E.K. et al. — *The nurse rostering problem: A critical appraisal of the problem structure*, European Journal of Operational Research. ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0377221709003968))

### 제약 프로그래밍(CP) 기반

- *Nurse Rostering Using Constraint Programming and Meta-level Reasoning* ([Springer](https://link.springer.com/chapter/10.1007/3-540-45034-3_72))
- *Solving Nurse Rostering Problems Using Soft Global Constraints* ([Springer](https://link.springer.com/chapter/10.1007/978-3-642-04244-7_9))
- *A Hybrid Constraint Programming Approach for Nurse Rostering Problems* ([Springer](https://link.springer.com/chapter/10.1007/978-1-84882-215-3_16))
- *A Constraint-directed Local Search Approach to Nurse Rostering Problems* ([arXiv:0910.1253](https://arxiv.org/pdf/0910.1253))

### 정수계획법(ILP) 기반 / 실전 적용

- Thornton, J. — *Nurse Rostering and Integer Programming Revisited* ([PDF](https://jthornton.org/wp-content/uploads/2021/04/ICCIMA97.pdf))
- Nakashima, K., Furuike, K., Inoue, Y. — *A Two-Stage Scheduling Method for Nurse Scheduling and Its Practical Application* ([arXiv:2507.05182](https://arxiv.org/abs/2507.05182)) — 실제 병원 배포 사례 포함, STREAM에 가장 참고 가치가 높음.
- *Using OR-Tools When Solving the Nurse Scheduling Problem* ([Springer](https://link.springer.com/chapter/10.1007/978-3-031-53025-8_30), [PDF](https://repositorium.uminho.pt/bitstreams/cc5599d6-410d-499b-82f6-8c72b4cbc396/download))
- *A Greedy Double Swap Heuristic for Nurse Scheduling* ([arXiv:1205.2200](https://arxiv.org/pdf/1205.2200))

### ML/RL 최신 연구

- *Machine Learning and Constraint Programming for Efficient Healthcare Scheduling* ([arXiv:2409.07547](https://arxiv.org/pdf/2409.07547))
- *Machine Learning for Scheduling: A Paradigm Shift from Solver-Centric to Data-Centric Approaches* ([arXiv:2512.22642](https://arxiv.org/pdf/2512.22642))
- *Graph Neural Networks for Job Shop Scheduling Problems: A Survey* ([arXiv:2406.14096](https://arxiv.org/abs/2406.14096))
- *Enhancing Genetic Algorithms with Graph Neural Networks: A Timetabling Case Study* ([arXiv:2602.08619](https://arxiv.org/pdf/2602.08619))

### 국내 (간호사 근무표 최적화)

- 한국컴퓨터정보학회논문지 — *간호사 니즈형 근무 편성 자동화 시스템을 위한 간호사 스케줄링 최적화 모델 연구* ([DBpia](https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE09320359))
- KCI — *효율적인 근사 알고리즘을 이용한 간호사 스케줄 문제에 대한 연구* ([KCI](https://kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002080531))
- 한국경영과학회 — *수리 모델 기반 간호사 근무표 생성 알고리즘* ([DBpia](https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE11804524))
- 보건사회연구(kihasa) — *임상간호사의 교대제 개선을 위한 예측 가능한 패턴형 근무제* ([kihasa](https://www.kihasa.re.kr/hswr/v.42/1/258/), [KCI](https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002829341)) — 알고리즘보다 "패턴형 근무제(고정 순환 패턴)" 자체의 건강·삶의질 효과를 다루는 정책 연구. STREAM의 Soft Constraint(연속 아침 근무 제한 등) 설계 근거로 참고 가능.

### 인하대병원 IH-NASS 관련 (효과 검증)

- *Shift nurses' work quality and job satisfaction after [IH-NASS implementation]* — BMC Nursing, 2025 (원문 DOI 확인 필요, [보도자료 PDF](https://www.bktimes.net/data/board_notice/1752453654-49.pdf)).

> 국내 학술 논문(DBpia/KCI)은 로그인 또는 기관 인증이 필요해 이번 조사에서는 초록 수준까지만 확인했다. 원문이 필요하면 서강대 도서관 프록시로 DBpia/RISS 접속 후 재조사 권장.

## 5. STREAM 알고리즘 방향에 대한 결론

1. **CP-SAT 유지가 타당하다.** 국내 상용 서비스, 학계 서베이, 실전 배포 논문(Two-Stage Scheduling) 모두 정수계획법/CP 계열이 Hard Constraint 보장이 필요한 도메인의 표준 해법임을 뒷받침한다.
2. **RL/GNN, GA는 현시점에 채택하지 않는 것이 맞다.** `SCHEDULER_SPEC.md`의 기존 판단(GA 배제 근거 = Hard Constraint 미보장)이 최신 리서치로도 재확인됐고, RL은 설명가능성·데이터 요구량 문제로 더욱 부적합하다.
3. **개선 여지가 있다면 "2단계 워크플로우"와 "정량 지표화" 쪽이다.**
   - Two-Stage Scheduling 논문처럼 "CP-SAT 자동 생성 → 관리자 셀 단위 수동 조정" UX가 실무 채택률을 높이는 핵심 요인으로 반복 확인됐다.
   - 듀티플래너의 "원티드 듀티 반영률", IH-NASS의 "NOE 비율"처럼 Soft Constraint 충족도를 **숫자로 노출**하는 것이 사용자 신뢰를 얻는 데 효과적이다.
4. **향후(데이터 누적 이후) 검토 가능한 확장**: CP-SAT가 만든 다수의 실행가능해 후보 중 실제로 선호되는 배정을 학습하는 경량 재순위화 모델 — 단, Hard Constraint를 침해하지 않는 후처리 단계로 한정.
