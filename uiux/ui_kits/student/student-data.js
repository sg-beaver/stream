// STREAM student portal — mock data (loaded as plain script; exposed on window)

// SAINT global nav (student context)
const saintNav = ['학생정보', '학적변동', '수업/성적', '등록/장학', '졸업', '학생신청', '학생활동', '시설'];

// STREAM student sidebar
const streamMenu = [
  { id: 'posts', label: '교내 근로 모집 공고', icon: 'megaphone' },
  { id: 'apply', label: '지원서 작성', icon: 'file-pen-line' },
  { id: 'status', label: '내 지원 현황', icon: 'clipboard-list' },
  { id: 'schedule', label: '근무 시간표', icon: 'calendar-days' },
  { id: 'substitute', label: '대타 요청', icon: 'repeat' },
  { id: 'attendance', label: '출결 내역', icon: 'list-checks' },
];

const currentUser = { name: '안희진', role: '학생', studentId: '20220042', major: '경영학과', phone: '010-1234-5678', email: 'heejin@sogang.ac.kr' };

// Recruitment posts (based on 근로학생 모집 공고 현황 조사 — real dept/team/우대조건/지원방법 사례 반영)
// duties/qualifications/workSlots/location/contact*: 상세보기 화면에서 공고별로 그대로 노출되는 필드
const posts = [
  {
    id: 'P001', status: '모집중', dept: '학생지원팀', title: '행정 업무 보조', team: '학생지원팀',
    period: '2026.06.02 ~ 2026.08.29', hours: '10:00 ~ 13:00 (3H)', headcount: '2명',
    weeklyMax: '최대 15시간', preferred: '엑셀 활용 가능자, 문서작성 가능자', applyMethod: '이메일',
    dday: 'D-3', deadline: '2026.05.25 (월) 23:59', applied: false, category: '교내 부서', scheduleMatch: true,
    duties: ['민원 응대 및 학생지원팀 행정 업무 보조', '문서 정리, 자료 입력, 안내 자료 관리', '부서 내 단순 행정 업무 지원'],
    qualifications: ['학부 재학생 (휴학생 불가)', '엑셀 활용 가능자 우대', '문서 작성 및 자료 정리 경험자 우대'],
    workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    location: '학생지원팀 사무실 (본관빌딩)', contactEmail: 'staffair@sogang.ac.kr', contactPhone: '02-705-8128',
  },
  {
    id: 'P002', status: '지원완료', dept: '로욜라도서관', title: '참고서비스 제공', team: '정보서비스팀',
    period: '2026.05.02 ~ 2026.08.29', hours: '14:00 ~ 17:00 (3H)', headcount: '1명',
    weeklyMax: '최대 15시간', preferred: '도서정리, 자료실 이용 안내, 대화인성 지원', applyMethod: '이메일',
    appliedDate: '2026.05.20 (화) 15:00', deadline: '2026.05.25 (월) 23:59', applied: true, category: '도서관', scheduleMatch: false,
    duties: ['참고서비스 제공 및 이용자 응대', '도서 정리 및 자료실 관리', '대출/반납 업무 지원'],
    qualifications: ['학부 재학생', '전산 관련 업무 가능자', '평일 야간·주말·공휴일 근무 가능자 우대'],
    workSlots: ['화-14:00', '화-15:00', '화-16:00', '목-14:00', '목-15:00', '목-16:00'],
    location: '로욜라도서관 정보서비스팀', contactEmail: 'libsns@sogang.ac.kr', contactPhone: '02-705-8000',
  },
  {
    id: 'P003', status: '마감임박', dept: '입학처', title: '논술 보조', team: '입학팀',
    period: '2026.06.02 ~ 2026.06.30', hours: '종일 (8H)', headcount: '2명',
    weeklyMax: '최대 15시간', preferred: '엑셀, 한글 등 문서작성 프로그램 활용 가능자', applyMethod: '개별통보·면접',
    dday: 'D-1', deadline: '2026.05.23 (금) 23:59', applied: false, category: '교내 부서', scheduleMatch: false,
    duties: ['논술 시험 감독 보조', '답안지 정리 및 배부', '고사장 안내'],
    qualifications: ['엑셀, 한글 등 문서작성 프로그램 활용 가능자', '꼼꼼하고 성실한 태도'],
    workSlots: ['월-09:00', '월-10:00', '월-11:00', '월-12:00', '월-13:00', '월-14:00', '월-15:00', '월-16:00', '월-17:00'],
    location: '입학처 (본관빌딩)', contactEmail: 'lovesogang@sogang.ac.kr', contactPhone: '02-705-8621',
  },
  {
    id: 'P004', status: '모집중', dept: '종합봉사실', title: '증명서·학생증 발급 보조', team: '학생서비스',
    period: '2026.06.02 ~ 2026.08.29', hours: '09:30~12:30 / 13:00~16:00', headcount: '2명',
    weeklyMax: '최대 10시간', preferred: '민원 응대 경험, 영어·중국어 가능자 우대', applyMethod: '개별통보·면접',
    dday: 'D-5', deadline: '2026.05.27 (수) 23:59', applied: false, category: '교내 부서', scheduleMatch: true,
    duties: ['증명서 발급 민원 응대', '학생증 발급 지원', '종합봉사실 창구 안내'],
    qualifications: ['민원 응대 경험자', '영어·중국어 가능자 우대'],
    workSlots: ['화-09:00', '화-10:00', '화-11:00', '화-12:00', '화-13:00', '화-14:00', '화-15:00', '목-09:00', '목-10:00', '목-11:00', '목-12:00', '목-13:00', '목-14:00', '목-15:00'],
    location: '종합봉사실 (학생회관)', contactEmail: 'onestop@sogang.ac.kr', contactPhone: '02-705-8002',
  },
  {
    id: 'P005', status: '모집중', dept: '디지털정보처', title: '원격강의 콘텐츠 운영 보조', team: '원격교육지원센터',
    period: '2026.06.01 ~ 2026.08.29', hours: '주 2일 전일 (9~17시)', headcount: '2명',
    weeklyMax: '주 14시간 이하', preferred: '금요일 근무 가능자 우대', applyMethod: '이메일',
    dday: 'D-6', deadline: '2026.05.28 (목) 23:59', applied: false, category: '교내 부서', scheduleMatch: false,
    duties: ['원격강의 콘텐츠 업로드 및 점검', '강의 시스템 운영 지원', '이용자 문의 응대'],
    qualifications: ['주 2일 전일 근무 가능자', '금요일 근무 가능자 우대'],
    workSlots: ['화-09:00', '화-10:00', '화-11:00', '화-12:00', '화-13:00', '화-14:00', '화-15:00', '화-16:00', '화-17:00', '금-09:00', '금-10:00', '금-11:00', '금-12:00', '금-13:00', '금-14:00', '금-15:00', '금-16:00', '금-17:00'],
    location: '디지털정보처 원격교육지원센터', contactEmail: 'webadmin@sogang.ac.kr', contactPhone: '02-705-8716',
  },
  {
    id: 'P006', status: '모집중', dept: '교무처', title: '교수학습법 튜터링 보조', team: '교수학습센터',
    period: '2026.06.02 ~ 2026.08.29', hours: '13:00 ~ 17:00 (4H)', headcount: '3명',
    weeklyMax: '최대 12시간', preferred: '가급적 바로 출근 가능한 학생 우대', applyMethod: '면접·이메일',
    dday: 'D-8', deadline: '2026.05.30 (토) 23:59', applied: false, category: '교내 부서', scheduleMatch: true,
    duties: ['학습법 튜터링 프로그램 운영 보조', '상담 예약 및 자료 정리', '프로그램 홍보 지원'],
    qualifications: ['대학원 재학생 또는 학부 재학생', '바로 출근 가능한 학생 우대'],
    workSlots: ['월-13:00', '월-14:00', '월-15:00', '월-16:00', '수-13:00', '수-14:00', '수-15:00', '수-16:00'],
    location: '교수학습센터', contactEmail: 'sgctl4u@sogang.ac.kr', contactPhone: '02-705-7915',
  },
  {
    id: 'P007', status: '마감임박', dept: '기획처', title: '홍보 콘텐츠 제작 보조', team: '교육혁신팀',
    period: '2026.06.02 ~ 2026.08.15', hours: '10:00 ~ 14:00 (4H)', headcount: '1명',
    weeklyMax: '최대 10시간', preferred: '사진 촬영/편집 가능자, SNS 운영 경험자 우대', applyMethod: '이메일',
    dday: 'D-2', deadline: '2026.05.24 (일) 23:59', applied: false, category: '교내 부서', scheduleMatch: false,
    duties: ['SNS·홍보 콘텐츠 기획 및 제작', '행사 사진 촬영/편집', '홍보 자료 정리'],
    qualifications: ['사진 촬영/편집 가능자', 'SNS 운영 경험자 우대'],
    workSlots: ['화-10:00', '화-11:00', '화-12:00', '화-13:00', '목-10:00', '목-11:00', '목-12:00', '목-13:00'],
    location: '기획처 교육혁신팀', contactEmail: 'sginno@sogang.ac.kr', contactPhone: '02-705-8659',
  },
  {
    id: 'P008', status: '모집중', dept: '기획처', title: '대학혁신 사업 운영 보조', team: '대학혁신추진단',
    period: '2026.06.02 ~ 2026.08.29', hours: '14:00 ~ 17:00 (3H)', headcount: '2명',
    weeklyMax: '최대 15시간', preferred: '일 최소 3시간 연속 근무 가능자', applyMethod: '면접·이메일',
    dday: 'D-10', deadline: '2026.06.01 (월) 23:59', applied: false, category: '교내 부서', scheduleMatch: true,
    duties: ['대학혁신 사업 운영 지원', '회의 자료 준비 및 정리', '사업 관련 행정 보조'],
    qualifications: ['일 최소 3시간 연속 근무 가능자'],
    workSlots: ['월-14:00', '월-15:00', '월-16:00', '목-14:00', '목-15:00', '목-16:00'],
    location: '대학혁신추진단', contactEmail: 'greeny@sogang.ac.kr', contactPhone: '02-705-8750',
  },
  {
    id: 'P009', status: '마감임박', dept: '학생문화처', title: '취업 프로그램 운영 보조', team: '취업지원팀',
    period: '2026.06.02 ~ 2026.07.31', hours: '10:00 ~ 13:00 (3H)', headcount: '2명',
    weeklyMax: '최대 12시간', preferred: '문서작성 능숙자 우대', applyMethod: '개별통보·면접',
    dday: 'D-1', deadline: '2026.05.23 (금) 23:59', applied: false, category: '교내 부서', scheduleMatch: false,
    duties: ['취업 프로그램 운영 및 접수 지원', '참가자 안내 및 자료 정리', '행정 업무 보조'],
    qualifications: ['본교 재학생', '문서작성 능숙자 우대'],
    workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    location: '취업지원팀', contactEmail: 'jobs@sogang.ac.kr', contactPhone: '02-705-8995',
  },
  {
    id: 'P010', status: '지원완료', dept: '총무처', title: '인사행정 보조', team: '인사총무팀',
    period: '2026.06.02 ~ 2026.08.29', hours: '09:00 ~ 13:00 (4H)', headcount: '1명',
    weeklyMax: '최대 15시간', preferred: '엑셀 활용 능숙자 우대', applyMethod: '개별통보·면접',
    appliedDate: '2026.05.19 (화) 10:00', deadline: '2026.05.25 (월) 23:59', applied: true, category: '교내 부서', scheduleMatch: true,
    duties: ['인사 서류 정리 및 전산 입력', '행정 업무 보조', '부서 내 민원 응대'],
    qualifications: ['학부 재학생', '엑셀 활용 능숙자 우대'],
    workSlots: ['화-09:00', '화-10:00', '화-11:00', '화-12:00', '목-09:00', '목-10:00', '목-11:00', '목-12:00'],
    location: '인사총무팀', contactEmail: 'yeej0328@sogang.ac.kr', contactPhone: '02-705-8281',
  },
  {
    id: 'P011', status: '모집완료', dept: '총무처', title: '재무행정 보조', team: '재무팀',
    period: '2026.05.01 ~ 2026.05.20', hours: '10:00 ~ 13:00 (3H)', headcount: '1명',
    weeklyMax: '최대 12시간', preferred: '영어 회화 가능한 자', applyMethod: '개별통보·면접',
    deadline: '2026.05.20 (수) 23:59', applied: false, category: '교내 부서', scheduleMatch: false,
    duties: ['재무 서류 정리 및 전산 입력', '연말정산 관련 행정 보조', '부서 내 민원 응대'],
    qualifications: ['학부 재학생', '영어 회화 가능한 자'],
    workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    location: '재무팀', contactEmail: 'dasjk@sogang.ac.kr', contactPhone: '02-3274-4994',
  },
  {
    id: 'P012', status: '모집중', dept: '경제대학', title: '학과 행정업무 보조', team: '경제대학행정팀',
    period: '2026.06.02 ~ 2026.08.29', hours: '09:00 ~ 13:00 (4H)', headcount: '1명',
    weeklyMax: '최대 15시간', preferred: '5~7학기 경제학과 학부생 대상', applyMethod: '면접·이메일',
    dday: 'D-9', deadline: '2026.05.31 (일) 23:59', applied: false, category: '학과별 사무실', scheduleMatch: false,
    duties: ['학과 행정 업무 보조', '학과 사무실 민원 응대', '문서 정리 및 자료 관리'],
    qualifications: ['5~7학기 경제학과 학부생 대상'],
    workSlots: ['화-09:00', '화-10:00', '화-11:00', '화-12:00', '금-09:00', '금-10:00', '금-11:00', '금-12:00'],
    location: '경제대학행정팀', contactEmail: 'econdept@sogang.ac.kr', contactPhone: '02-705-8747',
  },
];

const postStats = [
  { key: 'total', label: '전체 공고', value: '12건', sub: '전체 등록된 공고', icon: 'files', tone: 'neutral' },
  { key: 'open', label: '모집중', value: '6건', sub: '현재 지원 가능한 공고', icon: 'megaphone', tone: 'green' },
  { key: 'soon', label: '마감임박', value: '3건', sub: '3일 이내 마감', icon: 'clock', tone: 'orange' },
  { key: 'done', label: '지원완료', value: '2건', sub: '내가 지원한 공고', icon: 'circle-check', tone: 'blue' },
];

// Post detail (default P001)
const postDetail = {
  status: '모집중', team: '학생지원팀', title: '행정 업무 보조',
  headcount: '2명', weeklyMax: '10시간 이내', period: '2026.03.02 ~ 2026.06.30', deadline: '2026.05.25 23:59',
  duties: ['민원 응대 및 학생지원팀 행정 업무 보조', '문서 정리, 자료 입력, 안내 자료 관리', '부서 내 단순 행정 업무 지원'],
  qualifications: ['엑셀 활용 가능자 우대', '문서 작성 및 자료 정리 경험자 우대', '월/수 요일 근무 가능자 우대'],
  location: '학생지원팀 사무실', contactEmail: 'studentoffice@sogang.ac.kr', contactPhone: '02-705-8000',
  // grid: red cells (class time / assigned work) keyed "day-time"
  workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
};

// My applications
const myAppStats = [
  { key: 'all', label: '전체', value: '8건', sub: '내가 지원한 공고', icon: 'files', tone: 'blue' },
  { key: 'done', label: '지원 완료', value: '5건', sub: '제출이 완료된 공고', icon: 'circle-check', tone: 'green' },
  { key: 'review', label: '검토 중', value: '2건', sub: '담당자 검토 중', icon: 'clock', tone: 'orange' },
  { key: 'interview', label: '면접 진행', value: '1건', sub: '면접이 예정된 공고', icon: 'users', tone: 'purple' },
  { key: 'pass', label: '최종 합격', value: '0건', sub: '최종 합격한 공고', icon: 'trophy', tone: 'gold' },
];

// stepIndex: 0 제출완료, 1 검토중, 2 면접, 3 결과(합/불)
const myApplications = [
  { id: 'A1', title: '학생지원팀 행정 보조 근로', dept: '학생지원팀', cat: '행정/사무 보조', period: '2026.06.02 ~ 2026.08.29', date: '2026.05.20 (화) 15:30', status: '지원 완료', step: 0, result: null },
  { id: 'A2', title: '로욜라도서관 자료실 근로', dept: '로욜라도서관', cat: '도서/자료 정리', period: '2026.06.02 ~ 2026.08.29', date: '2026.05.18 (일) 11:20', status: '검토 중', step: 1, result: null },
  { id: 'A3', title: '정보통신원 영상 촬영 및 편집 보조', dept: '정보통신원', cat: '미디어/콘텐츠', period: '2026.06.02 ~ 2026.06.30', date: '2026.05.16 (금) 09:15', status: '면접 진행', step: 2, result: null },
  { id: 'A4', title: '학과 사무실 행정 보조', dept: '경영학과', cat: '행정/사무 보조', period: '2026.06.02 ~ 2026.07.15', date: '2026.05.10 (토) 16:45', status: '불합격', step: 3, result: 'fail' },
  { id: 'A5', title: '국제교류팀 지원 근로', dept: '국제교류팀', cat: '행정/사무 보조', period: '2026.06.02 ~ 2026.07.31', date: '2026.05.03 (일) 13:10', status: '지원 완료', step: 0, result: null },
];

// Application detail (A1)
const appDetail = {
  affiliation: '서강대학교',
  department: '학생지원팀',
  title: '행정 업무 보조',
  workDescription: '학생지원팀 행정 업무 보조',
  status: '지원 완료',
  date: '2026.05.20 (화) 15:30',
  step: 1, // stepper highlight up to 검토중
  motivation: '학생지원팀에서 다양한 행정 업무를 경험하며 학교 구성원들에게 실질적인 도움을 주고 싶습니다. 평소 꼼꼼하고 책임감 있게 일을 처리하는 성격을 바탕으로 팀에 기여하고 성장하고자 지원했습니다.',
  experience: '전공 수업 조교 경험을 통해 문서 정리, 데이터 입력, 이메일 응대 등의 행정 업무를 수행해 왔습니다. 꼼꼼한 성격과 원활한 커뮤니케이션 능력으로 팀 협업에 적극적으로 참여할 수 있습니다.',
  required: ['학부 재학생', '휴학생/수료/졸업예정 불가', '친절/서비스 마인드', '시간 엄수·성실', '선발 즉시 근무 가능'],
  preferred: ['문서 작성/자료 정리 경험', '엑셀 활용 가능', '월·수 오전 근무 가능', '행정 업무 보조 경험'],
  attachment: { name: '포트폴리오_안희진.pdf', date: '2026.05.20 15:29', size: '128 KB' },
  availSlots: ['화-09:00', '화-10:00', '목-09:00', '목-10:00', '금-09:00', '금-10:00', '월-14:00', '수-14:00', '목-14:00', '수-15:00', '목-15:00', '수-16:00', '목-16:00', '수-17:00', '금-17:00', '수-18:00', '금-18:00'],
  classSlots: ['월-10:00', '수-11:00', '수-12:00', '월-13:00', '금-14:00', '금-15:00', '금-16:00'],
};

// Application form defaults
const formJobs = [
  {
    id: 'S01', team: '학생지원팀', title: '행정 업무 보조', icon: 'briefcase',
    period: '2026.06.02 ~ 2026.08.29', hours: '월·수 10:00 ~ 13:00', headcount: '2명',
    weeklyMax: '최대 10시간', deadline: '2026.05.25 (월) 23:59',
    required: ['학부 재학생', '휴학생/수료/졸업예정 불가', '친절/서비스 마인드', '시간 엄수·성실', '선발 즉시 근무 가능'],
    preferred: ['문서 작성/자료 정리 경험', '엑셀 활용 가능', '월·수 오전 근무 가능', '행정 업무 보조 경험'],
    classSlots: ['화-14:00', '화-15:00', '목-15:00', '목-16:00'],
    checkedSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
  },
  {
    id: 'S02', team: '로욜라도서관 정보서비스팀', title: '참고서비스 제공', icon: 'book-open',
    period: '2026.06.02 ~ 2026.08.29', hours: '화·목 14:00 ~ 17:00', headcount: '1명',
    weeklyMax: '최대 10시간', deadline: '2026.05.25 (월) 23:59',
    required: ['학부 재학생', '휴학생/수료/졸업예정 불가', '도서관 이용 안내 가능', '자료 정리 경험', '성실한 응대 태도'],
    preferred: ['도서 정리/자료실 업무 경험', '사용자 응대 능력', 'Excel/문서 작성 숙련', '책임감 있는 근무 태도'],
    classSlots: ['월-10:00', '월-11:00', '수-11:00', '금-10:00', '금-11:00'],
    checkedSlots: ['화-14:00', '화-15:00', '화-16:00', '목-14:00', '목-15:00', '목-16:00'],
  },
  {
    id: 'S03', team: '종합봉사실', title: '증명서 발급 및 학생증 발급 업무 보조', icon: 'credit-card',
    period: '2026.06.02 ~ 2026.08.29', hours: '월·수 09:30 ~ 12:30', headcount: '2명',
    weeklyMax: '최대 10시간', deadline: '2026.05.27 (수) 23:59',
    required: ['학부 재학생', '휴학생/수료/졸업예정 불가', '민원 응대 가능', '문서 정리 및 자료 관리', '정확한 근무 태도'],
    preferred: ['민원 응대 경험', '행정 업무 보조 경험', '응대 친절성', '근무 시간 준수 가능'],
    classSlots: ['월-09:00', '월-10:00', '수-09:00', '금-09:00'],
    checkedSlots: ['월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00', '목-09:00', '금-10:00'],
  },
];
const formJob = formJobs[0];
const formRequired = formJob.required;
const formPreferred = formJob.preferred;
const formClassSlots = formJob.classSlots;
const formCheckedSlots = formJob.checkedSlots;

const timeRows = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
const dayCols = ['월','화','수','목','금'];

Object.assign(window, {
  saintNav, streamMenu, currentUser, posts, postStats, postDetail,
  myAppStats, myApplications, appDetail, formJobs, formJob, formRequired, formPreferred,
  formClassSlots, formCheckedSlots, timeRows, dayCols,
});
