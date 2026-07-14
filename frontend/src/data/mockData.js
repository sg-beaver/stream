// docs/API_SPEC.md 응답 형식을 기준으로 한 mock 데이터.
// - 날짜는 ISO 형식으로 저장하고 화면 표기는 utils/format.js에서 변환한다.
// - 공고 status는 스펙 값("모집중"/"마감")만 사용하고, 마감임박(D-3 이내) 등
//   표시 상태는 postingUiStatus()로 계산한다.
// - "UI 전용" 주석 아래 필드는 스펙 응답에 없는 값으로, 실제 연동 시
//   백엔드 응답 확장 협의가 필요하다 (PR #15 리뷰 코멘트 참고).

export const streamMenu = [
  { id: 'posts',       label: '교내 근로 모집 공고', icon: 'Megaphone' },
  { id: 'apply',       label: '지원서 작성',         icon: 'FilePenLine' },
  { id: 'status',      label: '내 지원 현황',         icon: 'ClipboardList' },
  { id: 'schedule',    label: '근무 시간표',           icon: 'CalendarDays' },
  { id: 'substitute',  label: '대타 요청',             icon: 'Repeat' },
  { id: 'attendance',  label: '출결 내역',             icon: 'ListChecks' },
]

// GET /api/postings 응답 형식
export const posts = [
  {
    posting_id: 1,
    title: '행정 업무 보조',
    department_name: '학생지원팀',
    upload_date: '2026-07-01',
    deadline: '2026-07-25',
    status: '모집중',
    // --- UI 전용 ---
    category: '교내 부서',
    period: '2026.08.03 ~ 2026.10.30',
    hours: '10:00 ~ 13:00 (3H)',
    headcount: '2명',
    weeklyMax: '최대 15시간',
    preferred: '엑셀 활용 가능자, 문서작성 가능자',
    scheduleMatch: true,
    applied: false,
  },
  {
    posting_id: 2,
    title: '참고서비스 제공',
    department_name: '로욜라도서관 정보서비스팀',
    upload_date: '2026-06-28',
    deadline: '2026-07-20',
    status: '모집중',
    // --- UI 전용 ---
    category: '도서관',
    period: '2026.08.03 ~ 2026.11.27',
    hours: '14:00 ~ 17:00 (3H)',
    headcount: '1명',
    weeklyMax: '최대 15시간',
    preferred: '도서정리, 자료실 이용 안내',
    scheduleMatch: false,
    applied: true,
    application_id: 2,
  },
  {
    posting_id: 3,
    title: '논술 보조',
    department_name: '입학처',
    upload_date: '2026-07-05',
    deadline: '2026-07-15',
    status: '모집중',
    // --- UI 전용 ---
    category: '교내 부서',
    period: '2026.07.20 ~ 2026.08.14',
    hours: '종일 (8H)',
    headcount: '2명',
    weeklyMax: '최대 15시간',
    preferred: '꼼꼼하고 성실한 분, 유사 업무 경험자 우대',
    scheduleMatch: false,
    applied: false,
  },
  {
    posting_id: 4,
    title: '증명서·학생증 발급 보조',
    department_name: '종합봉사실 학생서비스',
    upload_date: '2026-07-03',
    deadline: '2026-07-19',
    status: '모집중',
    // --- UI 전용 ---
    category: '학과별 사무실',
    period: '2026.08.03 ~ 2026.10.30',
    hours: '09:30~12:30 / 13:00~16:00',
    headcount: '2명',
    weeklyMax: '최대 10시간',
    preferred: '민원 응대 경험, 행정 업무 보조 경험',
    scheduleMatch: true,
    applied: false,
  },
  {
    posting_id: 5,
    title: '국제교류팀 지원 근로',
    department_name: '국제교류팀',
    upload_date: '2026-06-20',
    deadline: '2026-06-30',
    status: '마감',
    // --- UI 전용 ---
    category: '교내 부서',
    period: '2026.07.06 ~ 2026.08.28',
    hours: '13:00 ~ 15:00 (2H)',
    headcount: '1명',
    weeklyMax: '최대 10시간',
    preferred: '영어 회화 가능자 우대',
    scheduleMatch: false,
    applied: true,
    application_id: 5,
  },
]

// GET /api/postings/{posting_id} 응답 형식
export const postDetails = {
  1: {
    posting_id: 1,
    department_id: 1,
    department_name: '학생지원팀',
    created_by: 'STF001',
    title: '행정 업무 보조',
    description: '민원 응대 및 학생지원팀 행정 업무 보조\n문서 정리, 자료 입력, 안내 자료 관리\n부서 내 단순 행정 업무 지원',
    qualification: '엑셀 활용 가능자 우대\n문서 작성 및 자료 정리 경험자 우대\n월/수 요일 근무 가능자 우대',
    upload_date: '2026-07-01',
    deadline: '2026-07-25',
    status: '모집중',
    // --- UI 전용 ---
    period: '2026.08.03 ~ 2026.10.30',
    headcount: '2명',
    weeklyMax: '최대 15시간',
    location: '학생지원팀 사무실',
    contactEmail: 'studentoffice@sogang.ac.kr',
    contactPhone: '02-705-8000',
    workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    applied: false,
  },
  2: {
    posting_id: 2,
    department_id: 2,
    department_name: '로욜라도서관 정보서비스팀',
    created_by: 'STF002',
    title: '참고서비스 제공',
    description: '참고서비스 제공 및 자료실 이용 안내\n도서 정리 및 서가 관리\n자료 검색 지원',
    qualification: '도서관 이용 경험자 우대\n성실하고 꼼꼼한 분',
    upload_date: '2026-06-28',
    deadline: '2026-07-20',
    status: '모집중',
    // --- UI 전용 ---
    period: '2026.08.03 ~ 2026.11.27',
    headcount: '1명',
    weeklyMax: '최대 15시간',
    location: '로욜라도서관 1층 정보서비스팀',
    contactEmail: 'library@sogang.ac.kr',
    contactPhone: '02-705-7100',
    workSlots: ['화-14:00', '화-15:00', '화-16:00', '목-14:00', '목-15:00', '목-16:00'],
    applied: true,
    application_id: 2,
  },
}

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

// GET /api/applications/me 응답 형식
// status는 스펙 값(제출완료/검토중/합격/불합격)만 사용한다
export const myApplications = [
  {
    application_id: 1,
    posting_id: 1,
    posting_title: '행정 업무 보조',
    cover_letter: '행정 업무에 관심이 많아 지원합니다.',
    status: '제출완료',
    submitted_at: '2026-07-10T15:30:00',
    // --- UI 전용 ---
    department_name: '학생지원팀',
    period: '2026.08.03 ~ 2026.10.30',
    experience: '엑셀 활용 경험이 있으며 문서 작성에 능숙합니다.',
    availableSlots: ['월-10:00', '월-11:00', '수-10:00', '수-11:00'],
    classSlots: ['화-09:00', '화-10:00', '목-09:00', '목-10:00'],
  },
  {
    application_id: 2,
    posting_id: 2,
    posting_title: '참고서비스 제공',
    cover_letter: '도서관 근로에 관심이 있어 지원합니다.',
    status: '검토중',
    submitted_at: '2026-07-08T11:20:00',
    // --- UI 전용 ---
    department_name: '로욜라도서관 정보서비스팀',
    period: '2026.08.03 ~ 2026.11.27',
    experience: '도서관 이용 경험이 많습니다.',
    availableSlots: ['화-14:00', '화-15:00', '목-14:00', '목-15:00'],
    classSlots: ['월-09:00', '월-10:00', '수-09:00', '수-10:00'],
  },
  {
    application_id: 3,
    posting_id: 3,
    posting_title: '논술 보조',
    cover_letter: '성실하게 업무를 수행할 자신이 있습니다.',
    status: '검토중',
    submitted_at: '2026-07-06T09:15:00',
    // --- UI 전용 ---
    department_name: '입학처',
    period: '2026.07.20 ~ 2026.08.14',
    experience: '유사 경험은 없지만 꼼꼼합니다.',
    availableSlots: ['금-09:00', '금-10:00', '금-11:00'],
    classSlots: ['화-13:00', '목-13:00'],
  },
  {
    application_id: 4,
    posting_id: 4,
    posting_title: '증명서·학생증 발급 보조',
    cover_letter: '민원 응대 경험을 쌓고 싶어 지원합니다.',
    status: '불합격',
    submitted_at: '2026-07-04T16:45:00',
    // --- UI 전용 ---
    department_name: '종합봉사실 학생서비스',
    period: '2026.08.03 ~ 2026.10.30',
    experience: '행정 업무 보조 경험이 있습니다.',
    availableSlots: ['월-09:00', '월-10:00', '수-09:00'],
    classSlots: ['화-11:00', '목-11:00'],
  },
  {
    application_id: 5,
    posting_id: 5,
    posting_title: '국제교류팀 지원 근로',
    cover_letter: '국제 업무에 관심이 있어 지원합니다.',
    status: '제출완료',
    submitted_at: '2026-06-25T13:10:00',
    // --- UI 전용 ---
    department_name: '국제교류팀',
    period: '2026.07.06 ~ 2026.08.28',
    experience: '영어 회화 가능합니다.',
    availableSlots: ['수-13:00', '수-14:00', '금-13:00'],
    classSlots: ['월-13:00', '화-13:00'],
  },
]

export const timeRows = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
]

export const dayCols = ['월', '화', '수', '목', '금']
