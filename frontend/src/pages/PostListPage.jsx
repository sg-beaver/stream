import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import Shell from '../components/layout/Shell'
import StatCard from '../components/ui/StatCard'
import StatusPill from '../components/ui/StatusPill'
import Button from '../components/ui/Button'
import { posts, postStats } from '../data/mockData'

const CATEGORIES = ['전체', '교내 부서', '도서관', '학과별 사무실']

export default function PostListPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('전체')
  const [activeStat, setActiveStat] = useState(null)
  const [showScheduleMatch, setShowScheduleMatch] = useState(false)

  const filtered = useMemo(() => {
    return posts.filter(p => {
      const matchQuery = !query || p.title.includes(query) || p.org.includes(query) || (p.dept || '').includes(query)
      const matchCat = activeCategory === '전체' || p.category === activeCategory
      const matchStat = !activeStat || (() => {
        if (activeStat === 'total') return true
        if (activeStat === 'open') return p.status === 'open' || p.status === 'closing'
        if (activeStat === 'soon') return p.status === 'closing'
        if (activeStat === 'done') return p.applied
        return true
      })()
      const matchSchedule = !showScheduleMatch || p.scheduleMatch
      return matchQuery && matchCat && matchStat && matchSchedule
    })
  }, [query, activeCategory, activeStat, showScheduleMatch])

  return (
    <Shell activeMenu="posts">
      {/* Page title */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)', lineHeight: 1.2 }}>
          교내 근로 모집 공고
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
          현재 모집 중인 교내 근로 공고를 확인하고 지원하세요.
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {postStats.map(s => (
          <StatCard
            key={s.key}
            stat={s}
            active={activeStat === s.key}
            onClick={() => setActiveStat(prev => prev === s.key ? null : s.key)}
          />
        ))}
      </div>

      {/* Search & filter bar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="stream-input"
            type="text"
            placeholder="공고명, 부서명으로 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', height: 38, paddingLeft: 36, paddingRight: query ? 36 : 12,
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
              background: 'var(--neutral-0)', boxSizing: 'border-box',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showScheduleMatch}
            onChange={e => setShowScheduleMatch(e.target.checked)}
            style={{ accentColor: 'var(--sogang-red)', width: 15, height: 15 }}
          />
          시간표 맞는 공고만 보기
        </label>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: activeCategory === cat ? 700 : 400,
              color: activeCategory === cat ? 'var(--sogang-red)' : 'var(--text-muted)',
              borderBottom: activeCategory === cat ? '2px solid var(--sogang-red)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Post list */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '64px 32px', textAlign: 'center',
          background: 'var(--neutral-0)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Search size={40} color="var(--text-subtle)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-body)', marginBottom: 8 }}>검색 결과가 없습니다</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>다른 검색어나 필터를 사용해 보세요.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(post => (
            <PostCard key={post.id} post={post} onClick={() => navigate(`/posts/${post.id}`)} />
          ))}
        </div>
      )}
    </Shell>
  )
}

function PostCard({ post, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)', padding: '20px 24px',
        cursor: 'pointer', transition: 'box-shadow var(--dur-fast) var(--ease-standard)',
        display: 'flex', alignItems: 'center', gap: 20,
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <StatusPill status={post.status} />
          {post.scheduleMatch && (
            <span style={{ fontSize: 11, color: 'var(--info)', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-pill)', padding: '1px 8px', fontWeight: 600 }}>
              시간 맞음
            </span>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {post.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
          {post.org}{post.dept ? ` · ${post.dept}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-subtle)', flexWrap: 'wrap' }}>
          <span>기간 {post.period}</span>
          <span>근무시간 {post.hours}</span>
          <span>모집인원 {post.headcount}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {post.dday && (
          <div style={{ fontSize: 16, fontWeight: 700, color: post.dday === 'D-1' ? 'var(--danger)' : 'var(--sogang-red)', marginBottom: 4 }}>
            {post.dday}
          </div>
        )}
        {post.applied && (
          <div style={{ fontSize: 12, color: 'var(--info)', fontWeight: 600, marginBottom: 4 }}>지원완료</div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>마감 {post.deadline}</div>
      </div>
    </div>
  )
}
