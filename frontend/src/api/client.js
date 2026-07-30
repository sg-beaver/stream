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
