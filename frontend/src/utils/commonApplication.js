// 공통 지원서 — 경력·어학·자격증·기본 인적사항은 아직 백엔드 API가 없어(API_SPEC.md 미정의)
// 로컬 저장으로만 구현되어 있다 (계정/기기를 바꾸면 초기화됨). 근무 가능 시간(availableSlots)과
// 수업 시간은 이제 서버(available_time·class_time)가 원본이며, 이 파일이 다루는 localStorage
// 스키마는 나머지 이력 항목만을 위한 것이다 — CommonApplicationPage.jsx 참고.
const KEY = 'stream_common_application'

export const CAREER_TYPES = ['교내근로', '인턴', '대외활동', '동아리', '봉사', '아르바이트', '기타']

// 학기/재학상태도 SAINT 연동 대상 — 데모용 mock
export const MOCK_ACADEMIC_INFO = { semester: '7학기', enrollStatus: '재학 중' }

// 경력·활동 / 어학성적 / 자격증 표 — 새 행 생성 함수 + 컬럼 정의 (공통 지원서 · 지원서 작성 화면 공용)
export function newCareerRow() {
  return { id: 'c' + Date.now() + Math.random(), type: '', org: '', role: '', periodStart: '', periodEnd: '', detail: '' }
}
export function newLanguageRow() {
  return { id: 'l' + Date.now() + Math.random(), test: '', score: '', grade: '', date: '' }
}
export function newCertificateRow() {
  return { id: 'ct' + Date.now() + Math.random(), name: '', org: '', regNumber: '', date: '' }
}

export const CAREER_COLUMNS = [
  { key: 'type', label: '구분', w: 100, type: 'select', options: CAREER_TYPES },
  { key: 'org', label: '기관', w: 140, placeholder: '기관명' },
  { key: 'role', label: '직책', w: 90, placeholder: '직책' },
  { key: 'periodStart', keys: ['periodStart', 'periodEnd'], label: '활동기간', w: 300, type: 'daterange' },
  { key: 'detail', label: '세부내용', placeholder: '담당 업무, 성과 등' },
]

export const LANGUAGE_COLUMNS = [
  { key: 'test', label: '공인시험', placeholder: '예: TOEIC' },
  { key: 'score', label: '점수', w: 90, placeholder: '예: 900' },
  { key: 'grade', label: '등급', w: 90, placeholder: '예: IH' },
  { key: 'date', label: '취득일자', w: 160, type: 'date', placeholder: 'YYYY.MM.DD' },
]

export const CERTIFICATE_COLUMNS = [
  { key: 'name', label: '자격증명', placeholder: '예: ADsP' },
  { key: 'org', label: '발급처', placeholder: '예: 한국데이터산업진흥원' },
  { key: 'regNumber', label: '등록번호', w: 110, placeholder: '(선택)' },
  { key: 'date', label: '취득일자', w: 160, type: 'date', placeholder: 'YYYY.MM.DD' },
]

const EMPTY = {
  basic: { major: '', phone: '', email: '' },
  careers: [],
  languages: [],
  certificates: [],
  availableSlots: [],
}

// 작성된 적 없으면 null — "불러오기"에서 작성 여부를 구분하는 데 사용
export function getCommonApplication() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    return null
  }
}

export function saveCommonApplication(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function emptyCommonApplication() {
  return {
    basic: { ...EMPTY.basic },
    careers: [],
    languages: [],
    certificates: [],
    availableSlots: [],
  }
}
