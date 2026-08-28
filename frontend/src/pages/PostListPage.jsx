import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, BookOpen, MapPin, Building2, LayoutGrid, AlertCircle } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import Checkbox from '../components/ui/Checkbox'
import Alert from '../components/ui/Alert'
import EmptyState from '../components/ui/EmptyState'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import StatCard from '../components/ui/StatCard'
import StatusPill from '../components/ui/StatusPill'
import LikeButton from '../components/ui/LikeButton'
import { postStats } from '../data/mockData'
import { postingUiStatus, calcDday, daysUntil, formatDate } from '../utils/format'
import { fetchPostings, fetchMyApplications } from '../api/client'
import { getSessionUser } from '../utils/session'
import { getLikedIds, toggleLikedId } from '../utils/likedPosts'

const CATEGORIES = [
  { label: '전체', icon: LayoutGrid },
  { label: '도서관', icon: BookOpen },
  { label: '학과별 사무실', icon: MapPin },
  { label: '교내 부서', icon: Building2 },
]

export default function PostListPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('전체')
  const [activeStat, setActiveStat] = useState(null)
  const [showScheduleMatch, setShowScheduleMatch] = useState(false)
  const [posts, setPosts] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [likedIds, setLikedIds] = useState(getLikedIds)

  function handleToggleLike(postingId) {
    setLikedIds(new Set(toggleLikedId(postingId)))
  }

  useEffect(() => {
    let alive = true
    const isStudent = getSessionUser()?.role === 'student'
    Promise.all([
      fetchPostings(),
      // 내가 지원한 공고 표시용 — 실패해도 목록은 보여준다
      isStudent ? fetchMyApplications().catch(() => []) : Promise.resolve([]),
    ])
      .then(([postings, applications]) => {
        if (!alive) return
        const appliedMap = new Map(applications.map(a => [a.posting_id, a.application_id]))
        setPosts(postings.map(p => ({
          ...p,
          applied: appliedMap.has(p.posting_id),
          application_id: appliedMap.get(p.posting_id),
        })))
      })
      .catch(err => { if (alive) setLoadError(err.message) })
    return () => { alive = false }
  }, [])

  // 카테고리/시간표 일치는 API 응답에 아직 없는 필드 — 데이터가 생기면 자동 노출 (#19)
  const hasCategory = useMemo(() => (posts ?? []).some(p => p.category), [posts])
  const hasScheduleMatch = useMemo(() => (posts ?? []).some(p => p.schedule_match != null), [posts])

  // 통계 카드 수치는 실제 posts 데이터에서 계산 (카드가 필터로 동작하므로 목록과 일치해야 함)
  const stats = useMemo(() => {
    const list = posts ?? []
    const counts = {
      total: list.length,
      open: list.filter(p => postingUiStatus(p) !== 'closed').length,
      soon: list.filter(p => postingUiStatus(p) === 'closing').length,
      done: list.filter(p => p.applied).length,
    }
    return postStats.map(s => ({ ...s, value: posts ? String(counts[s.key]) : '–' }))
  }, [posts])

  const filtered = useMemo(() => {
    return (posts ?? []).filter(p => {
      const matchQuery = !query || p.title.includes(query) || (p.department_name ?? '').includes(query)
      const matchCat = activeCategory === '전체' || p.category === activeCategory
      const matchStat = !activeStat || (() => {
        if (activeStat === 'total') return true
        if (activeStat === 'open') return postingUiStatus(p) !== 'closed'
        if (activeStat === 'soon') return postingUiStatus(p) === 'closing'
        if (activeStat === 'done') return p.applied
        return true
      })()
      const matchSchedule = !showScheduleMatch || p.schedule_match
      return matchQuery && matchCat && matchStat && matchSchedule
    })
  }, [posts, query, activeCategory, activeStat, showScheduleMatch])

  return (
    <Shell activeMenu="posts">
      <PageTitle>교내 근로 모집 공고</PageTitle>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {stats.map(s => (
          <StatCard
            key={s.key}
            stat={s}
            active={activeStat === s.key}
            onClick={() => setActiveStat(prev => prev === s.key ? null : s.key)}
          />
        ))}
      </div>

      {/* Search & filter card */}
      <div style={{
        background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: hasScheduleMatch ? 14 : 0 }}>
          <Input
            size="lg"
            type="text"
            placeholder="부서명, 업무명, 키워드로 검색하세요"
            value={query}
            onChange={e => setQuery(e.target.value)}
            iconLeft={<Search size={18} />}
            iconRight={query
              ? <button onClick={() => setQuery('')} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}><X size={15} /></button>
              : null}
            style={{ flex: 1, maxWidth: 620 }}
          />
        </div>
        {hasScheduleMatch && (
          <Checkbox
            checked={showScheduleMatch}
            onChange={e => setShowScheduleMatch(e.target.checked)}
            label="내 시간표와 맞는 공고만 보기"
          />
        )}
      </div>

      {/* Category chips */}
      {hasCategory && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {CATEGORIES.map(({ label, icon: CatIcon }) => {
            const on = activeCategory === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveCategory(label)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46,
                  background: on ? 'var(--sogang-red-50)' : 'var(--surface-card)',
                  border: '1px solid ' + (on ? 'var(--sogang-red-200)' : 'var(--border-subtle)'),
                  borderRadius: 8, fontSize: 'var(--fs-body)', fontWeight: 600,
                  color: on ? 'var(--sogang-red)' : 'var(--text-body)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}
              >
                <CatIcon size={16} color={on ? 'var(--sogang-red)' : 'var(--text-muted)'} strokeWidth={1.75} />
                {label}
              </button>
            )
          })}
        </div>
      )}

      {loadError ? (
        <Alert tone="danger" title="공고를 불러오지 못했습니다" icon={<AlertCircle size={15} />}>{loadError}</Alert>
      ) : !posts ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>공고를 불러오는 중...</div>
      ) : (
        <>
          {/* 결과 수 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-body)' }}>
              총 <b style={{ color: 'var(--text-strong)' }}>{filtered.length}개</b>의 공고
            </div>
            {query && <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>"{query}" 검색 결과</div>}
          </div>

          {/* Post table */}
          {filtered.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<Search size={22} />}
                title="조건에 맞는 공고가 없습니다"
                message="다른 검색어나 필터를 사용해 보세요."
              />
            </Card>
          ) : (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: '상태', w: 84 },
                      { label: '공고명 · 부서' },
                      { label: '게시일', w: 130 },
                      { label: '마감', w: 150 },
                      { label: '관심', w: 64 },
                      { label: '관리', w: 120 },
                    ].map(({ label, w }) => (
                      <th key={label} style={{
                        padding: '11px 16px', fontSize: 'var(--fs-body)', fontWeight: 700,
                        color: 'var(--text-strong)', textAlign: 'center', whiteSpace: 'nowrap',
                        width: w, background: 'var(--saint-tan)',
                        border: '1px solid var(--saint-tan-strong)',
                      }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((post) => {
                    const dday = calcDday(post.deadline)
                    return (
                    <tr
                      key={post.posting_id}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--saint-row-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <StatusPill status={postingUiStatus(post)} />
                      </td>
                      <td style={{ padding: '13px 16px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>{post.title}</div>
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', marginTop: 3 }}>
                          {post.department_name}
                        </div>
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--text-strong)', border: '1px solid var(--border-subtle)' }}>{formatDate(post.upload_date)}</td>
                      <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        {dday && (
                          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: daysUntil(post.deadline) <= 1 ? 'var(--sogang-red)' : 'var(--warning)', marginBottom: 2 }}>{dday}</div>
                        )}
                        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-strong)' }}>{formatDate(post.deadline)}</div>
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <LikeButton liked={likedIds.has(post.posting_id)} onToggle={() => handleToggleLike(post.posting_id)} />
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <button
                          onClick={() => navigate(`/posts/${post.posting_id}`)}
                          style={{
                            padding: '6px 14px', border: '1px solid var(--sogang-red)', borderRadius: 6,
                            background: post.applied ? 'var(--sogang-red)' : 'var(--surface-card)',
                            color: post.applied ? 'var(--text-on-brand)' : 'var(--sogang-red)',
                            fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {post.applied ? '지원완료' : '공고 보기'}
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
