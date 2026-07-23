import { Bookmark } from 'lucide-react'

// 관심 공고 표시/해제 — 북마크 아이콘 토글 (하트 대신 사용, PostListPage/LikedPostsPage 공용)
export default function LikeButton({ liked, onToggle, size = 18 }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={liked ? '관심 공고에서 제거' : '관심 공고에 추가'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
    >
      <Bookmark
        size={size}
        color={liked ? 'var(--sogang-red)' : '#C9CED4'}
        fill={liked ? 'var(--sogang-red)' : 'none'}
        strokeWidth={1.75}
      />
    </button>
  )
}
