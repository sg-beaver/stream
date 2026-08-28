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

## 2026-08-28 — '매주 반복' 격자가 오늘 기준 개관 시간을 그려, 방학에 낸 다음 학기 시간표가 저장에서 깎이던 문제

- **문제/가설**: 학생 화면(가능 시간 제출 → 매주 반복)에서 학기를 **가을학기로 바꿔도** 격자가 방학 모양(09:00~20:00)으로 그려졌다. `AvailabilityPanel`이 `periodOfDate(policy, new Date())`로 **오늘이 속한 기간**을 쓰기 때문이며, 그렇다면 격자 밖으로 밀린 학기 중 시간(08~09시·18~22시)은 저장 시 payload에서 통째로 빠질 것으로 봤다.
- **테스트 조건**: 시드 재주입 후 조수현(20220912)으로 로그인, `/schedule` → 가능 시간 제출 → 학기 선택기를 2026 가을학기로. 오늘은 2026-08-28(여름방학). 정책은 `GET /api/schedule/policy/me` 실제 응답(로욜라도서관 정보서비스팀: 학기 평일 08:00~22:00 / 방학 평일 09:00~20:00)을 그대로 사용.
- **Before**: 가을학기를 골라도 월요일 격자가 **09:00~20:00**(방학 블록)로 그려졌다. DB에는 가을학기 가능시간이 정상적으로 있었고(`GET /api/availability/me?term=2026-2` 30분 슬롯 85개), 그중 08:00~09:00·18:00~22:00 구간이 격자에 없어 화면에서 사라졌다. 그 상태로 저장하면 보이는 슬롯만 남기고 교체된다(`PUT /api/availability/me`는 그 학기를 통째 교체).
- **수정 내용**: `weeklyPeriod`를 오늘이 아니라 **보고 있는 학기의 시작일** 기준으로 판정하도록 바꾸고(`termStartDate`를 `utils/terms.js`에 추가), 학기를 못 찾으면 기존처럼 오늘로 떨어지게 뒀다. 학기는 통째로 학기 중이거나 통째로 방학이라 시작일 하나로 기간이 정해진다.
- **After**: 실제 정책 응답과 실제 유틸 모듈로 검증 — `2026-1 → semester(월 08:00~22:00)`, `2026-summer → vacation(09:00~20:00)`, `2026-2 → semester(08:00~22:00)`, `2026-winter → vacation(09:00~20:00)`. 학기 목록이 비면 `termStartDate`가 null을 반환해 오늘 기준으로 폴백한다. `npm run build` 통과(1.67s).

## 2026-08-28 — 시드 가능시간을 학기·방학 두 벌로 늘리자 학기 2주 생성이 OPTIMAL(0.20s) → FEASIBLE(30s 타임아웃)

- **문제/가설**: 시드 가능시간(`available_times.csv` 37행)이 학기 키 없이(NULL) 한 벌뿐이라, 학생 화면이 학기를 바꿔도 같은 값만 보이고 수업 시간표(`class_time`)는 아예 비어 있었다. 학기 중·방학을 각각 채우면 화면·근무표 생성이 실제 상황에 가깝게 돌아갈 것으로 봤다. 동시에 가능시간을 크게 늘리면 solver 탐색 공간이 넓어져 solve time이 늘어날 것으로 가정했다.
- **테스트 조건**: 임시 DB 2개(`stream_seedcheck_old` = develop 시드, `stream_seedcheck` = 새 시드)에 각각 `scripts/seed_mock_data.py` 주입 후, 같은 요청으로 `POST /api/schedule/generate` (department_id=2 정보서비스팀, num_days=14, time_limit 30s). 학기 중은 2026-09-07(2026-2), 방학은 2026-07-06(2026-summer) 시작. 근로 학생 9명 동일.
- **Before**: 가능시간 37행·학생당 평균 약 20시간(학기 구분 없음), 수업 시간표 0건.
  - 학기 중 2주: `OPTIMAL` / solve **0.20s** / 배정 70건 257시간 / 커버 30분 슬롯 312 / 미충원 0 / 학생별 26~39h
  - 방학 2주: `OPTIMAL` / solve **0.18s** / 배정 76건 242시간 / 커버 252 / 미충원 0 / 학생별 22~35h
- **수정 내용**: `available_times.csv`에 `term` 열을 추가하고 학기(`2026-2`)·방학(`2026-summer`) 두 벌로 재작성(180행), 학기별 수강 시간표 `class_times.csv`(39행, 방학분은 계절수업)를 새로 만들어 `seed_mock_data.py`가 `ClassTime`까지 넣도록 했다. 가능시간은 부서 정책의 근무 블록 경계에 맞추고(학생 화면이 블록 단위 체크), 같은 학생의 수업 시간과 겹치지 않게 생성했다.
- **After**: 가능시간 180행·학기 489시간/방학 439시간(학생당 각 48.9h·43.9h), 수업 38건.
  - 학기 중 2주: **`FEASIBLE` / solve 30.02s(시간 제한 도달)** / 배정 57건 269시간 / 커버 312 / 미충원 0 / 학생별 26~40h
  - 방학 2주: `OPTIMAL` / solve **4.13s** / 배정 54건 252시간 / 커버 252 / 미충원 0 / 학생별 21~46h
  - 개관 시간 커버리지(312·252 슬롯)와 미충원 0건은 그대로였고, 가정대로 solve time만 늘었다. 학기 중은 30초 제한에 걸려 최적성 증명을 못 하고 FEASIBLE로 끝난다 — 데모 체감 대기가 0.3초에서 30초로 바뀌므로, 학기 근무표 생성은 시간 제한을 올리거나 제약을 조이는 후속 검토가 필요하다.
  - 대타 후보 탐색(REQ-SUB-002) 실측: 시드 요청 4건의 후보가 각각 6·6·4·6명으로 잡혔다(블록별 가능 인원 최소 4명). 백엔드 테스트 254 passed / 13 skipped.
- **비고**: 학생 계정으로 화면을 눈으로 확인하다가 처음 만든 시드에서 **조수현의 계절수업(월수금 09-11)이 본인 시드 근무(월 09-12)·대타 수락 근무(화 09-12)와 겹치는 것**을 발견했다. 근무표 화면에서는 근무 칸이 수업 칸을 덮어 가려져 표만 봐서는 드러나지 않았다. 계절수업을 수·금으로 옮기고, "시드 근무와 그 학생의 수업이 겹치면 실패"하는 검증을 학기·방학 양쪽으로 추가했다.

## 2026-08-27 — 좌측 바 DS 전환 · 본문 글자 크기 상향 (#115)

- **문제/가설**: "글씨가 전반적으로 작다"는 사용 피드백. 감각이 아니라 수치로 확인하려고 `frontend/src/**/*.jsx`의 `fontSize` 원시 숫자 분포를 집계했다. 좌측 바는 uiux 디자인과 다른 형태라는 지적도 함께 받았다.
- **테스트 조건**: 원시 `fontSize` 값 분포 집계 + `tokens.css`의 body 기본값 확인. 렌더 검증은 dev 서버 1440×900에서 학생 6탭·관리자 6탭을 순회하며 ① 가로 넘침(`document`/`main`의 `scrollWidth > clientWidth`) ② 글자 잘림(자식 없는 요소의 `scrollWidth/Height > clientWidth/Height`)을 계측.
- **Before**: 원시 `fontSize` 471곳 중 **12px 132곳·13px 189곳 — 68%가 12~13px**였고, `body` 기본값도 12px였다. DS 본문 규격은 `--fs-body` 14px이라 실제로 한 단계 작게 쓰이고 있었다. 좌측 바는 Shell·AdminShell에 **70줄씩 중복**된 채 12px 메뉴·`■` 문자 불릿으로 DS SidebarNav와 달랐다.
- **수정 내용**: ① 원시 값을 DS 타입 스케일 토큰으로 매핑하며 작은 쪽을 한 단계 올렸다(8~10→micro 11, 11→caption 12, 12→sm 13, 13~14→body 14, 15~16→title 16, 17~18→h3 18, 19~22→h2 21, 26→h1 26). `body` 기본값도 12px→`--fs-body`. ② DS 규격 공용 `SidebarNav`를 만들어 Shell·AdminShell 중복을 제거(232px 폭, `--surface-page` 레일 + 흰 패널, 7×7 사각 불릿, 14px 항목, `--fs-h3` 제목).
- **After**: 원시 `fontSize` **471 → 1곳**(밀도 제약이 있는 TimeGrid 범례 8px만 유지), DS 스케일 토큰 496곳 사용. 분포가 12~13px 중심에서 **13~14px 중심(sm 153·body 239)**으로 이동. 학생 6탭·관리자 6탭 전수 순회에서 **가로 넘침 0건, 글자 잘림 0건** — 30분 그리드(행 높이 18px)와 SAINT 상단 탭도 깨지지 않았다. 좌측 바 렌더 실측: 폭 232px, 배경 `rgb(245,246,248)`(`--surface-page`), 항목 14px, 활성 `--fw-bold`/`--sogang-red`/배경 `rgb(251,234,234)`(`--sogang-red-50`). `npm run build` 통과.
- **비고**: DS 원본 `SidebarNav`는 항목에 `background: "transparent"`를 인라인으로 박아 두는데, 그러면 `.stream-navitem[data-active]`의 배경 규칙이 인라인에 밀려 **활성 메뉴 하이라이트가 아예 표시되지 않는다.** 실측에서 활성 항목 배경이 `rgba(0,0,0,0)`으로 나와 발견했고, 인라인을 걷어내고 기본 배경까지 CSS 쪽으로 옮겨 해결했다.

## 2026-08-27 — 근무 시간표 달력 팝오버가 잘리던 문제 — 카드의 overflow:hidden 탈출

- **문제/가설**: 학생 근무 시간표에서 "확정된 근무가 없는 주"에 달력 버튼을 누르면 달력 대부분이 안 보인다는 제보. 근무가 있는 주에서는 멀쩡했다. 근무 유무에 따라 달라지는 건 **카드 높이**뿐이므로, 팝오버가 카드에 걸린 `overflow: hidden`에 잘리는 것으로 가정했다.
- **테스트 조건**: dev 서버, 근로 학생(20220042 김현서)으로 `/schedule` 진입 → 근무 없는 주까지 "다음 주" 이동 → 달력 열고, 팝오버와 `overflow: hidden` 조상의 `getBoundingClientRect()`를 비교. 뷰포트 1280×800·1280×480 두 조건.
- **Before**: 팝오버 높이 409px, 클리핑 카드 높이 183px(bottom 410) → **280px(약 68%)이 잘림**. 가정대로 `SchedulePage.jsx`의 카드(`overflow: hidden`, 둥근 모서리용)가 원인. 근무가 있는 주는 카드가 길어서 우연히 안 잘렸을 뿐이었다.
- **수정 내용**: `WeekCalendarButton`의 팝오버를 `createPortal`로 `document.body`에 띄우고 버튼 좌표 기준 `position: fixed`로 배치. 아래 공간이 부족하면 위로 뒤집고, 양쪽 다 부족하면 그 쪽 여유만큼만 잘라 내부 스크롤로 넘긴다. top을 뷰포트 안으로 최종 클램프. 포털은 카드와 같이 움직이지 않으므로 scroll·resize에 재배치를 걸고, 바깥 클릭 판정에 팝오버 ref를 추가했다(포털이 버튼 DOM 밖에 있어 기존 판정으로는 열자마자 닫힌다). Escape 닫기도 추가.
- **After**: 1280×800에서 근무 있는 주·없는 주 모두 팝오버 자연높이(459/407px)가 **잘림 없이 전부 표시**, 뷰포트 안, 중앙 지점 클릭 가능. 1280×480에서는 위로 뒤집혀(top 8, bottom 237) 뷰포트 안에 들어가고 내부 스크롤로 나머지 접근. 주 선택(9/07 → 9/21), 바깥 클릭·Escape 닫기 정상. 관리자 근로 시간표의 같은 버튼도 동일 확인. `npm run build` 통과.
- **비고**: 첫 수정에서는 첫 배치 때 팝오버 높이를 못 재 뒤집기 판정이 항상 실패했고, `maxHeight`에 걸어 둔 최소값 160px이 뷰포트를 넘길 수 있었다. 실측에서 관리자 화면이 뷰포트를 벗어나는 걸 보고 "가용 공간 기준 배치 + top 클램프 + 다음 프레임 재배치"로 다시 잡았다.

## 2026-08-27 — 디자인 시스템 컴포넌트 적용 2차 — 모달·빈 상태·오류 배너까지 전수 검증 (#115)

- **문제/가설**: 1차 감사는 "화면에 렌더된 요소"만 계측해서 **평상시 안 보이는 상태를 놓쳤다**. 모달·툴팁·빈 목록·오류 배너는 조건이 맞아야 나타나므로, 순회 계측만으로는 검증됐다고 말할 수 없다고 판단했다.
- **테스트 조건**: dev 서버에서 브라우저 스크립트로 숨은 상태를 **강제로 띄워** 계측했다. ① 매칭 없는 검색어를 입력해 빈 상태 ② `window.fetch`를 가로채 공고 API만 실패시켜 오류 배너 ③ 모달(신규 공고 등록·이전 공고 불러오기·대타 상세보기·검토/승인)과 DatePicker 팝오버를 클릭으로 열고 ④ 부서 설정의 ⓘ 툴팁 3개를 hover. 각 상태에서 미해석 `var(--*)`·잔존 hex·DS 미적용 필드를 셌다.
- **Before**: 오류 배너가 `danger-50 + danger-100` 조합으로 4개 화면에 복붙돼 있었고(공고 목록·지원 내역·관심 공고·지원 상세), 빈 상태 카드도 화면마다 폰트 크기가 15/16px로 제각각이었다. 탭 바는 `role="tablist"`·`aria-selected` 없이 `<button>` 나열이라 스크린리더가 탭으로 인식하지 못했다.
- **수정 내용**: DS 규격대로 `Alert`·`EmptyState`·`Card`·`Tabs`·`Checkbox`·`Radio` 6종을 추가하고 위 중복을 교체했다. `Tabs`에는 `role="tablist"`/`role="tab"`/`aria-selected`를, `Checkbox`/`Radio`에는 `useId` 기반 `label` 연결을 넣었다. `.stream-tab`·`.stream-control` 상태 규칙을 `tokens.css`에 추가.
- **After**: 숨은 상태 포함 전수 검증에서 **미해석 토큰 0건, 잔존 hex 0건, DS 미적용 필드 0건**. 렌더 실측 — Alert 배경 `rgb(251,234,234)`(`--danger-50`)·좌측 획 `3px rgb(176,17,22)`(`--danger`)·radius 3px(`--radius-sm`), EmptyState 제목 16px/700/`rgb(22,24,28)`(`--fs-title`·`--fw-bold`·`--text-strong`), Tabs 활성 600/`rgb(176,17,22)` vs 비활성 500/`rgb(118,124,137)`(`--text-muted`). `npm run build` 통과.
- **비고**: inline style 총량은 1,055 → 1,056으로 사실상 변화 없다. DS 컴포넌트 자체가 inline style 방식이라 페이지에서 줄어든 만큼 컴포넌트로 옮겨간 것이라, 이 수치는 이번 작업의 성과 지표가 아니다. 실제 성과는 중복 정의 제거와 규격 일치 쪽이다.

## 2026-08-27 — UI/UX 디자인 시스템 반영 감사 — 하드코딩 색상 244개 제거 (#115)

- **문제/가설**: `uiux/` 디자인 시스템이 "모든 탭에 반영"됐는지 확인하려 했다. 가설은 "토큰이 안 맞을 것"이었으나, 실제 원인은 다른 데 있을 것으로도 의심했다.
- **테스트 조건**: `uiux/tokens/*.css`와 `frontend/src/styles/tokens.css`의 `--토큰: 값` 쌍을 파싱해 대조. 화면 쪽은 `frontend/src/**/*.jsx`에서 하드코딩 hex·raw px·inline style 수를 계수. 렌더 검증은 dev 서버(5173)에서 학생 6탭·관리자 7탭을 순회하며 `[style]` 속성의 미해석 `var(--*)`와 잔존 hex를 브라우저에서 직접 계측.
- **Before**: 토큰 정의는 **125개 중 124개 일치**(`--shadow-focus` 1개만 누락, `--font-sans`/`--font-kr`은 한글 우선순위 조정으로 의도적 차이) — 즉 토큰 레이어는 이미 맞아 있었다. 문제는 화면이 그 토큰을 **안 쓰는 것**: 하드코딩 hex **244개**(Tailwind 계열 `#1F2937`·`#4B5563`·`#6B7280` 등 DS에 없는 회색이 다수), inline style 1,079개, raw px 791개. 필드 스타일 상수는 `inputStyle`/`selectStyle`/`cellInput`/`numberInputStyle` 등으로 **12곳에 중복 정의**(높이 30·32·34·36·38 제각각).
- **수정 내용**: ① 드리프트 hex를 DS 토큰으로 치환(속성명 기준으로 흰색을 `--surface-card`/`--text-on-brand`로 분기). ② SAINT 포털 크롬 재현값은 DS neutral로 바꾸지 않고 값 보존 토큰(`--saint-border` 등 9개) 신설. ③ 로그인·SAINT 홈 2개 화면은 외부 포털 픽셀 재현이라 예외 처리하고 파일 상단에 근거 주석. ④ DS 규격의 `Input`/`Select`/`Textarea` 공용 컴포넌트 신설 후 9개 파일의 중복 필드 스타일을 이것으로 교체(#75 범위 흡수).
- **After**: STREAM 화면 하드코딩 hex **244 → 0개**(SAINT 재현 2종 87개는 의도적 예외), inline style 1,079 → 1,055, raw px 791 → 743. 학생 6탭·관리자 6탭 전수 순회에서 **미해석 토큰 0건, 잔존 hex 0건, DS 미적용 필드 0건**. 렌더 값 실측: input 높이 38px, font-size 14px(`--fs-body`), border `rgb(203,206,213)`(`--border-default`), radius 3px(`--radius-sm`) — DS 규격과 일치. `npm run build` 통과, 콘솔 에러 0건.
- **비고**: 작업 중 `fix-frontend-review`(#103·#105)가 force-push로 리베이스돼(커밋 9개 SHA 변경 + 신규 4개) 기존 병합을 되돌리고 새 커밋 위에 재적용했다. 충돌 3건(`MonthCalendar`·`SchedulePage`·`AdminSchedulePage`)은 상대 커밋을 기준으로 두고 토큰화를 다시 입히는 방식으로 해소.

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
