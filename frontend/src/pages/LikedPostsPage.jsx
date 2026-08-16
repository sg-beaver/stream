import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, BellOff, Bookmark } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
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
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
        공고 목록에서 <Bookmark size={12} style={{ verticalAlign: -1 }} />를 누른 공고를 한곳에서 관리하세요. 마감이 임박한 순으로 보여드립니다.
      </p>

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
        <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 12, padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>관심 공고를 불러오지 못했습니다</div>
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{loadError}</div>
        </div>
      ) : !posts ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: '#9AA1A9' }}>불러오는 중...</div>
      ) : liked.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
          <span style={{
            width: 64, height: 64, borderRadius: '50%', background: 'var(--danger-50)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Bookmark size={28} color="var(--sogang-red)" />
          </span>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }}>아직 관심 공고가 없습니다</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>공고 목록에서 북마크를 눌러 관심 있는 공고를 모아보세요.</div>
          <Button onClick={() => navigate('/posts')}>공고 보러가기</Button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: '#4B5563' }}>총 <b style={{ color: '#1F2937' }}>{filtered.length}개</b>의 관심 공고</div>
            <div style={{ fontSize: 13, color: '#9AA1A9' }}>마감 임박순 정렬</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sorted.map(post => {
              const status = postingUiStatus(post)
              const closed = status === 'closed'
              const dday = calcDday(post.deadline)
              const alarmOn = !!alarms[post.posting_id]
              return (
                <div key={post.posting_id} style={{
                  background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12,
                  padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16,
                  opacity: closed ? 0.65 : 1,
                }}>
                  <LikeButton liked onToggle={() => handleToggleLike(post.posting_id)} size={20} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{post.title}</span>
                      <StatusPill status={status} />
                      {dday && !post.applied && (
                        <span style={{
                          fontSize: 12, fontWeight: 800, borderRadius: 10, padding: '3px 10px',
                          color: daysUntil(post.deadline) <= 1 ? '#B01116' : '#D9791F',
                          background: daysUntil(post.deadline) <= 1 ? '#FDECEC' : '#FDEEE0',
                        }}>{dday}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{post.department_name}</span>
                      <span style={{ color: '#D5D8DC' }}>|</span>
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
                        background: alarmOn ? '#FDECEC' : '#fff',
                        border: `1px solid ${alarmOn ? '#EBB9B8' : '#E6E8EB'}`,
                        borderRadius: 8, fontSize: 12, fontWeight: 600,
                        color: alarmOn ? 'var(--sogang-red)' : '#9AA1A9',
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
                        height: 36, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3',
                        borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#3A4048',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                      }}
                    >
                      상세보기
                    </button>
                    {post.applied ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px',
                        background: '#E8F0FB', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#2563C9',
                      }}>지원완료</span>
                    ) : closed ? (
                      <button disabled style={{
                        height: 36, padding: '0 14px', background: '#EEF0F2', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#9AA1A9', cursor: 'not-allowed',
                      }}>마감</button>
                    ) : (
                      <button
                        onClick={() => navigate('/apply', { state: { postId: post.posting_id } })}
                        style={{
                          height: 36, padding: '0 16px', background: 'var(--sogang-red)', border: 'none',
                          borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff',
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

          <div style={{ marginTop: 16, fontSize: 12, color: '#9AA1A9' }}>
            알림을 켜둔 공고는 마감 하루 전에 알림을 보내드립니다. 북마크를 다시 누르면 목록에서 제거됩니다.
          </div>
        </>
      )}
    </Shell>
  )
}
