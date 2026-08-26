// 백엔드 API 클라이언트 (docs/API_SPEC.md 기준)
import { getSessionUser } from '../utils/session'
import { devMockFallback } from './devMockFallback'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const user = getSessionUser()
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data = null
  try {
    data = await res.json()
  } catch {
    // 본문 없는 응답 (혹은 JSON 아님)
  }

  if (!res.ok) {
    // 개발 중 백엔드 미실행으로 인한 응답(빈 본문의 5xx, 보통 Vite 프록시 연결 실패)은
    // 화면 작업을 위해 mock 데이터로 대체한다. 배포 빌드나 실제 백엔드 에러(본문 있는 응답)는 해당 없음.
    if (import.meta.env.DEV && res.status >= 500 && !data) {
      const fallback = devMockFallback(path, method)
      if (fallback !== undefined) {
        console.warn(`[dev-mock] 백엔드 연결 실패 → mock 데이터로 대체: ${method} ${path}`)
        return fallback
      }
    }

    // 백엔드 에러 응답: { "error": "..." } (422 검증 오류는 { "detail": [...] })
    const message =
      data?.error ??
      (typeof data?.detail === 'string' ? data.detail : null) ??
      `요청에 실패했습니다. (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data
}

// ---- 인증 ----
export const login = (id, password, role) =>
  api('/auth/login', { method: 'POST', body: { id, password, role } })

// ---- 공고 ----
export const fetchPostings = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString()
  return api(`/postings${qs ? `?${qs}` : ''}`)
}
export const fetchPosting = postingId => api(`/postings/${postingId}`)
// 직원 전용 (REQ-POST-001/010)
export const createPosting = payload => api('/postings', { method: 'POST', body: payload })
export const updatePosting = (postingId, payload) =>
  api(`/postings/${postingId}`, { method: 'PATCH', body: payload })

// ---- 지원 ----
export const fetchMyApplications = () => api('/applications/me')
export const submitApplication = (postingId, coverLetter) =>
  api('/applications', { method: 'POST', body: { posting_id: postingId, cover_letter: coverLetter } })
// 직원 전용 (REQ-APP-005/006)
export const fetchApplicants = postingId => api(`/applications/posting/${postingId}`)
export const updateApplicationStatus = (applicationId, status) =>
  api(`/applications/${applicationId}/status`, { method: 'PATCH', body: { status } })

// ---- 가능시간 · 근무표 (REQ-SCHED, #56) ----
const withQuery = (path, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString()
  return `${path}${qs ? `?${qs}` : ''}`
}

// 학생 전용: 근무 가능 시간 등록 (REQ-SCHED-001)
export const createAvailability = payload =>
  api('/availability', { method: 'POST', body: payload })

// 학생 전용: 본인 가능 시간 슬롯 조회 — "요일-HH:00" 형태 (REQ-SCHED-014)
export const fetchMyAvailability = () => api('/availability/me')

// 학생 전용: 본인 가능 시간 슬롯 통째로 교체 (REQ-SCHED-014)
export const replaceMyAvailability = slots =>
  api('/availability/me', { method: 'PUT', body: { slots } })

// 직원 전용: 부서 소속(합격) 학생들의 가능시간 수합 (REQ-SCHED-002)
export const fetchDepartmentAvailability = departmentId =>
  api(`/availability/department/${departmentId}`)

// 직원 전용: 합격자의 지원서 체크 시간을 수합에 연동 (REQ-SCHED-012)
export const importAvailabilityFromApplications = departmentId =>
  api(`/availability/department/${departmentId}/import-from-applications`, { method: 'POST' })

// 학생 전용: 본인 수업 시간 슬롯 조회 — "요일-HH:00" 형태 (REQ-SCHED-015)
export const fetchMyClassTime = () => api('/class-time/me')

// 학생 전용: 본인 수업 시간 슬롯 통째로 교체 (REQ-SCHED-015)
export const replaceMyClassTime = slots =>
  api('/class-time/me', { method: 'PUT', body: { slots } })

// 직원 전용: 부서 소속 학생들의 수업 시간 전체 조회 (REQ-SCHED-015)
export const fetchDepartmentClassTime = departmentId =>
  api(`/class-time/department/${departmentId}`)

// 직원 전용: 부서 스케줄링 정책(개관 시간대·슬롯 길이) — 시간표 그리드 세로축 기준
export const fetchDepartmentPolicy = departmentId =>
  api(`/schedule/policy/${departmentId}`)

// 직원 전용: 부서 스케줄링 정책 수정 — 보낸 항목만 반영
// (opening_hours는 30분 단위·보낸 기간만 교체, min_per_slot·max_per_slot은 배정 인원)
export const updateDepartmentPolicy = (departmentId, patch) =>
  api(`/schedule/policy/${departmentId}`, { method: 'PATCH', body: patch })

// 직원 전용: 제약조건 기반 근무표 생성 — 결과는 초안 (REQ-SCHED-006/009)
export const generateSchedule = payload =>
  api('/schedule/generate', { method: 'POST', body: payload })

// 직원 전용: draft 배치 AI 검토 — 부서 운영 규칙(custom_rules) 기준 (REQ-SCHED-016).
// 규칙 미등록·AI 실패도 200으로 오고 review_available=false + reason만 담긴다 (조용한 실패)
export const reviewSchedule = batchId =>
  api('/schedule/review', { method: 'POST', body: { batch_id: batchId } })

// 직원 전용: 담당자가 고른 배정안을 확정 저장 (REQ-SCHED-009)
export const confirmSchedule = payload =>
  api('/schedule/confirm', { method: 'POST', body: payload })

// 직원 전용: 기존 근로 학생 수동 등록 (REQ-SCHED-008)
export const createManualSchedule = payload =>
  api('/schedule/manual', { method: 'POST', body: payload })

// 직원 전용: 부서 확정 근무표 조회 (REQ-SCHED-007)
export const fetchDepartmentSchedule = (departmentId, params = {}) =>
  api(withQuery(`/schedule/department/${departmentId}`, params))

// 학생 전용: 본인 확정 근무표 조회 (REQ-SCHED-007)
export const fetchMySchedule = (params = {}) => api(withQuery('/schedule/me', params))

// ---- 대타 (REQ-SUB) ----
// 학생 전용: 본인 확정 근무에 대한 대타 요청 등록 (REQ-SUB-001)
export const createSubstituteRequest = (scheduleId, reason) =>
  api('/substitute-requests', { method: 'POST', body: { schedule_id: scheduleId, reason } })

// 학생 전용: 내가 올린 요청 + 내가 대타로 지목·수락된 요청 (요청 기록·시간표 대타 표시용)
export const fetchMySubstituteRequests = () => api('/substitute-requests/me')

// 학생 전용: 내가 후보인 대기 중 요청 — '받은 요청' 화면용 (REQ-SUB-002 조건과 동일)
export const fetchOpenSubstituteRequests = () => api('/substitute-requests/open')

// 학생 전용: 후보로서 수락/거절 응답 (REQ-SUB-003) — response는 '수락' | '거절'
export const respondToSubstituteRequest = (requestId, substituteId, response) =>
  api(`/substitute-requests/${requestId}/respond`, {
    method: 'PATCH', body: { substitute_id: substituteId, response },
  })

// 직원 전용: 부서 근무에 걸린 대타 요청 전체 조회 (REQ-SUB-007)
export const fetchDepartmentSubstituteRequests = departmentId =>
  api(`/substitute-requests/department/${departmentId}`)

// 학생/직원 공용: 대타 후보 탐색 (REQ-SUB-002)
export const fetchSubstituteCandidates = requestId =>
  api(`/substitute-requests/${requestId}/candidates`)

// 직원 전용: 대타 요청 최종 승인 — 후보가 이미 수락(status="수락")한 요청만 가능 (REQ-SUB-004/005/006)
export const approveSubstituteRequest = requestId =>
  api(`/substitute-requests/${requestId}/approve`, { method: 'PATCH' })

// 직원 전용: 승인 전(대기·수락) 요청을 사유와 함께 반려 (REQ-SUB-008)
export const rejectSubstituteRequest = (requestId, rejectReason) =>
  api(`/substitute-requests/${requestId}/reject`, {
    method: 'PATCH', body: { reject_reason: rejectReason },
  })
