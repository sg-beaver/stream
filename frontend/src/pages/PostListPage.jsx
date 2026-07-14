import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, BookOpen, MapPin, Building2, LayoutGrid } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import StatCard from '../components/ui/StatCard'
import StatusPill from '../components/ui/StatusPill'
import { posts, postStats } from '../data/mockData'
import { postingUiStatus, calcDday, daysUntil, formatDate } from '../utils/format'

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

  // 통계 카드 수치는 실제 posts 데이터에서 계산 (카드가 필터로 동작하므로 목록과 일치해야 함)
  const stats = useMemo(() => {
    const counts = {
      total: posts.length,
      open: posts.filter(p => postingUiStatus(p) !== 'closed').length,
      soon: posts.filter(p => postingUiStatus(p) === 'closing').length,
      done: posts.filter(p => p.applied).length,
    }
    return postStats.map(s => ({ ...s, value: String(counts[s.key]) }))
  }, [])

  const filtered = useMemo(() => {
    return posts.filter(p => {
      const matchQuery = !query || p.title.includes(query) || p.department_name.includes(query)
      const matchCat = activeCategory === '전체' || p.category === activeCategory
      const matchStat = !activeStat || (() => {
        if (activeStat === 'total') return true
        if (activeStat === 'open') return postingUiStatus(p) !== 'closed'
        if (activeStat === 'soon') return postingUiStatus(p) === 'closing'
        if (activeStat === 'done') return p.applied
        return true
      })()
      const matchSchedule = !showScheduleMatch || p.scheduleMatch
      return matchQuery && matchCat && matchStat && matchSchedule
    })
  }, [query, activeCategory, activeStat, showScheduleMatch])

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
        background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 620 }}>
            <Search size={18} color="#9AA1A9" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="부서명, 업무명, 키워드로 검색하세요"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', height: 44, padding: '0 14px 0 44px',
                border: '1px solid #DADEE3', borderRadius: 8,
                fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
                boxSizing: 'border-box', background: '#fff',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9AA1A9', display: 'flex' }}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4B5563', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showScheduleMatch}
            onChange={e => setShowScheduleMatch(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#B01116' }}
          />
          내 시간표와 맞는 공고만 보기
        </label>
      </div>

      {/* Category chips */}
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
                background: on ? '#FDECEC' : '#fff',
                border: '1px solid ' + (on ? '#EBB9B8' : '#E6E8EB'),
                borderRadius: 8, fontSize: 14, fontWeight: 600,
                color: on ? '#B01116' : '#4B5563',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              <CatIcon size={16} color={on ? '#B01116' : '#8A929B'} strokeWidth={1.75} />
              {label}
            </button>
          )
        })}
      </div>

      {/* 결과 수 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: '#4B5563' }}>
          총 <b style={{ color: '#1F2937' }}>{filtered.length}개</b>의 공고
        </div>
        {query && <div style={{ fontSize: 13, color: '#9AA1A9' }}>"{query}" 검색 결과</div>}
      </div>

      {/* Post table */}
      {filtered.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12,
          padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937', marginBottom: 8 }}>조건에 맞는 공고가 없습니다</div>
          <div style={{ fontSize: 14, color: '#6B7280' }}>다른 검색어나 필터를 사용해 보세요.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[
                  { label: '상태', w: 84 },
                  { label: '공고명 · 부서' },
                  { label: '근무시간', w: 170 },
                  { label: '모집인원', w: 84 },
                  { label: '마감', w: 150 },
                  { label: '시간표 일치', w: 80 },
                  { label: '관리', w: 120 },
                ].map(({ label, w }) => (
                  <th key={label} style={{
                    padding: '11px 16px', fontSize: 13, fontWeight: 700,
                    color: '#32363A', textAlign: 'center', whiteSpace: 'nowrap',
                    width: w, background: '#dfd5c7',
                    border: '1px solid #ccbda7',
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
                  onMouseEnter={e => e.currentTarget.style.background = '#FBF8EE'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid #E5E5E5' }}>
                    <StatusPill status={postingUiStatus(post)} />
                  </td>
                  <td style={{ padding: '13px 16px', border: '1px solid #E5E5E5' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#32363A' }}>{post.title}</div>
                    <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 3 }}>
                      {post.department_name}
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: '#32363A', border: '1px solid #E5E5E5' }}>{post.hours}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: '#32363A', fontWeight: 600, border: '1px solid #E5E5E5' }}>{post.headcount}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid #E5E5E5' }}>
                    {dday && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: daysUntil(post.deadline) <= 1 ? '#B01116' : '#D9791F', marginBottom: 2 }}>{dday}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#32363A' }}>{formatDate(post.deadline)}</div>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid #E5E5E5' }}>
                    {post.scheduleMatch
                      ? <span style={{ fontSize: 12, color: '#1F8A4C', fontWeight: 700 }}>✓ 일치</span>
                      : <span style={{ fontSize: 12, color: '#C9CED4' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', border: '1px solid #E5E5E5' }}>
                    <button
                      onClick={() => navigate(`/posts/${post.posting_id}`)}
                      style={{
                        padding: '6px 14px', border: '1px solid #B01116', borderRadius: 6,
                        background: post.applied ? '#B01116' : '#fff',
                        color: post.applied ? '#fff' : '#B01116',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
    </Shell>
  )
}
