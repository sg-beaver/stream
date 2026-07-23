# 근무 시간표 생성 모듈 (scheduler)

학생별 근무 가능/희망 시간과 부서 정책을 입력받아, Hard/Soft Constraint를
만족하는 근무 시간표를 자동 생성하는 모듈입니다. STREAM 설계 원칙에 따라
**AI Layer와 분리된 독립 모듈**이며, Google OR-Tools **CP-SAT** 솔버를
사용합니다.

## 실행 방법 (프로토타입)

```bash
cd backend
.venv/bin/pip install -r requirements.txt   # ortools 포함
.venv/bin/python -m app.scheduler.prototype
```

더미 데이터(정보서비스팀 정책 + 학생 8명, 2026-06-01~06-14 2주)로
시간표를 생성해 콘솔에 출력합니다.

## 폴더 구조

```
scheduler/
├── domain/          도메인 모델
│   ├── enums.py       재원(교비/국가), 기간(학기/방학), 요일
│   ├── timegrid.py    날짜 × 30분 슬롯 그리드
│   ├── student.py     근로학생 (가능/희망 시간, 수업 시간표, 개인 편의 옵션)
│   ├── policy.py      부서 정책 (인원, 시간 상한, 개관 시간, 가중치)
│   ├── calendar.py    학사 캘린더 + 날짜별 개관 시간 결정
│   └── result.py      배정 결과, 인원 부족 리포트
├── config/          기준값 JSON (하드코딩 금지 — 추후 DB 이관 대상)
│   ├── departments/library_info_service.json   MVP 부서 정책
│   ├── academic_calendar_2026.json             학사일정·공휴일·폐관일
│   └── sample/students_sample.json             프로토타입 더미 데이터
├── constraints/     제약조건 (클래스 하나 = 제약 하나)
│   ├── base.py        Constraint ABC, ModelContext
│   ├── hard.py        인원 상하한, 주/월/2주 시간 상한
│   └── soft.py        선호 인원, 희망시간, 연속근무, 식사, 아침, 시험, 회피
├── engine/solver.py CP-SAT 모델 구축·풀이
├── service.py       API 어댑터 — 라우터(routers/schedule.py)와 솔버 연결
├── tools/import_xlsx.py  운영 엑셀 → date_schedule JSON 추출
├── reporting.py     시간표·근무 시간 집계 콘솔 출력
├── reporting_html.py 주차별 그리드 HTML 리포트 (배정 근거·학생별 뷰 포함)
└── prototype.py     실행 진입점 (--html 플래그로 HTML 리포트 생성)
```

실데이터 사용: 운영 워크북 엑셀을 받아 아래로 추출한다 (추출 결과는 개인정보라
gitignore 처리되어 있음 — 공개 레포에 커밋 금지).

```bash
.venv/bin/python -m app.scheduler.tools.import_xlsx "<엑셀 경로>"
.venv/bin/python -m app.scheduler.prototype --sample students_2026_1 \
    --time-limit 300 --html output/schedule_2026_1.html
```

## 설계 노트

- **가능/수업/개관 시간 제약은 변수 도메인에 인코딩**: `Student.can_work()`가
  False인 슬롯에는 배정 변수 자체를 만들지 않으므로 위반이 불가능합니다.
  공휴일(수업 무관 근무 가능), 교내 휴강일(교비만 가능, 국가는 근로 불가)
  예외도 여기서 처리합니다.
- **최소 인원은 기본적으로 '페널티로 완화'**: 학생들의 가능 시간만으로 최소
  인원을 못 채우는 경우 '해 없음'으로 끝내지 않고, 큰 페널티를 물리면서
  **어느 슬롯이 몇 명 부족한지** 리포트합니다
  (`staffing.allow_understaffing_with_penalty`).
- **Soft Constraint 가중치는 부서 정책 JSON의 `soft_weights`**에서 조정합니다.
  0으로 두면 해당 제약이 비활성화됩니다. 추후 담당자가 자연어로 입력한
  제약을 LLM이 이 스키마로 정제하는 확장을 염두에 둔 구조입니다.
- **시나리오 비교**: 가중치 프리셋을 바꿔 `ScheduleSolver`를 여러 번 실행하면
  배정 시나리오를 비교할 수 있습니다 (추후 API로 노출 예정).

## 알려진 한계 (1차 구현)

- 월별 시간 상한은 스케줄링 기간 내 날짜만 집계 (기간 외 기근무 이월 미반영)
- 공휴일/학사일정은 2026년 예시값 — 한국천문연구원 특일 정보 OpenAPI 연동 예정
- 방학 중 식사 시간 보장은 '점심 시간대 미확보' 근사로 구현 (임의 위치 1시간
  공백 보장은 후속 작업)
- 통학 고려는 '등교일 아닌 날 배정 회피'만 반영 (긴 블록 유도는 연속 근무
  선호 제약이 간접 담당)
