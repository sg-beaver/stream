# STREAM 프론트엔드 디자인 시스템

> 새 컴포넌트나 화면을 추가할 때 반드시 이 문서를 기준으로 맞춰주세요.  
> 토큰 값 원본: `src/styles/tokens.css`

---

## 1. 레이아웃 구조

```
┌─────────────────────────────────────────────────────┐
│  상단 유틸리티 바 (28px) — 날짜·사용자·LOGOUT       │
├─────────────────────────────────────────────────────┤
│  SAINT 헤더 (52px) — 로고 + 탭 + 알림·사용자       │
├──────────┬──────────────────────────────────────────┤
│  STREAM  │                                          │
│  사이드바 │  메인 콘텐츠 (overflowY: auto)           │
│  (200px) │  — 여기만 스크롤됨                       │
│          │                                          │
│  [AI챗봇]│                                          │
│  (하단고정│                                          │
└──────────┴──────────────────────────────────────────┘
```

- 전체 래퍼: `height: 100vh; overflow: hidden` — 페이지 전체 스크롤 없음
- 사이드바: 고정, AI 챗봇 카드는 항상 하단 노출
- 메인 콘텐츠만 독립 스크롤

**공통 레이아웃 컴포넌트:** `src/components/layout/Shell.jsx`
```jsx
<Shell activeMenu="posts">   // posts | apply | status | schedule | substitute | attendance
  {/* 페이지 내용 */}
</Shell>
```

---

## 2. 색상

### SAINT 쉘 (외부 프레임)
| 변수 | 값 | 용도 |
|---|---|---|
| `--saint-red` | `#B60005` | 활성 탭, 로그인 버튼 (실제 SAINT 측정값) |
| `--saint-header-bg` | `#FFFFFF` | 헤더 배경 |
| `--saint-topbar-bg` | `#F0F0F0` | 최상단 유틸리티 바 |
| `--saint-sidebar-bg` | `#E8EDF5` | 좌측 사이드바 배경 |
| `--saint-page-bg` | `#EEF0F6` | 전체 페이지 배경 |
| `--saint-tab-inactive` | `#333333` | 비활성 탭 글자 |

### STREAM 브랜드
| 변수 | 값 | 용도 |
|---|---|---|
| `--sogang-red` | `#B01116` | 주요 액션 버튼, 강조 요소 |
| `--sogang-red-600` | `#A6141A` | 버튼 hover |
| `--sogang-red-700` | `#8E0D12` | 버튼 active |
| `--sogang-red-50` | `#FBEAEA` | 활성 메뉴 배경, 연한 강조 |

> `--saint-red`(#B60005)는 SAINT 쉘 전용, `--sogang-red`(#B01116)는 STREAM 콘텐츠 영역 전용으로 구분해서 사용

### 시맨틱
| 변수 | 색상 | 용도 |
|---|---|---|
| `--success` | `#1F7A45` | 모집중, 선발, 완료 |
| `--warning` | `#B26A00` | 마감임박, 검토중 |
| `--danger` | `#B01116` | 미선발, 에러, 위험 |
| `--info` | `#1F5FA8` | 제출완료, 정보 |

---

## 3. 폰트

> 실제 SAINT DevTools 측정값 기반으로 확정. body: Nanum Gothic 12px #333333 -0.2px / 활성 탭: SogangFont 17px #B60005 / 페이지 제목: Arial 계열 16px normal

### 폰트 변수 — 사용 규칙 (확정)

| 변수 | 폰트 스택 | 쓰는 곳 |
|---|---|---|
| `--font-sans` | Nanum Gothic → 맑은 고딕 | **기본값.** 본문, 페이지 제목, 버튼, 입력, 메뉴, 날짜, 배지 — 거의 모든 곳 |
| `--font-saint` | Sogang → Nanum Gothic | **STREAM 브랜드 이름만.** STREAM 로고 텍스트, SAINT 헤더 활성 탭(STREAM), LOGIN 버튼 |
| `--font-brand` | Freesentation → KoPubWorld | **미사용** — tokens.css에만 예약 |

> **판단 기준**: "STREAM" 또는 "SAINT"라는 고유명사 자체를 표시하는가? → `--font-saint` / 그 외 모든 UI → `--font-sans`

### 위치별 확정값

| 위치 | 크기 | 굵기 | 폰트 | letter-spacing |
|---|---|---|---|---|
| SAINT 헤더 활성 탭 (STREAM) | `17px` | `700` | `--font-saint` | `0` |
| SAINT 헤더 비활성 탭 | `13px` | `400` | `--font-sans` | `-0.2px` |
| PageTitle 박스 (페이지 제목) | `16px` | `700` | `--font-sans` | `-0.2px` |
| 섹션/카드 제목 | `16px` | `700` | `--font-sans` | `-0.2px` |
| 사이드바 메뉴 항목 | `13px` | `500` | `--font-sans` | `-0.2px` |
| 본문 / 폼 레이블 | `14px` | `400` | `--font-sans` | `-0.2px` |
| 날짜 / 메타 / 캡션 | `12px` | `400` | `--font-sans` | `-0.2px` |
| 배지 / 상태 텍스트 | `12px` | `600` | `--font-sans` | `0` |
| 일반 버튼 | `14px` | `700` | `--font-sans` | `0` |
| LOGIN 버튼 | `15px` | `700` | `--font-saint` | `0.05em` |

**기본 body:** `font-family: --font-sans; font-size: 12px; color: #333333; letter-spacing: -0.2px`

---

## 3-1. SAINT 테이블 스타일 (SAINT DevTools 실측값 — 임의 변경 금지)

> `PostListPage`, `MyApplicationsPage` 등 SAINT 스타일 테이블이 필요한 모든 곳에 동일하게 적용.

| 대상 | 속성 | 값 |
|---|---|---|
| `<table>` | `borderCollapse` | `'collapse'` |
| `<th>` | `background` | `#dfd5c7` |
| `<th>` | `border` | `1px solid #ccbda7` |
| `<th>` | `color` | `#32363A` |
| `<th>` | `padding` | `11px 16px` |
| `<th>` | `fontSize` / `fontWeight` | `13px` / `700` |
| `<td>` | `border` | `1px solid #E5E5E5` |
| `<td>` | `color` | `#32363A` |
| `<td>` | `padding` | `13px 16px` |
| `<tr>` hover | `background` | `#FBF8EE` (`--saint-row-hover`) |
| 테이블 외곽 컨테이너 | `border` / `borderRadius` / `overflow` | `1px solid #E6E8EB` / `12px` / `hidden` |

```jsx
// 새 페이지에서 테이블 추가 시 복붙 템플릿
<div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr>
        <th style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: '#32363A', background: '#dfd5c7', border: '1px solid #ccbda7', whiteSpace: 'nowrap' }}>
          컬럼명
        </th>
      </tr>
    </thead>
    <tbody>
      {items.map(item => (
        <tr key={item.id}
          onMouseEnter={e => e.currentTarget.style.background = '#FBF8EE'}
          onMouseLeave={e => e.currentTarget.style.background = ''}
        >
          <td style={{ padding: '13px 16px', border: '1px solid #E5E5E5', color: '#32363A', fontSize: 13 }}>
            {item.value}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## 3-2. STREAM 사이드바 구조 (실제 SAINT 실측 기반)

```
aside (background: var(--saint-page-bg), 회색)
├── 상단 «» 버튼 (우측 정렬, 작은 회색 버튼)
└── 내부 흰 패널 (border: 1px solid #C8C8C8, background: #fff)
    ├── 섹션 제목 (STREAM / 교내 근로 관리 시스템) + borderBottom: 1px solid #D8D8D8
    ├── 메뉴 항목 1  ← 각 항목 래퍼에 borderBottom: 1px solid #E8E8E8
    ├── 메뉴 항목 2
    └── ...
```

- **aside 자체**: `background: var(--saint-page-bg)`, borderRight 없음
- **내부 패널**: `border: 1px solid #C8C8C8`, 4면 모두
- **활성 메뉴**: 버튼 `background: #FDF3F3`, `color: #B60005`, `fontWeight: 700`
- **비활성 메뉴**: hover 시 `background: #F5F5F5`
- **■ 불릿**: `color: #B60005`, `fontSize: 8px`
- **로고 영역**: `borderRight` 없음 (실제 SAINT에 구분선 없음)

---

## 4. 공통 컴포넌트

### PageTitle — 페이지 상단 타이틀 박스
SAINT 실측값 기반 빨간 테두리 박스 (2px all-sides, border-radius: 10px). 모든 STREAM 페이지 최상단에 사용.

```jsx
import PageTitle from '../components/ui/PageTitle'
<PageTitle>교내 근로 모집 공고</PageTitle>
// → --font-sans, 16px 700, border: 2px solid #B60005 (--saint-red), border-radius: 10px
```

### Button
```jsx
import Button from '../components/ui/Button'
<Button variant="primary" size="md">지원하기</Button>
<Button variant="secondary">취소</Button>
<Button variant="ghost">더보기</Button>
<Button variant="danger">삭제</Button>
// size: sm | md(기본) | lg
// block: 너비 100% 채움
```

### StatusPill — 상태 배지
```jsx
import StatusPill from '../components/ui/StatusPill'
<StatusPill status="open" />      // 모집중
<StatusPill status="closing" />   // 마감임박
<StatusPill status="closed" />    // 마감
<StatusPill status="submitted" /> // 제출완료
<StatusPill status="screening" /> // 서류검토
<StatusPill status="selected" />  // 선발
<StatusPill status="rejected" />  // 미선발
<StatusPill status="full" />      // 충원완료
```

### StatCard — 통계 카드
```jsx
import StatCard from '../components/ui/StatCard'
// stat 객체: { key, label, value, sub, icon(Lucide PascalCase), tone }
// tone: neutral | success | warning | info | danger
<StatCard stat={statObj} active={isActive} onClick={handleClick} />
```

### TimeGrid — 시간표 그리드
```jsx
import TimeGrid from '../components/ui/TimeGrid'
// 수업시간(빨간 배경), 가능시간(체크 표시)
<TimeGrid
  classSlots={['화-09:00', '목-10:00']}   // 선택 불가 (수업)
  availableSlots={['월-10:00', '수-14:00']} // 체크 표시
  editable={true}                            // 클릭으로 토글 가능
  onToggle={(key) => handleToggle(key)}      // editable일 때만
/>
```

---

## 5. 아이콘

**라이브러리:** `lucide-react`  
**규칙:** strokeWidth `1.75`, 크기 용도별 기준 — 본문 18px, 사이드바 16px, 캡션 14px

```jsx
import { Search, ChevronLeft, Bell } from 'lucide-react'
<Search size={16} strokeWidth={1.75} color="var(--text-muted)" />
```

---

## 6. 카드 & 컨테이너

섹션 박스 기본 패턴:
```jsx
<div style={{
  background: 'var(--neutral-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xl)',   // 8px
  padding: '24px 28px',
}}>
```

카드 hover 효과:
```jsx
onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
```

---

## 7. 라우팅 구조

| 경로 | 화면 | 명세 |
|---|---|---|
| `/login` | S-00 로그인 | ✅ |
| `/posts` | S-01 공고 목록 | ✅ |
| `/posts/:id` | S-02 공고 상세 | ✅ |
| `/apply` | S-03 지원서 작성 + S-04 모달 | ✅ |
| `/apply/complete` | S-05 지원 완료 | ✅ |
| `/applications` | S-06 내 지원 현황 | ✅ |
| `/applications/:id` | S-07 지원 상세 | ✅ |
| 근무 시간표 | — | 🔜 명세 대기 |
| 대타 요청 | — | 🔜 명세 대기 |
| 출결 내역 | — | 🔜 명세 대기 |

---

## 8. 새 화면 추가 시 체크리스트

1. `Shell`로 감싸고 `activeMenu` 올바른 값 지정
2. 페이지 최상단에 `<PageTitle>` 사용
3. 색상은 임의 hex 금지 — 반드시 CSS 변수 사용
4. 아이콘은 lucide-react만 사용, strokeWidth 1.75 고정
5. API 호출은 `src/api/` 폴더의 함수를 통해서만 (직접 fetch 금지)
6. 명세 없는 화면은 구현하지 말고 팀에 먼저 확인
