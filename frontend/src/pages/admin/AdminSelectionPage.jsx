import { useEffect, useState } from 'react'
import { ChevronLeft, IdCard, CalendarDays, Building2 } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Tabs from '../../components/ui/Tabs'
import StatusPill from '../../components/ui/StatusPill'
import TimeGrid from '../../components/ui/TimeGrid'
import { AdminPanel } from '../../components/admin/AdminPanel'
import { fetchPostings, fetchPosting, fetchApplicants, updateApplicationStatus, fetchDepartmentPolicy } from '../../api/client'
import { getSessionUser } from '../../utils/session'
import { parseCoverLetter } from '../../utils/coverLetter'
import { formatDateTime, applicationUiStatus } from '../../utils/format'

// 지원 상태는 스펙 값(제출완료/검토중/합격/불합격)을 그대로 사용
const TABS = [
  { id: 'all', label: '전체' }, { id: '제출완료', label: '제출완료' }, { id: '검토중', label: '검토중' },
  { id: '합격', label: '합격' }, { id: '불합격', label: '불합격' },
]

export default function AdminSelectionPage() {
  const user = getSessionUser()

  const [posts, setPosts] = useState(null) // null = 로딩 중
  const [postsError, setPostsError] = useState('')
  const [postingId, setPostingId] = useState(null)
  const [applicants, setApplicants] = useState(null)
  const [applicantsError, setApplicantsError] = useState('')
  // 공고 상세(필요 시간대 work_slots)는 목록 응답에 없어 따로 조회한다 —
  // 지원자의 가능 시간이 공고가 요구하는 시간과 맞는지 선발 단계에서 보기 위함
  const [postDetail, setPostDetail] = useState(null)
  // 시간표 세로축은 부서 개관 시간 기준 — 공고가 이른 아침·야간 슬롯을 요구해도 그리드에 나와야 한다
  const [policy, setPolicy] = useState(null)
  const [tab, setTab] = useState('all')
  const [detailId, setDetailId] = useState(null)

  // 담당자는 하나의 부서 소속이므로, 세션의 부서가 등록한 공고만 다룸
  useEffect(() => {
    let alive = true
    fetchPostings({ department_id: user?.department_id })
      .then(data => {
        if (!alive) return
        setPosts(data)
        if (data.length > 0) setPostingId(data[0].posting_id)
      })
      .catch(err => { if (alive) setPostsError(err.message) })
    if (user?.department_id) {
      fetchDepartmentPolicy(user.department_id)
        .then(data => { if (alive) setPolicy(data) })
        .catch(() => { if (alive) setPolicy(null) })
    }
    return () => { alive = false }
  }, [user?.department_id])

  // 공고 선택 시 해당 공고의 지원자 목록 로드
  useEffect(() => {
    if (!postingId) return
    let alive = true
    setApplicants(null)
    setApplicantsError('')
    setPostDetail(null)
    fetchApplicants(postingId)
      .then(data => { if (alive) setApplicants(data) })
      .catch(err => { if (alive) setApplicantsError(err.message) })
    fetchPosting(postingId)
      .then(data => { if (alive) setPostDetail(data) })
      .catch(() => { if (alive) setPostDetail(null) })
    return () => { alive = false }
  }, [postingId])

  // 합격/불합격 처리 — 응답 반영 후 목록 갱신
  const decide = async (applicationId, status) => {
    const updated = await updateApplicationStatus(applicationId, status)
    setApplicants(as => (as ?? []).map(a => a.application_id === applicationId ? { ...a, ...updated } : a))
  }

  // 상세보기를 열람하면 "제출완료" 상태를 "검토중"으로 자동 전환한다.
  // 전환 실패해도 열람 자체는 막지 않는다 (부가 효과일 뿐 핵심 동작이 아님).
  const openDetail = applicationId => {
    setDetailId(applicationId)
    const current = (applicants ?? []).find(x => x.application_id === applicationId)
    if (current?.status === '제출완료') decide(applicationId, '검토중').catch(() => {})
  }

  const selectedPost = postDetail ?? (posts ?? []).find(p => p.posting_id === postingId)

  if (detailId) {
    const a = (applicants ?? []).find(x => x.application_id === detailId)
    return (
      <AdminShell activeMenu="selection">
        {a ? (
          <ApplicantDetail applicant={a} post={selectedPost} policy={policy} onBack={() => setDetailId(null)} onDecide={status => decide(detailId, status)} />
        ) : (
          <button onClick={() => setDetailId(null)} style={backBtnStyle}><ChevronLeft size={17} /> 지원자 목록으로</button>
        )}
      </AdminShell>
    )
  }

  const shown = (applicants ?? []).filter(a => tab === 'all' || a.status === tab)
  const count = id => id === 'all' ? (applicants ?? []).length : (applicants ?? []).filter(a => a.status === id).length

  return (
    <AdminShell activeMenu="selection">
      <PageTitle>학생 선발</PageTitle>

      {postsError ? (
        <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>공고 목록을 불러오지 못했습니다</div>
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{postsError}</div>
        </div>
      ) : !posts ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>공고 목록을 불러오는 중...</div>
      ) : posts.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>담당 부서의 공고가 없습니다.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {posts.map(p => (
              <button key={p.posting_id} onClick={() => { setPostingId(p.posting_id); setTab('all'); }} style={filterChip(postingId === p.posting_id)}>
                {p.title} <span style={{ fontSize: 11 }}>({p.status})</span>
              </button>
            ))}
          </div>

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <Tabs
              tabs={TABS.map(t => ({ ...t, badge: count(t.id) }))}
              active={tab}
              onChange={setTab}
              style={{ padding: '10px 16px 0' }}
            />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--saint-tan)' }}>
                  {th('지원자')}{th('지원 공고')}{th('지원일', 'center', 170)}{th('상태', 'center', 100)}{th('', 'center', 100)}
                </tr>
              </thead>
              <tbody>
                {applicantsError ? (
                  <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--danger)' }}>지원자 목록을 불러오지 못했습니다. {applicantsError}</td></tr>
                ) : !applicants ? (
                  <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>지원자 목록을 불러오는 중...</td></tr>
                ) : shown.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>해당 조건의 지원자가 없습니다.</td></tr>
                ) : shown.map(a => (
                  <tr key={a.application_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{a.student_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{a.student_id}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13 }}>{selectedPost ? selectedPost.title : '-'}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13 }}>{formatDateTime(a.submitted_at)}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={applicationUiStatus(a.status)} label={a.status} /></td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                      <button onClick={() => openDetail(a.application_id)} style={rowBtnStyle}>상세보기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  )
}

function th(t, align, width) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}
function filterChip(on) {
  return {
    display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 'var(--radius-lg)',
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    border: '1.5px solid ' + (on ? 'var(--sogang-red)' : 'var(--border-subtle)'),
    background: on ? 'var(--sogang-red-50)' : 'var(--surface-card)', color: on ? 'var(--sogang-red)' : 'var(--text-body)',
  }
}
const rowBtnStyle = {
  height: 30, padding: '0 14px', background: 'var(--surface-card)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, color: 'var(--text-body)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
}
const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }

// 공고 상세(AdminPostsPage)의 메타정보 카드와 같은 모양으로 통일 — 상세보기 화면들 스타일 일치
function metaCell(Icon, label, value) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color="var(--text-muted)" />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </span>
    </div>
  )
}

function ApplicantDetail({ applicant: a, post, policy, onBack, onDecide }) {
  // cover_letter 파싱 성공 시 구조화해 표시, 실패(비정형 텍스트)면 원문 그대로 표시
  const parsed = parseCoverLetter(a.cover_letter)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  // 공고가 요구하는 근무 시간대와 지원자가 낸 가능 시간을 맞춰 본다 (선발 판단 근거)
  const workSlots = post?.work_slots ?? []
  const submittedSlots = parsed?.slots ?? []
  const matched = workSlots.filter(slot => submittedSlots.includes(slot))
  const unmatched = workSlots.filter(slot => !submittedSlots.includes(slot))
  const gridRows = policyGridRows(policy)

  const handleDecide = async status => {
    setSaving(true)
    setActionError('')
    try {
      await onDecide(status)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const miniTable = (columns, rows) => (
    rows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>등록된 내역이 없습니다.</div> : (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{columns.map(c => <th key={c.key} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', background: 'var(--saint-tan)', textAlign: 'left', whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map(c => <td key={c.key} style={{ padding: '7px 10px', fontSize: 13, color: 'var(--text-body)', borderBottom: '1px solid var(--border-subtle)' }}>{r[c.key] || '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    )
  )

  return (
    <div>
      <button onClick={onBack} style={{ ...backBtnStyle, marginBottom: 16 }}><ChevronLeft size={17} /> 지원자 목록으로</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <StatusPill status={applicationUiStatus(a.status)} label={a.status} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{a.student_name}</h1>
      </div>

      <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px 24px', display: 'flex', gap: 8, marginBottom: 18 }}>
        {metaCell(IdCard, '학번', a.student_id)}
        {metaCell(CalendarDays, '지원일', formatDateTime(a.submitted_at))}
        {post && metaCell(Building2, '지원 공고', `${post.department_name} · ${post.title}`)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {parsed ? (
            <>
              <AdminPanel title="자기소개서">
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>지원 동기</div>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{parsed.motivation || '—'}</p>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>자기소개</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{parsed.selfIntro || '—'}</p>
              </AdminPanel>

              <AdminPanel title="경력·활동 사항">
                {miniTable([{ key: 'type', label: '구분' }, { key: 'org', label: '기관' }, { key: 'role', label: '직책' }, { key: 'detail', label: '세부내용' }], parsed.careers)}
              </AdminPanel>
              <AdminPanel title="어학성적 · 자격증">
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>어학성적</div>
                {miniTable([{ key: 'test', label: '공인시험' }, { key: 'score', label: '점수' }, { key: 'grade', label: '등급' }, { key: 'date', label: '취득일자' }], parsed.languages)}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', margin: '16px 0 8px' }}>자격증</div>
                {miniTable([{ key: 'name', label: '자격증명' }, { key: 'org', label: '발급처' }, { key: 'date', label: '취득일자' }], parsed.certificates)}
              </AdminPanel>
            </>
          ) : (
            <AdminPanel title="지원서 원문">
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.cover_letter || '작성된 지원서가 없습니다.'}</p>
            </AdminPanel>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {parsed && (
            <AdminPanel
              title="근무 가능 시간"
              right={workSlots.length > 0 ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: matched.length === workSlots.length ? 'var(--success)' : 'var(--warning)' }}>
                  공고 필요 시간 {workSlots.length}칸 중 {matched.length}칸 충족
                </span>
              ) : null}
            >
              <TimeGrid
                rows={gridRows}
                classSlots={[]}
                availableSlots={parsed.slots}
                matchSlots={workSlots}
                editable={false}
              />
              {workSlots.length > 0 && unmatched.length > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--warning)', lineHeight: 1.6 }}>
                  이 학생이 못 채우는 공고 시간대: {unmatched.join(', ')}
                </p>
              )}
            </AdminPanel>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 22px' }}>
            <span style={{ fontSize: 13, color: 'var(--text-body)' }}>최종 선발 결정 <b style={{ color: 'var(--text-strong)' }}>— 담당자가 직접 선택</b></span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button disabled={saving} onClick={() => handleDecide('합격')} style={decideBtn(a.status === '합격', 'var(--success)')}>합격</button>
              <button disabled={saving} onClick={() => handleDecide('불합격')} style={decideBtn(a.status === '불합격', 'var(--text-muted)')}>불합격</button>
            </div>
          </div>
          {actionError && (
            <p style={{ margin: '-8px 2px 0', fontSize: 12, color: 'var(--danger)' }}>선발 결정을 저장하지 못했습니다. {actionError}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function decideBtn(active, color) {
  return {
    height: 38, padding: '0 20px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)',
    background: active ? color : 'var(--text-on-brand)', color: active ? 'var(--text-on-brand)' : color, border: `1px solid ${color}`,
  }
}

// 부서 개관 시간(정책)에서 시간표의 시간 행을 만든다. 정책을 못 불러오면 TimeGrid 기본값을 쓴다.
function policyGridRows(policy) {
  if (!policy) return undefined
  const toMin = t => {
    const [h, m] = String(t).slice(0, 5).split(':').map(Number)
    return h * 60 + m
  }
  const rows = []
  for (let m = toMin(policy.grid_start_time); m + 60 <= toMin(policy.grid_end_time); m += 60) {
    rows.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return rows.length > 0 ? rows : undefined
}
