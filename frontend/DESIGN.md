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

### 폰트 변수
| 변수 | 폰트 스택 | 사용처 |
|---|---|---|
| `--font-sans` | Nanum Gothic → 맑은 고딕 → KoPubWorld Dotum | 본문 전체 기본값 |
| `--font-saint` | Sogang → Nanum Gothic | SAINT 탭, 로그인 제목, STREAM 로고 |
| `--font-brand` | Freesentation → KoPubWorld Dotum | 브랜드 강조 텍스트 |

### 폰트 크기 & 굵기
| 변수 | 값 | 사용 예 |
|---|---|---|
| `--fs-h2` | 21px | 페이지 제목 (h1 태그) |
| `--fs-body` | 14px | 카드 내용, 폼 레이블 |
| `--fs-sm` | 13px | 보조 텍스트, 메뉴 항목 |
| `--fs-caption` | 12px | 날짜, 메타 정보 |
| `--fw-bold` | 700 | 섹션 제목 |
| `--fw-semibold` | 600 | 버튼, 레이블 |

**기본 body 설정:** `font-size: 12px; letter-spacing: -0.2px; color: #333333`

---

## 4. 공통 컴포넌트

### PageTitle — 페이지 상단 타이틀 박스
SAINT 스타일 좌측 강조 테두리 박스. 모든 페이지 최상단에 사용.
```jsx
import PageTitle from '../components/ui/PageTitle'
<PageTitle>교내 근로 모집 공고</PageTitle>
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
