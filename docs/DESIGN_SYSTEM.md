# 디자인 시스템

**색·타이포·간격을 어디서 정하고, 화면이 그것을 어떻게 쓰는가**를 적습니다.
`frontend/src/styles/tokens.css`(269줄)와 `frontend/src/components/` 기준.
마지막 갱신: 2026-09-01.

---

## 1. 전제 — SAINT 안에 들어가는 화면이다

STREAM은 독립 사이트가 아니라 **서강대 학사포털 SAINT 안의 한 메뉴**로 보이는 것을
목표로 합니다. 그래서 디자인 시스템이 두 층으로 갈립니다.

| 층 | 목적 | 토큰 접두사 |
|---|---|---|
| **SAINT 크롬 재현** | 헤더·좌측 내비·페이지 배경이 실제 포털과 같아 보이게 | `--saint-*` (26개) |
| **STREAM 디자인 시스템** | 그 안쪽 콘텐츠를 일관되게 | `--neutral-*`·`--surface-*`·`--text-*` 등 |

**재현값은 STREAM 토큰으로 치환하지 않습니다.** `tokens.css`에 그 원칙이 주석으로 박혀
있습니다 — *"실제 포털에서 추출, DS neutral로 치환하지 않는다"*. 포털이 쓰는 `#C8C8C8`을
디자인 시스템의 회색으로 바꾸면 이음매가 드러나기 때문입니다.

브랜드 색도 둘입니다 — `--sogang-red: #B01116`(STREAM)과 `--saint-red: #B60005`(포털 실제값).
비슷하지만 같지 않아 따로 둡니다.

---

## 2. 토큰

`:root`에 **145개**, 15개 그룹입니다. 화면 코드는 하드코딩된 색·크기를 쓰지 않고 이 변수를
참조합니다.

| 그룹 | 개수 | 내용 |
|---|---|---|
| Brand | 8 | 서강 레드 스케일 + 실버·잉크 |
| SAINT 실제 사이트 값 | 7 | 헤더·탑바·사이드바·페이지 배경 |
| SAINT ERP palette | 10 | 표·행 선택·읽기전용 등 ERP 화면 톤 |
| SAINT 크롬 재현값 | 9 | 테두리·호버·내비 활성 |
| Neutral | 12 | 무채색 스케일 |
| Semantic | 12 | 성공·경고·오류·정보 |
| Surfaces | 8 | 카드·패널 배경 |
| Text | 8 | 본문·보조·역상 |
| Borders | 4 | |
| Actions | 4 | |
| **Typography** | **29** | 폰트 6 · 굵기 6 · 크기 9 · 행간 4 · 자간 4 |
| Spacing | 17 | 4px 배수 스케일 13 + 레이아웃 4 |
| Radius | 6 | 2\~8px + pill |
| Elevation | 6 | 그림자 5 + 포커스 링 |
| Motion | 5 | 이징 2 + 지속 3 |

### 타이포그래피

웹폰트 4종을 `@font-face`로 직접 싣습니다 — **Sogang**(학교 지정 서체, 제목), **Freesentation**
(6웨이트), **Nanum Gothic**, **KoPubWorld Dotum**. 전부 `font-display: swap`이라 폰트가 늦어도
글자가 먼저 보입니다.

역할별 폰트 스택을 나눠 뒀습니다 — `--font-display`(제목) · `--font-sans`(본문) ·
`--font-saint`(포털 크롬) · `--font-brand` · `--font-kr` · `--font-mono`. 모든 스택이
`맑은 고딕`·`arial` 같은 시스템 폰트로 끝나 웹폰트 실패 시에도 한글이 깨지지 않습니다.

크기는 `--fs-display`(34px)부터 `--fs-micro`(11px)까지 9단계, 본문은 14px입니다.

### 간격 · 반경 · 그림자

간격은 2·4·8·12·16·20·24·32·40·48·64·80px의 13단계로, 4px 배수 그리드를 따릅니다.
레이아웃 상수(헤더 56px · 사이드바 244px · 본문 최대 1200px · 거터 24px)도 토큰입니다.

반경은 2\~8px로 좁게 잡았습니다 — ERP 화면 톤이라 둥글기를 크게 주지 않습니다.

---

## 3. 컴포넌트

| 계층 | 위치 | 개수 | 예 |
|---|---|---|---|
| 공용 UI | `components/ui/` | 23 | `Button` · `Input` · `Select` · `Checkbox` · `Radio` · `Textarea` · `Card` · `Tabs` · `Alert` · `StatusPill` · `Stepper` · `EmptyState` · `PageTitle` · `StatCard` |
| 날짜·시간 | `components/ui/` | 4 | `TimeGrid` · `MonthCalendar` · `DatePicker` · `WeekCalendarButton` |
| 레이아웃 | `components/layout/` | 4 | `Shell` · `AdminShell` · `SaintHeader` · `SidebarNav` |
| 학생 도메인 | `components/student/` | 1 | `AvailabilityPanel` (가능시간·수업시간 제출) |
| 관리자 도메인 | `components/admin/` | 9 | `ScheduleChatPanel` · `DepartmentPolicyEditor` · `DepartmentAvailability` · `StudentWorkTimetable` · `ClarificationRequests` · `AdminPanel` · `ListEditor` · `aiFindings` · `scheduleBits` |

**`TimeGrid`가 이 시스템의 중심 컴포넌트입니다.** 가능시간 제출·수합 조회·근무표 편성·
주차별 시간표가 모두 같은 격자를 씁니다. 격자 계산은 JSX 없는 순수 함수(`utils/scheduleGrid.js`)로
빼서 두 화면이 어긋나지 않게 합니다 ([ARCHITECTURE.md](ARCHITECTURE.md) 2절).

---

## 4. 상태 · 접근성

`tokens.css`가 토큰뿐 아니라 **상태 규칙**도 담습니다 — 포커스 링, disabled, 탭, 체크박스·
라디오, 스크롤바 숨김(포털 헤더 탭용), 로딩 표시.

두 가지는 한국어 화면이라 특별히 넣었습니다.

- **`word-break: keep-all`** — 한국어가 "수업 시간 입/력"처럼 낱말 중간에서 꺾이지 않고
  어절 단위로만 줄바꿈되게 합니다.
- **`prefers-reduced-motion`** — 모션을 줄이도록 설정한 사용자에게는 움직임 없이 같은 정보를
  줍니다. 근무표 생성처럼 수 초\~30초 걸리는 작업의 대기 표시가 특히 해당합니다.

---

## 알려진 한계

- **다크 모드가 없습니다.** SAINT 포털이 라이트 전용이라 재현 대상에도 다크가 없습니다.
- **반응형이 넓지 않습니다.** `html, body { overflow: hidden }`에 사이드바 244px 고정,
  본문 최대 1200px 전제라 데스크톱 화면을 기준으로 짜여 있습니다. 모바일은 대상이 아닙니다.
- **컴포넌트 문서(스토리북 등)가 없습니다.** 23개 UI 컴포넌트의 props는 코드를 읽어야 압니다.
- **토큰을 우회하는 인라인 스타일이 남아 있습니다.** 레이아웃 셸이 대표적으로,
  `style={{ ... }}`에 값을 직접 적되 색·폰트는 `var(--...)`로 참조하는 절충 형태입니다.
