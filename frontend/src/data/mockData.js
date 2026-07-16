// 화면 구성용 정적 데이터.
// 공고/지원 데이터는 백엔드 API(src/api/client.js)에서 가져온다.

export const streamMenu = [
  { id: 'posts',       label: '교내 근로 모집 공고', icon: 'Megaphone' },
  { id: 'apply',       label: '지원서 작성',         icon: 'FilePenLine' },
  { id: 'status',      label: '내 지원 현황',         icon: 'ClipboardList' },
  { id: 'schedule',    label: '근무 시간표',           icon: 'CalendarDays' },
  { id: 'substitute',  label: '대타 요청',             icon: 'Repeat' },
  { id: 'attendance',  label: '출결 내역',             icon: 'ListChecks' },
]

// 통계 카드 템플릿 (수치는 각 페이지에서 데이터 기준으로 계산)
export const postStats = [
  { key: 'total',  label: '전체 공고',  sub: '등록된 공고',         icon: 'Files',       tone: 'neutral' },
  { key: 'open',   label: '모집중',     sub: '지원 가능한 공고',    icon: 'Megaphone',   tone: 'success' },
  { key: 'soon',   label: '마감임박',   sub: '3일 이내 마감',       icon: 'Clock',       tone: 'warning' },
  { key: 'done',   label: '지원완료',   sub: '내가 지원한 공고',    icon: 'CircleCheck', tone: 'info' },
]

export const myAppStats = [
  { key: 'all',       label: '전체',      sub: '내가 지원한 공고',     icon: 'Files',       tone: 'neutral' },
  { key: 'submitted', label: '제출완료',  sub: '제출이 완료된 공고',   icon: 'CircleCheck', tone: 'success' },
  { key: 'screening', label: '검토중',    sub: '담당자 검토 중',       icon: 'Clock',       tone: 'warning' },
  { key: 'selected',  label: '최종 합격', sub: '최종 합격한 공고',     icon: 'Trophy',      tone: 'info' },
]

export const timeRows = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
]

export const dayCols = ['월', '화', '수', '목', '금']
