// 관심 공고 — 백엔드 API 없음(API_SPEC.md 미정의), 로컬 저장으로 UI만 구현
const KEY = 'stream_liked_posts'

export function getLikedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY)) ?? [])
  } catch {
    return new Set()
  }
}

export function toggleLikedId(postingId) {
  const ids = getLikedIds()
  if (ids.has(postingId)) ids.delete(postingId)
  else ids.add(postingId)
  localStorage.setItem(KEY, JSON.stringify([...ids]))
  return ids
}
