// STREAM 관리자 콘솔 — mock data (plain script, window exports)

const adminSaintNav = ['인사', '예산', '자산', '구매', '시설', 'BI/평가'];
const adminMenu = [
  { id: 'posts', label: '교내 근로 모집 공고', icon: 'megaphone' },
  { id: 'selection', label: '학생 선발', icon: 'user-check' },
  { id: 'students', label: '학생 관리', icon: 'users' },
  { id: 'schedule', label: '근로 시간표', icon: 'calendar-days' },
  { id: 'substitute', label: '대타 요청', icon: 'repeat' },
  { id: 'dashboard', label: '운영 대시보드', icon: 'layout-dashboard' },
];
const adminUser = { name: '김서강', role: '근로 담당', dept: '학생지원팀' };

// ---- 모집 공고 ----
const adminPostStats = [
  { key: 'total', label: '전체 공고', value: '12건', sub: '이번 학기 등록', icon: 'files', tone: 'neutral' },
  { key: 'open', label: '모집중', value: '7건', sub: '현재 지원 접수중', icon: 'megaphone', tone: 'green' },
  { key: 'soon', label: '마감임박', value: '3건', sub: '3일 이내 마감', icon: 'clock', tone: 'orange' },
  { key: 'closed', label: '모집완료', value: '2건', sub: '선발 진행 예정', icon: 'circle-check', tone: 'blue' },
];
const adminPosts = [
  { id: 'P001', status: '모집중', dept: '학생지원팀', title: '행정 업무 보조', headcount: 2, applicants: 12, weekly: '최대 15시간', deadline: '2026.05.25', reg: '2026.05.02' },
  { id: 'P002', status: '모집중', dept: '로욜라도서관', title: '참고서비스 제공', headcount: 1, applicants: 8, weekly: '최대 15시간', deadline: '2026.05.25', reg: '2026.05.01' },
  { id: 'P003', status: '마감임박', dept: '입학처', title: '논술 보조', headcount: 2, applicants: 4, weekly: '최대 15시간', deadline: '2026.05.23', reg: '2026.04.28' },
  { id: 'P004', status: '모집완료', dept: '종합봉사실', title: '증명서·학생증 발급 보조', headcount: 2, applicants: 15, weekly: '최대 10시간', deadline: '2026.05.20', reg: '2026.04.20' },
  { id: 'P005', status: '모집중', dept: '국제교류팀', title: '교환학생 지원 보조', headcount: 1, applicants: 3, weekly: '최대 12시간', deadline: '2026.05.27', reg: '2026.05.03' },
];

// ---- 학생 선발 ----
const applicants = [
  { id: 'S1', name: '안희진', sid: '20220042', major: '경영학과', grade: '3학년', gpa: 3.82, fit: 92, fitLabel: '높음', status: '검토중', applyDate: '2026.05.20',
    matches: ['학점 기준 충족 (3.5 이상)', '월·수 오전 근무 가능 — 공고 요구 시간대와 일치', '엑셀 활용 가능 (우대 역량 보유)'],
    warnings: ['교내 근로 경험 없음 — 초기 적응 지원 권장'],
    note: '지원 동기 구체적이며 근무 가능 시간이 공고와 잘 맞음.' },
  { id: 'S2', name: '박민수', sid: '202209999', major: '물리학과', grade: '4학년', gpa: 2.95, fit: 64, fitLabel: '보통', status: '검토중', applyDate: '2026.05.19',
    matches: ['근로장학 2회 이수 — 행정 업무 경험 보유', '장기 근무 가능'],
    warnings: ['학점 3.0 미만 — 학사 경고 이력 확인 필요', '공고 요구 시간대(오전)와 일부 불일치'],
    note: '경험은 풍부하나 가능 시간대 조정 필요.' },
  { id: 'S3', name: '이영희', sid: '202105678', major: '영문학과', grade: '2학년', gpa: 3.51, fit: 78, fitLabel: '높음', status: '보류', applyDate: '2026.05.18',
    matches: ['학점 기준 충족', '영어 가능 — 국제 업무 우대'],
    warnings: ['타 부서 근로 중복 지원 — 중복 배정 불가 확인 필요'],
    note: '중복 지원 건 확인 후 재검토.' },
  { id: 'S4', name: '최준호', sid: '202411223', major: '컴퓨터공학', grade: '1학년', gpa: 4.10, fit: 71, fitLabel: '보통', status: '검토중', applyDate: '2026.05.21',
    matches: ['학점 최상위권', '전산 활용 능숙 (우대)'],
    warnings: ['1학년 — 첫 근로, 근무 지속성 확인 필요'],
    note: '' },
];

// ---- 학생 관리 ----
const workers = [
  { id: 'W1', name: '안희진', sid: '20220042', major: '경영학과', dept: '학생지원팀', role: '행정 업무 보조', assigned: 8, worked: 24, rate: '10,850', pay: '1월 지급 완료', attendance: '정상', subs: 1 },
  { id: 'W2', name: '정하늘', sid: '202208765', major: '사회학과', dept: '로욜라도서관', role: '자료실 근로', assigned: 10, worked: 30, rate: '10,850', pay: '1월 지급 완료', attendance: '정상', subs: 0 },
  { id: 'W3', name: '김도윤', sid: '202311111', major: '화학과', dept: '입학처', role: '논술 보조', assigned: 6, worked: 12, rate: '11,000', pay: '지급 예정', attendance: '지각 1회', subs: 2 },
];

// ---- 대타 요청 ----
const subStats = [
  { key: 'pending', label: '미처리 요청', value: '3건', sub: '승인 대기', icon: 'clock', tone: 'orange' },
  { key: 'approved', label: '승인 완료', value: '8건', sub: '이번 학기', icon: 'circle-check', tone: 'green' },
  { key: 'rejected', label: '반려', value: '1건', sub: '이번 학기', icon: 'circle-x', tone: 'neutral' },
  { key: 'conflict', label: '근무표 충돌', value: '1건', sub: '확인 필요', icon: 'triangle-alert', tone: 'red' },
];
const subRequests = [
  { id: 'R1', requester: '안희진', dept: '학생지원팀', date: '2026.05.28', time: '10:00-13:00', reason: '수강신청', status: '미처리', reqDate: '2026.05.22' },
  { id: 'R2', requester: '김도윤', dept: '입학처', date: '2026.05.29', time: '09:00-12:00', reason: '병원 방문', status: '미처리', reqDate: '2026.05.21' },
  { id: 'R3', requester: '정하늘', dept: '로욜라도서관', date: '2026.05.26', time: '14:00-17:00', reason: '가족 행사', status: '승인', approver: '김서강', reqDate: '2026.05.19' },
];
const subCandidates = [
  { name: '박민수', dept: '학생지원팀', fit: '높음', reason: '해당 시간 미근무 · 가능 시간 내 포함 · 동일 부서 경험' },
  { name: '최준호', dept: '학생지원팀', fit: '보통', reason: '해당 시간 미근무 · 당일 14:00 근무 예정(연속 근무 가능)' },
];

// ---- 운영 대시보드 ----
const dashStats = [
  { key: 'rate', label: '충원율', value: '69%', sub: '11 / 16명 배정', icon: 'trending-up', tone: 'green' },
  { key: 'appl', label: '지원자 수', value: '39명', sub: '이번 학기 누적', icon: 'users', tone: 'blue' },
  { key: 'pending', label: '미처리 요청', value: '3건', sub: '대타 승인 대기', icon: 'clock', tone: 'orange' },
  { key: 'conflict', label: '근무표 충돌', value: '1건', sub: '조정 필요', icon: 'triangle-alert', tone: 'red' },
];
const deptFill = [
  { dept: '도서관', filled: 5, total: 5 },
  { dept: '학생식당', filled: 6, total: 8 },
  { dept: '학생지원팀', filled: 2, total: 2 },
  { dept: '입학처', filled: 1, total: 2 },
  { dept: '시설관리팀', filled: 0, total: 3 },
];
const subTrend = [
  { month: '3월', count: 2 }, { month: '4월', count: 4 }, { month: '5월', count: 3 },
];

const adminTimeRows = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
const adminDayCols = ['월','화','수','목','금'];

Object.assign(window, {
  adminSaintNav, adminMenu, adminUser, adminPostStats, adminPosts, applicants, workers,
  subStats, subRequests, subCandidates, dashStats, deptFill, subTrend, adminTimeRows, adminDayCols,
});
