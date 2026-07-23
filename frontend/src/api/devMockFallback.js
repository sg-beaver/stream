// api/client.js 전용 — 개발 중 백엔드가 응답하지 않을 때만 사용되는 폴백.
// DEV 빌드에서만 참조되며, 배포/실제 백엔드 연동 경로에는 전혀 영향을 주지 않는다.
import { posts, postDetails, myApplications } from './devMockData'

let nextApplicationId = 100

// 매칭되는 경로가 없으면 undefined를 반환 — 호출부에서 원래 에러를 그대로 던지게 한다.
export function devMockFallback(path, method) {
  if (method === 'GET' && path === '/postings') return posts

  const detailMatch = path.match(/^\/postings\/(\d+)$/)
  if (method === 'GET' && detailMatch) return postDetails[detailMatch[1]] ?? null

  if (method === 'GET' && path === '/applications/me') return myApplications

  if (method === 'POST' && path === '/applications') {
    return { application_id: nextApplicationId++, status: '제출완료', submitted_at: new Date().toISOString() }
  }

  return undefined
}
