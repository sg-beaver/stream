import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, BellOff, Bookmark } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import Alert from '../components/ui/Alert'
import EmptyState from '../components/ui/EmptyState'
import Card from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import StatusPill from '../components/ui/StatusPill'
import Button from '../components/ui/Button'
import LikeButton from '../components/ui/LikeButton'
import { likedPostStats } from '../data/mockData'
import { postingUiStatus, calcDday, daysUntil, formatDate } from '../utils/format'
import { fetchPostings, fetchMyApplications } from '../api/client'
import { getSessionUser } from '../utils/session'
import { getLikedIds, toggleLikedId } from '../utils/likedPosts'

export default function LikedPostsPage() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [likedIds, setLikedIds] = useState(getLikedIds)
  const [activeStat, setActiveStat] = useState(null)
  // 마감 알림 — 실제 발송 기능 없음, 버튼 클릭 가능 여부만 데모로 구현 (새로고침 시 초기화)
  const [alarms, setAlarms] = useState({})

  useEffect(() => {
    let alive = true
    const isStudent = getSessionUser()?.role === 'student'
    Promise.all([
      fetchPostings(),
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

  function handleToggleLike(postingId) {
    setLikedIds(new Set(toggleLikedId(postingId)))
  }

  function toggleAlarm(postingId) {
    setAlarms(prev => ({ ...prev, [postingId]: !prev[postingId] }))
  }

  const liked = useMemo(() => (posts ?? []).filter(p => likedIds.has(p.posting_id)), [posts, likedIds])

  const stats = useMemo(() => {
    const counts = {
      all: liked.length,
      open: liked.filter(p => postingUiStatus(p) !== 'closed').length,
      soon: liked.filter(p => postingUiStatus(p) === 'closing').length,
      closed: liked.filter(p => postingUiStatus(p) === 'closed').length,
    }
    return likedPostStats.map(s => ({ ...s, value: posts ? String(counts[s.key]) : '–' }))
  }, [liked, posts])

  const filtered = useMemo(() => {
    return liked.filter(p => {
      if (!activeStat) return true
      if (activeStat === 'all') return true
      return postingUiStatus(p) === (activeStat === 'closed' ? 'closed' : activeStat === 'soon' ? 'closing' : 'open')
    })
  }, [liked, activeStat])

  // 마감 임박순 정렬 — 마감일 없는/지난 공고는 뒤로
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = daysUntil(a.deadline)
      const db = daysUntil(b.deadline)
      const va = da === null || da < 0 ? Infinity : da
      const vb = db === null || db < 0 ? Infinity : db
      return va - vb
    })
  }, [filtered])

  return (
    <Shell activeMenu="liked">
      <PageTitle>관심 공고</PageTitle>

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

      {loadError ? (
        <Alert tone="danger" title="관심 공고를 불러오지 못했습니다">{loadError}</Alert>
      ) : !posts ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>불러오는 중...</div>
      ) : liked.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Bookmark size={22} />}
            title="아직 관심 공고가 없습니다"
            message="공고 목록에서 북마크를 눌러 관심 있는 공고를 모아보세요."
            action={<Button onClick={() => navigate('/posts')}>공고 보러가기</Button>}
          />
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text-body)' }}>총 <b style={{ color: 'var(--text-strong)' }}>{filtered.length}개</b>의 관심 공고</div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>마감 임박순 정렬</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sorted.map(post => {
              const status = postingUiStatus(post)
              const closed = status === 'closed'
              const dday = calcDday(post.deadline)
              const alarmOn = !!alarms[post.posting_id]
              return (
                <div key={post.posting_id} style={{
                  background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
                  padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16,
                  opacity: closed ? 0.65 : 1,
                }}>
                  <LikeButton liked onToggle={() => handleToggleLike(post.posting_id)} size={20} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{post.title}</span>
                      <StatusPill status={status} />
                      {dday && !post.applied && (
                        <span style={{
                          fontSize: 12, fontWeight: 800, borderRadius: 10, padding: '3px 10px',
                          color: daysUntil(post.deadline) <= 1 ? 'var(--sogang-red)' : 'var(--warning)',
                          background: daysUntil(post.deadline) <= 1 ? 'var(--sogang-red-50)' : 'var(--warning-50)',
                        }}>{dday}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{post.department_name}</span>
                      <span style={{ color: 'var(--border-default)' }}>|</span>
                      <span>마감 {formatDate(post.deadline)}</span>
                    </div>
                  </div>

                  {!closed && !post.applied && (
                    <button
                      type="button"
                      onClick={() => toggleAlarm(post.posting_id)}
                      title={alarmOn ? '마감 하루 전 알림이 설정되어 있습니다' : '마감 알림 받기'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', flexShrink: 0,
                        background: alarmOn ? 'var(--sogang-red-50)' : 'var(--surface-card)',
                        border: `1px solid ${alarmOn ? 'var(--sogang-red-200)' : 'var(--border-subtle)'}`,
                        borderRadius: 8, fontSize: 12, fontWeight: 600,
                        color: alarmOn ? 'var(--sogang-red)' : 'var(--text-subtle)',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                      }}
                    >
                      {alarmOn ? <BellRing size={14} /> : <BellOff size={14} />}
                      {alarmOn ? '알림 켜짐' : '마감 알림'}
                    </button>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => navigate(`/posts/${post.posting_id}`)}
                      style={{
                        height: 36, padding: '0 14px', background: 'var(--surface-card)', border: '1px solid var(--border-default)',
                        borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-body)',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                      }}
                    >
                      상세보기
                    </button>
                    {post.applied ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px',
                        background: 'var(--info-50)', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--info)',
                      }}>지원완료</span>
                    ) : closed ? (
                      <button disabled style={{
                        height: 36, padding: '0 14px', background: 'var(--neutral-100)', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-subtle)', cursor: 'not-allowed',
                      }}>마감</button>
                    ) : (
                      <button
                        onClick={() => navigate('/apply', { state: { postId: post.posting_id } })}
                        style={{
                          height: 36, padding: '0 16px', background: 'var(--sogang-red)', border: 'none',
                          borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-on-brand)',
                          cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                        }}
                      >
                        바로 지원
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-subtle)' }}>
            알림을 켜둔 공고는 마감 하루 전에 알림을 보내드립니다. 북마크를 다시 누르면 목록에서 제거됩니다.
          </div>
        </>
      )}
    </Shell>
  )
}
