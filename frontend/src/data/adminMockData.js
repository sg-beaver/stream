// 관리자(직원) 화면 mock 데이터 — uiux/ui_kits/admin/admin-data.js 포팅
// 실제 백엔드 API 연동 전 단계 (docs/API_SPEC.md 참고 — 공고/선발/근무표/대타는 실 API 존재, 학생 관리는 API 없음)

export const adminPostStats = [
  { key: 'total', label: '전체 공고', value: '13건', sub: '이번 학기 등록', icon: 'Files', tone: 'neutral' },
  { key: 'open', label: '모집중', value: '8건', sub: '현재 지원 접수중', icon: 'Megaphone', tone: 'success' },
  { key: 'soon', label: '마감임박', value: '3건', sub: '3일 이내 마감', icon: 'Clock', tone: 'warning' },
  { key: 'closed', label: '모집완료', value: '2건', sub: '선발 진행 예정', icon: 'CircleCheck', tone: 'info' },
]

export const adminPosts = [
  { id: 'P001', status: '모집중', dept: '학생지원팀', title: '행정 업무 보조', headcount: 2, applicants: 6, weekly: '최대 15시간', deadline: '2026.05.25', reg: '2026.05.02',
    duties: ['민원 응대 및 학생지원팀 행정 업무 보조', '문서 정리, 자료 입력, 안내 자료 관리', '부서 내 단순 행정 업무 지원'],
    qualifications: ['학부 재학생 (휴학생 불가)'],
    preferred: ['엑셀 활용 가능자 우대', '문서 작성 및 자료 정리 경험자 우대'],
    workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'], location: '학생지원팀 사무실 (본관빌딩)',
    customQuestions: ['민원 응대, 문서 정리, 자료 입력 등 관련 경험과 역량을 작성해 주세요.'] },
  { id: 'P002', status: '모집중', dept: '로욜라도서관', title: '참고서비스 제공', headcount: 1, applicants: 8, weekly: '최대 15시간', deadline: '2026.05.25', reg: '2026.05.01',
    duties: ['참고서비스 제공 및 이용자 응대', '도서 정리 및 자료실 관리', '대출/반납 업무 지원'],
    qualifications: ['학부 재학생', '전산 관련 업무 가능자'],
    preferred: ['평일 야간·주말·공휴일 근무 가능자 우대'],
    workSlots: ['화-14:00', '화-15:00', '화-16:00', '목-14:00', '목-15:00', '목-16:00'], location: '로욜라도서관 정보서비스팀',
    customQuestions: ['이용자 응대, 자료실 관리 등 관련 경험과 역량을 작성해 주세요.'] },
  { id: 'P003', status: '마감임박', dept: '입학처', title: '논술 보조', headcount: 2, applicants: 4, weekly: '최대 15시간', deadline: '2026.05.23', reg: '2026.04.28',
    duties: ['논술 시험 감독 보조', '답안지 정리 및 배부', '고사장 안내'],
    qualifications: ['엑셀, 한글 등 문서작성 프로그램 활용 가능자', '꼼꼼하고 성실한 태도'],
    preferred: [],
    workSlots: ['월-09:00', '월-10:00', '월-11:00', '월-12:00', '월-13:00'], location: '입학처 (본관빌딩)',
    customQuestions: ['시험 감독, 문서 정리 등 관련 경험과 역량을 작성해 주세요.'] },
  { id: 'P004', status: '모집완료', dept: '종합봉사실', title: '증명서·학생증 발급 보조', headcount: 2, applicants: 15, weekly: '최대 10시간', deadline: '2026.05.20', reg: '2026.04.20',
    duties: ['증명서 발급 민원 응대', '학생증 발급 지원', '종합봉사실 창구 안내'],
    qualifications: ['민원 응대 경험자'],
    preferred: ['영어·중국어 가능자 우대'],
    workSlots: ['화-09:00', '화-10:00', '화-11:00', '목-09:00', '목-10:00', '목-11:00'], location: '종합봉사실 (학생회관)',
    customQuestions: ['민원 응대, 외국어 응대 등 관련 경험과 역량을 작성해 주세요.'] },
  { id: 'P005', status: '모집중', dept: '국제교류팀', title: '교환학생 지원 보조', headcount: 1, applicants: 3, weekly: '최대 12시간', deadline: '2026.05.27', reg: '2026.05.03',
    duties: ['교환학생 서류 접수 및 안내', '국제교류 프로그램 운영 지원', '부서 내 행정 업무 보조'],
    qualifications: ['문서 작성 및 자료 정리 가능자'],
    preferred: ['영어 회화 가능자 우대'],
    workSlots: ['월-13:00', '월-14:00', '월-15:00', '수-13:00', '수-14:00', '수-15:00'], location: '국제교류팀',
    customQuestions: ['서류 접수, 외국어 응대 등 관련 경험과 역량을 작성해 주세요.'] },
  { id: 'P013', status: '모집중', dept: '학생지원팀', title: '학생증 재발급 창구 지원', headcount: 1, applicants: 4, weekly: '최대 10시간', deadline: '2026.05.29', reg: '2026.05.10',
    duties: ['학생증 재발급 신청 접수', '증명서 발급 안내', '창구 민원 응대'],
    qualifications: ['학부 재학생'],
    preferred: ['민원 응대 경험자 우대'],
    workSlots: ['화-13:00', '화-14:00', '목-13:00', '목-14:00'], location: '학생지원팀 사무실 (본관빌딩)',
    customQuestions: ['민원 응대 경험이 있다면 구체적으로 작성해 주세요.'] },
]

// postId: applicants[].postId가 adminPosts[].id와 연결됨 — 담당자는 자신이 속한 부서 공고의 지원자만 확인
// AI 적합도 점수는 사용하지 않음 (MVP 제외 확정) — 지원자가 실제로 제출한 지원서 내용을 담당자가 직접 확인
export const applicants = [
  { id: 'S1', postId: 'P001', name: '안희진', sid: '20220042', major: '경영학과', grade: '3학년', status: '검토중', applyDate: '2026.05.20',
    phone: '010-1234-5678', email: 'heejin@sogang.ac.kr',
    motivation: '고등학교 시절부터 학생회 활동을 하며 여러 사람과 협업하고 행정 업무를 처리하는 데 보람을 느껴왔습니다. 지난 학기 학생지원팀에서 근로하며 학교 행정이 학생들의 학교생활에 얼마나 큰 영향을 미치는지 직접 느꼈고, 이 경험을 더 발전시켜 학생들에게 실질적으로 도움이 되는 업무를 하고 싶습니다.',
    selfIntro: '꼼꼼하고 책임감 있게 일을 처리하는 성격이며, 문제가 생기면 끝까지 원인을 파악해서 해결하는 편입니다.',
    careers: [{ type: '교내근로', org: '학생지원팀', role: '행정보조', periodStart: '2025.09.01', periodEnd: '2025.12.20', detail: '문서 정리 및 민원 응대' }],
    languages: [], certificates: [{ name: '컴퓨터활용능력 2급', org: '', date: '2024.11.10' }],
    classSlots: ['월-09:00', '수-09:00', '화-13:00', '화-14:00', '목-13:00', '목-14:00'],
    availableSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    note: '지원 동기 구체적이며 근무 가능 시간이 공고와 잘 맞음.' },
  { id: 'S5', postId: 'P001', name: '정하늘', sid: '202211234', major: '국어국문학과', grade: '3학년', status: '검토중', applyDate: '2026.05.19',
    phone: '010-5678-9012', email: 'haneul.jeong@sogang.ac.kr',
    motivation: '학생회 총무를 맡아 예산 정리와 각종 문서 작업을 담당해왔습니다. 학생회 활동을 하며 학생들의 다양한 요청과 문의에 응대하는 경험도 쌓았는데, 이 과정에서 상대방의 입장에서 차근차근 설명하는 태도의 중요성을 배웠습니다.',
    selfIntro: '엑셀 작업과 공문 작성에 능숙하고, 반복적인 문서 업무도 꼼꼼하게 처리합니다.',
    careers: [{ type: '동아리', org: '학생회', role: '총무', periodStart: '2025.03.01', periodEnd: '2025.12.20', detail: '예산 정리 및 문서 작성' }],
    languages: [], certificates: [],
    classSlots: ['화-09:00', '화-10:00', '화-11:00', '목-09:00', '목-10:00'],
    availableSlots: ['월-10:00', '월-11:00', '수-10:00', '수-11:00', '수-12:00'],
    note: '' },
  { id: 'S6', postId: 'P001', name: '김도윤', sid: '202333456', major: '화학과', grade: '2학년', status: '탈락', applyDate: '2026.05.17',
    phone: '010-6789-0123', email: 'doyoon.kim@sogang.ac.kr',
    motivation: '화학과에 재학 중이지만 실험 위주의 전공 특성상 행정 업무를 접할 기회가 많지 않았습니다. 이번 기회를 통해 학교 행정이 실제로 어떻게 운영되는지 배우고 싶어 지원하게 되었습니다.',
    selfIntro: '성실하고 꼼꼼한 성격으로 빠르게 업무를 익힐 자신이 있습니다.',
    careers: [], languages: [], certificates: [],
    classSlots: ['월-09:00', '월-10:00', '월-11:00', '화-13:00', '화-14:00'],
    availableSlots: ['월-15:00', '월-16:00'],
    note: '근무 가능 시간이 공고 시간대와 맞지 않아 탈락 처리.' },
  { id: 'S8', postId: 'P001', name: '한소연', sid: '202225555', major: '심리학과', grade: '3학년', status: '검토중', applyDate: '2026.05.15',
    phone: '010-8901-2345', email: 'soyeon.han@sogang.ac.kr',
    motivation: '학과 스터디 모임의 총무를 맡아 자료 정리와 일정 조율을 담당해왔습니다. 정확한 문서 처리가 얼마나 중요한지 체감했고, 이런 꼼꼼함을 학생지원팀 업무에도 그대로 적용하고 싶습니다.',
    selfIntro: '계획을 세우고 일정을 관리하는 것을 좋아하며, 데이터 관리 역량도 꾸준히 쌓아왔습니다.',
    careers: [], languages: [{ test: 'TOEIC', score: '890', grade: '', date: '2025.09.20' }], certificates: [{ name: '컴퓨터활용능력 1급', org: '', date: '2025.02.15' }],
    classSlots: ['화-09:00', '화-10:00', '목-09:00', '목-10:00'],
    availableSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    note: '근무 가능 시간이 공고와 완전히 일치.' },
  { id: 'S3', postId: 'P005', name: '이영희', sid: '202105678', major: '영문학과', grade: '2학년', status: '보류', applyDate: '2026.05.18',
    phone: '010-3456-7890', email: 'younghee.lee@sogang.ac.kr',
    motivation: '어학연수와 교환학생 프로그램을 준비하며 국제교류팀의 도움을 많이 받았던 경험이 이번 지원의 가장 큰 계기가 되었습니다. 이제는 제가 그 역할을 맡아 다른 학생들의 국제교류 준비 과정을 도와주고 싶습니다.',
    selfIntro: 'TOEIC과 JLPT를 준비하며 꾸준히 외국어 실력을 쌓아왔고, 외국인 유학생과 교환학생들을 세심하게 안내하고 싶습니다.',
    careers: [], languages: [{ test: 'TOEIC', score: '915', grade: '', date: '2025.10.05' }, { test: 'JLPT', score: '', grade: 'N2', date: '2024.07.10' }], certificates: [],
    classSlots: ['화-09:00', '화-10:00', '목-09:00', '목-10:00'],
    availableSlots: ['월-10:00', '월-11:00', '수-10:00', '수-11:00'],
    note: '타 부서 근로 중복 지원 여부 확인 후 재검토.' },
  { id: 'S10', postId: 'P013', name: '배수진', sid: '202119876', major: '아동학과', grade: '3학년', status: '검토중', applyDate: '2026.05.20',
    phone: '010-0123-4567', email: 'sujin.bae@sogang.ac.kr',
    motivation: '편의점에서 1년 가까이 아르바이트를 하며 다양한 손님을 응대하고 계산 업무를 처리해왔습니다. 이 경험을 바탕으로 학생증 재발급 창구에서도 학생들의 문의에 신속하고 정확하게 응대하고 싶습니다.',
    selfIntro: '침착하게 상황을 판단하고 친절하게 응대하는 데 자신이 있습니다.',
    careers: [{ type: '아르바이트', org: '편의점 (신촌)', role: '아르바이트생', periodStart: '2024.03.01', periodEnd: '2025.02.28', detail: '고객 응대 및 계산 업무' }],
    languages: [], certificates: [],
    classSlots: ['월-09:00', '월-10:00', '수-09:00', '수-10:00'],
    availableSlots: ['화-13:00', '화-14:00', '목-13:00', '목-14:00'],
    note: '창구 응대 경험이 업무와 잘 맞음.' },
  { id: 'S12', postId: 'P013', name: '강태오', sid: '202004567', major: '경제학과', grade: '4학년', status: '보류', applyDate: '2026.05.18',
    phone: '010-2233-4455', email: 'taeo.kang@sogang.ac.kr',
    motivation: '경제학과 졸업을 앞두고 마지막 학기를 의미 있게 보내고 싶어 지원하게 되었습니다. 학생증 재발급 창구 업무를 통해 후배들에게 도움이 되는 마지막 학기를 보내고 싶습니다.',
    selfIntro: '책임감 있게 맡은 역할을 수행해왔고, 한국사능력검정시험 1급을 취득하며 꾸준함을 증명해왔습니다.',
    careers: [], languages: [], certificates: [{ name: '한국사능력검정시험 1급', org: '', date: '2024.10.12' }],
    classSlots: ['월-09:00', '월-10:00', '월-11:00', '수-09:00', '수-10:00'],
    availableSlots: ['화-13:00', '화-14:00'],
    note: '4학년 — 학기 중 조기 취업 가능성 확인 필요.' },
]

// ---- 학생 관리 (API 없음 — 전체 mock) ----
export const workers = [
  { id: 'W1', name: '안희진', sid: '20220042', major: '경영학과', dept: '학생지원팀', role: '행정 업무 보조', assigned: 8, worked: 24, rate: '10,850', pay: '1월 지급 완료', attendance: '정상', subs: 1 },
  { id: 'W2', name: '정하늘', sid: '202208765', major: '사회학과', dept: '로욜라도서관', role: '자료실 근로', assigned: 10, worked: 30, rate: '10,850', pay: '1월 지급 완료', attendance: '정상', subs: 0 },
  { id: 'W3', name: '김도윤', sid: '202311111', major: '화학과', dept: '입학처', role: '논술 보조', assigned: 6, worked: 12, rate: '11,000', pay: '지급 예정', attendance: '지각 1회', subs: 2 },
]

// ---- 대타 요청 ----
export const subStats = [
  { key: 'pending', label: '미처리 요청', value: '3건', sub: '승인 대기', icon: 'Clock', tone: 'warning' },
  { key: 'approved', label: '승인 완료', value: '8건', sub: '이번 학기', icon: 'CircleCheck', tone: 'success' },
  { key: 'rejected', label: '반려', value: '1건', sub: '이번 학기', icon: 'CircleX', tone: 'neutral' },
  { key: 'conflict', label: '근무표 충돌', value: '1건', sub: '확인 필요', icon: 'TriangleAlert', tone: 'danger' },
]
export const subRequests = [
  { id: 'R1', requester: '안희진', dept: '학생지원팀', date: '2026.05.28', time: '10:00-13:00', reason: '수강신청', status: '미처리', reqDate: '2026.05.22' },
  { id: 'R2', requester: '김도윤', dept: '입학처', date: '2026.05.29', time: '09:00-12:00', reason: '병원 방문', status: '미처리', reqDate: '2026.05.21' },
  { id: 'R3', requester: '정하늘', dept: '로욜라도서관', date: '2026.05.26', time: '14:00-17:00', reason: '가족 행사', status: '승인', approver: '김서강', reqDate: '2026.05.19' },
]
export const subCandidates = [
  { name: '박민수', dept: '학생지원팀', fit: '높음', reason: '해당 시간 미근무 · 가능 시간 내 포함 · 동일 부서 경험' },
  { name: '최준호', dept: '학생지원팀', fit: '보통', reason: '해당 시간 미근무 · 당일 14:00 근무 예정(연속 근무 가능)' },
]

// ---- 운영 대시보드 ----
export const dashStats = [
  { key: 'rate', label: '충원율', value: '69%', sub: '11 / 16명 배정', icon: 'TrendingUp', tone: 'success' },
  { key: 'appl', label: '지원자 수', value: '39명', sub: '이번 학기 누적', icon: 'Users', tone: 'info' },
  { key: 'pending', label: '미처리 요청', value: '3건', sub: '대타 승인 대기', icon: 'Clock', tone: 'warning' },
  { key: 'conflict', label: '근무표 충돌', value: '1건', sub: '조정 필요', icon: 'TriangleAlert', tone: 'danger' },
]
export const deptFill = [
  { dept: '도서관', filled: 5, total: 5 },
  { dept: '학생식당', filled: 6, total: 8 },
  { dept: '학생지원팀', filled: 2, total: 2 },
  { dept: '입학처', filled: 1, total: 2 },
  { dept: '시설관리팀', filled: 0, total: 3 },
]
export const subTrend = [
  { month: '3월', count: 2 }, { month: '4월', count: 4 }, { month: '5월', count: 3 },
]
