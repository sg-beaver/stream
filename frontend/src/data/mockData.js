// 화면 구성용 정적 데이터.
// 공고/지원 데이터는 백엔드 API(src/api/client.js)에서 가져온다.

export const streamMenu = [
  { id: 'posts',       label: '교내 근로 모집 공고', icon: 'Megaphone' },
  { id: 'liked',       label: '관심 공고',           icon: 'Bookmark' },
  { id: 'profile',     label: '공통 지원서',         icon: 'IdCard' },
  { id: 'status',      label: '내 지원 현황',         icon: 'ClipboardList' },
  { id: 'schedule',    label: '근무 시간표',           icon: 'CalendarDays' },
  { id: 'substitute',  label: '대타 요청',             icon: 'Repeat' },
]

// 학생팀장용 STREAM 사이드 메뉴 (#156) — 학생팀장도 근로 학생이라 학생 화면을 그대로 쓰고,
// 부서 근무표를 짜는 편성 화면 하나가 더 붙는다. 학생 메뉴의 'schedule'(내 근무 시간표)와
// 구분하려고 편성 화면은 'leadSchedule'로 둔다.
export const teamLeadMenu = [
  ...streamMenu,
  { id: 'leadSchedule', label: '근무표 편성', icon: 'CalendarCog' },
]

// 관리자(직원)용 STREAM 사이드 메뉴 — 화면 명세 도착 전까지는 uiux/ui_kits/admin 참고 (기능 구조만, 비주얼은 SAINT 톤 유지)
export const adminMenu = [
  { id: 'posts',      label: '교내 근로 모집 공고', icon: 'Megaphone' },
  { id: 'selection',  label: '학생 선발',           icon: 'UserCheck' },
  { id: 'students',   label: '학생 관리',           icon: 'Users' },
  { id: 'schedule',   label: '근무표 편성',         icon: 'CalendarCog' },
  { id: 'courses',    label: '수업 조교',           icon: 'GraduationCap' },
  { id: 'substitute', label: '대타 승인',           icon: 'Repeat' },
  { id: 'settings',   label: '부서 설정',           icon: 'Settings2' },
]

// 통계 카드 템플릿 (수치는 각 페이지에서 데이터 기준으로 계산)
export const postStats = [
  { key: 'total',  label: '전체 공고',  sub: '등록된 공고',         icon: 'Files',       tone: 'neutral' },
  { key: 'open',   label: '모집중',     sub: '지원 가능한 공고',    icon: 'Megaphone',   tone: 'success' },
  { key: 'soon',   label: '마감임박',   sub: '3일 이내 마감',       icon: 'Clock',       tone: 'warning' },
  { key: 'done',   label: '지원완료',   sub: '내가 지원한 공고',    icon: 'CircleCheck', tone: 'info' },
]

export const likedPostStats = [
  { key: 'all',    label: '관심 공고', sub: '북마크한 공고',       icon: 'Bookmark',    tone: 'neutral' },
  { key: 'open',   label: '모집중',    sub: '지금 지원 가능',      icon: 'Megaphone',   tone: 'success' },
  { key: 'soon',   label: '마감임박',  sub: '3일 이내 마감',       icon: 'Clock',       tone: 'warning' },
  { key: 'closed', label: '마감됨',    sub: '모집이 종료된 공고',   icon: 'CircleSlash2', tone: 'neutral' },
]

export const myAppStats = [
  { key: 'all',       label: '전체',      sub: '내가 지원한 공고',     icon: 'Files',       tone: 'neutral' },
  { key: 'submitted', label: '제출완료',  sub: '제출이 완료된 공고',   icon: 'CircleCheck', tone: 'success' },
  { key: 'screening', label: '검토중',    sub: '담당자 검토 중',       icon: 'Clock',       tone: 'warning' },
  { key: 'selected',  label: '최종 합격', sub: '최종 합격한 공고',     icon: 'Trophy',      tone: 'info' },
]

// 학생이 근무 가능 시간을 제출하는 시간표의 기본 범위 — 08:00~22:00 (마지막 행은 21:00~22:00).
// 지원 시점에는 배정될 부서가 정해지지 않아 부서 개관 시간을 알 수 없으므로,
// 교내 부서 중 가장 넓은 운영 시간(도서관 학기 평일 08:00~22:00)에 맞춰 고정한다.
// 담당자 화면(근무표 편성·학생 선발)은 부서 정책의 실제 개관 시간을 따로 받아 쓴다.
export const timeRows = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
]

export const dayCols = ['월', '화', '수', '목', '금', '토', '일']
