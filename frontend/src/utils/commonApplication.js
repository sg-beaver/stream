// 공통 지원서 — 기본 인적사항·경력·어학·자격증은 서버가 원본이다 (#122,
// GET/PUT /api/students/me/common-application). 이 파일은 표 컬럼 정의 같은 UI 상수와,
// 화면 행 구조 ↔ API 스키마 변환만 담당한다.
//
// 화면 행에는 React key와 RowTable의 행 식별용 id가 필요하지만 API에는 없다 —
// 불러올 때 붙이고 저장할 때 떼어낸다. 날짜도 화면은 YYYY.MM.DD, API는 ISO를 쓴다.

// 관심 분야 선택지 — uiux ui_kits/student 기준. 고른 분야의 공고가 우선 추천된다는 안내와 함께 쓴다.
export const INTEREST_OPTIONS = [
  '행정/사무 보조', '도서/자료 정리', '미디어/콘텐츠', 'IT/전산',
  '민원 응대', '튜터링/교육', '행사 운영', '연구 보조',
]

export const CAREER_TYPES = ['교내근로', '인턴', '대외활동', '동아리', '봉사', '아르바이트', '기타']

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

// ---- API ↔ 화면 행 변환 ----

const isoToDots = iso => (iso ? String(iso).slice(0, 10).replaceAll('-', '.') : '')
const dotsToIso = dots => {
  const t = (dots ?? '').trim().replaceAll('.', '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

let _rowSeq = 0
const nextId = prefix => `${prefix}${++_rowSeq}`

export function emptyCommonApplication() {
  return { basic: { phone: '', email: '', interests: [] }, careers: [], languages: [], certificates: [], availableSlots: [] }
}

/** GET 응답 → 화면 상태. basic의 SAINT 학적 항목은 읽기 전용이라 그대로 들고 다닌다. */
export function commonApplicationFromApi(res) {
  return {
    basic: { ...res.basic, phone: res.basic.phone ?? '', email: res.basic.email ?? '', interests: res.basic.interests ?? [] },
    careers: (res.careers ?? []).map(c => ({
      id: nextId('c'),
      type: c.career_type ?? '', org: c.organization ?? '', role: c.role ?? '',
      periodStart: isoToDots(c.period_start), periodEnd: isoToDots(c.period_end),
      detail: c.detail ?? '',
    })),
    languages: (res.languages ?? []).map(l => ({
      id: nextId('l'),
      test: l.test_name ?? '', score: l.score ?? '', grade: l.grade ?? '',
      date: isoToDots(l.acquired_at),
    })),
    certificates: (res.certificates ?? []).map(c => ({
      id: nextId('ct'),
      name: c.name ?? '', org: c.issuer ?? '', regNumber: c.registration_number ?? '',
      date: isoToDots(c.acquired_at),
    })),
    availableSlots: [],
  }
}

/** 화면 상태 → PUT 본문. 학과·학기 등 SAINT 항목은 서버가 받지 않으므로 보내지 않는다. */
export function commonApplicationToApi(data) {
  const filled = (rows, keys) => rows.filter(r => keys.some(k => (r[k] ?? '').trim?.() !== '' && r[k] != null))
  return {
    basic: { phone: data.basic.phone || null, email: data.basic.email || null, interests: data.basic.interests ?? [] },
    careers: filled(data.careers, ['type', 'org', 'role', 'detail']).map(c => ({
      career_type: c.type || null, organization: c.org || null, role: c.role || null,
      period_start: dotsToIso(c.periodStart), period_end: dotsToIso(c.periodEnd),
      detail: c.detail || null,
    })),
    languages: filled(data.languages, ['test', 'score', 'grade']).map(l => ({
      test_name: l.test || null, score: l.score || null, grade: l.grade || null,
      acquired_at: dotsToIso(l.date),
    })),
    certificates: filled(data.certificates, ['name', 'org', 'regNumber']).map(c => ({
      name: c.name || null, issuer: c.org || null, registration_number: c.regNumber || null,
      acquired_at: dotsToIso(c.date),
    })),
  }
}
