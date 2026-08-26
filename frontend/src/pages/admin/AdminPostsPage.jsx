import { useEffect, useState } from 'react'
import { Plus, Search, ChevronDown, ChevronLeft, Pencil, Users, CircleCheck, Copy, X, AlertCircle, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Button from '../../components/ui/Button'
import StatusPill from '../../components/ui/StatusPill'
import TimeGrid from '../../components/ui/TimeGrid'
import DatePicker from '../../components/ui/DatePicker'
import { AdminPanel, AdminStatCard, ConfirmModal } from '../../components/admin/AdminPanel'
import { ListEditor, ChipEditor } from '../../components/admin/ListEditor'
import { adminStatusSlug } from '../../utils/adminStatus'
import { daysUntil } from '../../utils/format'
import { getSessionUser } from '../../utils/session'
import { fetchPostings, fetchPosting, fetchApplicants, createPosting, updatePosting } from '../../api/client'

// "지원 동기"는 모든 공고에 공통으로 적용되는 고정 질문 (공고별로 바꿀 수 없음)
const FIXED_MOTIVATION_PROMPT = '이 업무를 지원하고자 하는 동기를 작성해 주세요.'

// 날짜 표기 변환: API(ISO "2026-09-25") ↔ 화면/DatePicker("2026.09.25")
const isoToDots = iso => (iso ? iso.slice(0, 10).replaceAll('-', '.') : '')
const dotsToIso = dots => (dots ? dots.replaceAll('.', '-') : null)

// 공고 표시 상태 — API status(모집중/마감)에 마감임박(3일 이내)을 파생해서 얹는다
function displayStatus(p) {
  if (p.status === '마감') return '마감'
  const days = daysUntil(p.deadline)
  if (days !== null && days < 0) return '마감'
  if (days !== null && days <= 3) return '마감임박'
  return '모집중'
}

// API 공고 → 이 화면의 모델. qualification 줄 중 "우대"가 들어간 줄은 우대 역량으로 분리해 보여준다.
function fromApi(p, applicants = null) {
  const qualLines = (p.qualification ?? '').split('\n').filter(Boolean)
  return {
    id: p.posting_id,
    title: p.title,
    dept: p.department_name ?? '',
    status: displayStatus(p),
    headcount: p.headcount ?? 0,
    weekly: p.weekly_max_hours != null ? `최대 ${p.weekly_max_hours}시간` : '—',
    weeklyMaxHours: p.weekly_max_hours,
    reg: isoToDots(p.upload_date),
    deadline: isoToDots(p.deadline),
    periodStart: isoToDots(p.period_start),
    periodEnd: isoToDots(p.period_end),
    location: p.location ?? '',
    duties: (p.description ?? '').split('\n').filter(Boolean),
    qualifications: qualLines.filter(l => !l.includes('우대')),
    preferred: qualLines.filter(l => l.includes('우대')),
    workSlots: p.work_slots ?? [],
    applicants,
  }
}

// 화면 폼 → API 요청 본문 (등록·수정 공용)
function toApiPayload(form) {
  return {
    title: form.title.trim(),
    description: form.duties.join('\n'),
    qualification: [...form.qualifications, ...form.preferred].join('\n'),
    deadline: dotsToIso(form.deadline),
    period_start: dotsToIso(form.periodStart),
    period_end: dotsToIso(form.periodEnd),
    headcount: Number(form.headcount) || null,
    weekly_max_hours: Number(form.weekly) || null,
    location: form.location.trim() || null,
    work_slots: form.workSlots,
  }
}

function blankForm() {
  return {
    title: '', headcount: '', weekly: '', deadline: '', periodStart: '', periodEnd: '', location: '',
    duties: [], qualifications: [], preferred: [], workSlots: [],
  }
}
function formFromPost(post) {
  return {
    title: post.title, headcount: String(post.headcount || ''), weekly: String(post.weeklyMaxHours ?? ''),
    deadline: post.deadline || '', periodStart: post.periodStart || '', periodEnd: post.periodEnd || '',
    location: post.location || '',
    duties: [...(post.duties || [])], qualifications: [...(post.qualifications || [])], preferred: [...(post.preferred || [])],
    workSlots: [...(post.workSlots || [])],
  }
}

export default function AdminPostsPage() {
  const navigate = useNavigate()
  const user = getSessionUser()
  const [posts, setPosts] = useState(null) // null = 로딩 중
  const [error, setError] = useState('')
  const [view, setView] = useState('list') // list | detail | edit
  const [sel, setSel] = useState(null)
  const [editTarget, setEditTarget] = useState(null) // null = 신규 등록
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('전체')
  const [confirmCloseId, setConfirmCloseId] = useState(null)

  // 본인 부서 공고 로드 + 공고별 지원자 수 (직원은 본인 부서 공고의 지원자만 조회 가능)
  async function load() {
    try {
      setError('')
      const rows = await fetchPostings({ department_id: user?.department_id })
      const counts = await Promise.all(
        rows.map(r => fetchApplicants(r.posting_id).then(a => a.length).catch(() => null)),
      )
      setPosts(rows.map((r, i) => fromApi(r, counts[i])))
    } catch (e) {
      setError(e.message)
      setPosts([])
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditTarget(null); setView('edit') }
  const openEdit = p => { setEditTarget(p); setView('edit') }

  // 상세 조회 (목록 응답에는 description 등이 없어 상세 API로 다시 가져온다)
  const openDetail = async p => {
    setSel({ ...p, loading: true })
    setView('detail')
    try {
      const detail = await fetchPosting(p.id)
      setSel({ ...fromApi(detail, p.applicants), loading: false })
    } catch (e) {
      setError(e.message)
      setView('list')
    }
  }

  const handleClose = async id => {
    try {
      await updatePosting(id, { status: '마감' })
      setConfirmCloseId(null)
      setSel(s => (s && s.id === id ? { ...s, status: '마감' } : s))
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleSave = async form => {
    try {
      if (editTarget) {
        await updatePosting(editTarget.id, toApiPayload(form))
      } else {
        await createPosting({ department_id: user?.department_id, ...toApiPayload(form) })
      }
      setView('list')
      await load()
    } catch (e) {
      // 폼 화면에 그대로 노출되도록 다시 던진다
      throw e
    }
  }

  if (view === 'edit') {
    return (
      <AdminShell activeMenu="posts">
        <PostEdit post={editTarget} allPosts={posts ?? []} deptName={user?.department_name}
          onBack={() => setView(editTarget ? 'detail' : 'list')} onSave={handleSave} />
      </AdminShell>
    )
  }
  if (view === 'detail' && sel) {
    return (
      <AdminShell activeMenu="posts">
        <PostDetail post={sel} onBack={() => setView('list')} onEdit={() => openEdit(sel)}
          onClose={() => setConfirmCloseId(sel.id)}
          onViewApplicants={() => navigate('/admin/selection')} />
        {confirmCloseId && (
          <ConfirmModal title="공고를 마감 처리할까요?" confirmLabel="마감"
            desc="마감하면 학생 화면에서 지원이 불가능해집니다. 다시 모집하려면 수정에서 마감일을 연장하세요."
            onCancel={() => setConfirmCloseId(null)} onConfirm={() => handleClose(confirmCloseId)} />
        )}
      </AdminShell>
    )
  }

  const list = posts ?? []
  const stats = [
    { key: 'total', label: '전체 공고', value: posts ? `${list.length}건` : '–', sub: '우리 부서 등록', icon: 'Files', tone: 'neutral' },
    { key: 'open', label: '모집중', value: posts ? `${list.filter(p => p.status === '모집중').length}건` : '–', sub: '현재 지원 접수중', icon: 'Megaphone', tone: 'success' },
    { key: 'soon', label: '마감임박', value: posts ? `${list.filter(p => p.status === '마감임박').length}건` : '–', sub: '3일 이내 마감', icon: 'Clock', tone: 'warning' },
    { key: 'applicants', label: '총 지원자', value: posts ? `${list.reduce((n, p) => n + (p.applicants ?? 0), 0)}명` : '–', sub: '접수된 지원서', icon: 'CircleCheck', tone: 'info' },
  ]

  const normalizedQ = q.trim().toLowerCase()
  const filtered = list.filter(p => {
    const matchesQ = !normalizedQ || `${p.title} ${p.dept}`.toLowerCase().includes(normalizedQ)
    const matchesStatus = status === '전체' || p.status === status
    return matchesQ && matchesStatus
  })

  return (
    <AdminShell activeMenu="posts">
      <PageTitle>교내 근로 모집 공고 관리</PageTitle>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button onClick={openNew}><Plus size={14} /> 신규 공고 등록</Button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {stats.map(s => <AdminStatCard key={s.key} stat={s} />)}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', marginBottom: 14, background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--sogang-red)' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><Search size={15} color="var(--text-subtle)" /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="공고명으로 검색"
            style={{ width: '100%', height: 38, padding: '0 12px 0 36px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          {['전체', '모집중', '마감임박', '마감'].map(s => <option key={s} value={s}>{s === '전체' ? '모집상태 전체' : s}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>총 <b style={{ color: 'var(--text-strong)' }}>{filtered.length}건</b>의 공고</div>

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--saint-tan)' }}>
              {th('상태', 'center', 84)}{th('공고명 / 부서')}{th('지원 현황', 'center', 130)}{th('주당 근무')}{th('마감일', 'center', 100)}{th('관리', 'center', 140)}
            </tr>
          </thead>
          <tbody>
            {posts === null ? (
              <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>공고를 불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>조건에 맞는 공고가 없습니다.</td></tr>
            ) : filtered.map(p => {
              const fillRate = p.headcount ? Math.min(1, (p.applicants ?? 0) / p.headcount) : 0
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(p.status)} label={p.status} /></td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>{p.dept} · 등록 {p.reg}</div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, fontSize: 13, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--sogang-red)' }}>{p.applicants ?? '–'}</span> / {p.headcount}명 지원
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--neutral-100)', overflow: 'hidden' }}>
                      <div style={{ width: `${fillRate * 100}%`, height: '100%', background: fillRate >= 1 ? 'var(--success)' : 'var(--warning)' }} />
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13 }}>{p.weekly}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, fontWeight: p.status === '마감임박' ? 700 : 400, color: p.status === '마감임박' ? 'var(--warning)' : 'var(--text-body)' }}>{p.deadline}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button onClick={() => openDetail(p)} style={rowBtnStyle}>상세</button>
                      <button onClick={() => openEdit(p)} style={rowBtnStyle}>수정</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}

function th(t, align, width) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}

const selectStyle = {
  height: 38, padding: '0 10px', background: '#fff', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
}
const rowBtnStyle = {
  height: 30, padding: '0 12px', background: '#fff', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, color: 'var(--text-body)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
}

function PostDetail({ post, onBack, onEdit, onClose, onViewApplicants }) {
  const cell = (Icon, label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
      <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color="var(--text-muted)" />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 700 }}>{value}</span>
      </span>
    </div>
  )
  const bulletList = items => (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((t, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6, marginBottom: 6 }}>
          <span style={{ color: 'var(--sogang-red)' }}>•</span> {t}
        </li>
      ))}
    </ul>
  )

  if (post.loading) {
    return <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>공고 상세를 불러오는 중...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={onBack} style={backBtnStyle}><ChevronLeft size={17} /> 목록으로</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onEdit}><Pencil size={13} /> 수정</Button>
          <Button variant="secondary" size="sm" onClick={onViewApplicants}><Users size={13} /> 지원자 보기{post.applicants != null ? ` (${post.applicants})` : ''}</Button>
          {post.status !== '마감' && <Button variant="secondary" size="sm" onClick={onClose}><CircleCheck size={13} /> 마감 처리</Button>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <StatusPill status={adminStatusSlug(post.status)} label={post.status} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>
          {post.dept} <span style={{ color: 'var(--border-strong)', margin: '0 6px' }}>|</span> {post.title}
        </h1>
      </div>

      <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px 24px', display: 'flex', gap: 8, marginBottom: 18 }}>
        {cell(Users, '모집인원', post.headcount + '명')}
        {cell(Users, '지원인원', (post.applicants ?? '–') + '명')}
        {cell(AlertCircle, '주당 근무시간', post.weekly)}
        {cell(AlertCircle, '지원 마감일', post.deadline)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel title="업무 내용">{bulletList(post.duties || [])}</AdminPanel>
          <AdminPanel title="지원 자격 및 우대 조건">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>필수 조건</div>
            {(post.qualifications || []).length > 0 ? bulletList(post.qualifications) : <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>설정된 필수 조건이 없습니다.</div>}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', margin: '14px 0 8px' }}>우대 역량</div>
            {(post.preferred || []).length > 0 ? bulletList(post.preferred) : <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>설정된 우대 역량이 없습니다.</div>}
          </AdminPanel>
          <AdminPanel title="자기소개서 질문">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>지원 동기 <span style={{ fontWeight: 500, color: 'var(--text-subtle)' }}>· 공통 고정</span></div>
            <div style={{ fontSize: 13, color: 'var(--text-body)' }}>{FIXED_MOTIVATION_PROMPT}</div>
          </AdminPanel>
        </div>
        <AdminPanel title="근무 조건">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)', marginBottom: 12 }}>근무요일/시간</div>
          <TimeGrid classSlots={[]} availableSlots={post.workSlots || []} editable={false} />
          {(post.periodStart || post.periodEnd) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-subtle)', fontWeight: 600 }}>근로기간</span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{[post.periodStart, post.periodEnd].filter(Boolean).join(' ~ ')}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--text-subtle)', fontWeight: 600 }}>근무장소</span>
            <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{post.location || '—'}</span>
          </div>
        </AdminPanel>
      </div>
    </div>
  )
}

const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }

function PostEdit({ post, allPosts, deptName, onBack, onSave }) {
  const isEditing = !!post
  const [form, setForm] = useState(() => post ? formFromPost(post) : blankForm())
  const [showPicker, setShowPicker] = useState(false)
  const [loadedFrom, setLoadedFrom] = useState(null)
  const [errors, setErrors] = useState([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const addItem = (key, val) => setForm(f => ({ ...f, [key]: [...f[key], val] }))
  const removeItem = (key, idx) => setForm(f => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }))
  const toggleSlot = key => setForm(f => {
    const has = f.workSlots.includes(key)
    return { ...f, workSlots: has ? f.workSlots.filter(k => k !== key) : [...f.workSlots, key] }
  })

  const loadPrevious = p => {
    setForm(f => ({
      ...f,
      headcount: String(p.headcount || ''), weekly: String(p.weeklyMaxHours ?? ''), location: p.location || '',
      periodStart: p.periodStart || '', periodEnd: p.periodEnd || '',
      duties: [...(p.duties || [])], qualifications: [...(p.qualifications || [])], preferred: [...(p.preferred || [])],
      workSlots: [...(p.workSlots || [])],
      title: f.title || (p.title + ' (사본)'),
    }))
    setLoadedFrom(p)
    setShowPicker(false)
  }

  const validate = () => {
    const missing = []
    if (!form.title.trim()) missing.push('공고명')
    if (!form.headcount) missing.push('모집 인원')
    if (!form.weekly) missing.push('주당 최대 근무시간')
    if (!form.deadline.trim()) missing.push('지원 마감일')
    if (form.duties.length === 0) missing.push('업무 내용')
    if (form.qualifications.length === 0) missing.push('필수 조건')
    return missing
  }
  const submit = async () => {
    const missing = validate()
    if (missing.length > 0) { setErrors(missing); return }
    setErrors([])
    setSubmitting(true)
    setSubmitError('')
    try {
      await onSave(form)
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const label = (t, req) => <div style={{ fontSize: 13, color: 'var(--text-body)', fontWeight: 600, marginBottom: 6 }}>{t} {req && <span style={{ color: 'var(--sogang-red)' }}>*</span>}</div>
  const textField = (lbl, key, ph, req, type) => (
    <div>
      {label(lbl, req)}
      <input type={type || 'text'} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={ph}
        style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
    </div>
  )
  const dateField = (lbl, key, req) => (
    <div>
      {label(lbl, req)}
      <DatePicker value={form[key]} onChange={v => set(key, v)} placeholder="YYYY.MM.DD" />
    </div>
  )

  return (
    <div>
      <button onClick={onBack} style={{ ...backBtnStyle, marginBottom: 14 }}><ChevronLeft size={17} /> {isEditing ? '상세로' : '목록으로'}</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>{isEditing ? '모집 공고 수정' : '모집 공고 등록'}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>학생이 지원서에서 작성하는 항목을 이 화면에서 함께 설정합니다.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}><Copy size={13} /> 이전 공고 불러오기</Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 920 }}>
        {loadedFrom && (
          <div style={{ background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 'var(--radius-xl)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={16} color="var(--success)" /></span>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>'{loadedFrom.dept} | {loadedFrom.title}' 공고 내용을 불러왔습니다</div>
          </div>
        )}

        <AdminPanel title="기본 정보">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {textField('공고명', 'title', '예) 2026-1학기 학생지원팀 행정 보조', true)}
            <div>
              {label('담당 부서', true)}
              <input value={deptName ?? ''} disabled
                style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box', background: 'var(--neutral-25)', color: 'var(--text-muted)' }} />
            </div>
            {textField('모집 인원', 'headcount', '예) 2', true, 'number')}
            {textField('주당 최대 근무시간', 'weekly', '예) 15', true, 'number')}
            {dateField('근로 시작일', 'periodStart')}
            {dateField('근로 종료일', 'periodEnd')}
            {dateField('지원 마감일', 'deadline', true)}
            {textField('근무 장소', 'location', '예) 학생지원팀 사무실 (본관빌딩)', false)}
          </div>
        </AdminPanel>

        <AdminPanel title="업무 내용">
          {label('담당 업무', true)}
          <ListEditor items={form.duties} onAdd={v => addItem('duties', v)} onRemove={i => removeItem('duties', i)} placeholder="예) 민원 응대 및 학생지원팀 행정 업무 보조 (입력 후 Enter)" />
        </AdminPanel>

        <div style={{ background: 'var(--neutral-25)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          아래 항목은 학생이 이 공고에 지원할 때 작성하는 <b style={{ color: 'var(--text-body)' }}>부서별 지원서</b> 화면에 그대로 표시됩니다.
        </div>

        <AdminPanel title="지원 자격 및 우대 조건">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              {label('필수 조건', true)}
              <ChipEditor items={form.qualifications} onAdd={v => addItem('qualifications', v)} onRemove={i => removeItem('qualifications', i)} placeholder="예) 학부 재학생 (휴학생 불가)" />
            </div>
            <div>
              {label('우대 역량')}
              <ChipEditor items={form.preferred} onAdd={v => addItem('preferred', v)} onRemove={i => removeItem('preferred', i)} placeholder="예) 엑셀 활용 가능자 우대" />
            </div>
          </div>
        </AdminPanel>

        <AdminPanel title="근무 요일 / 시간" right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>선택 {form.workSlots.length}칸</span>}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>여기서 설정한 시간이 학생 지원서의 근무 가능 시간 항목에 추천 슬롯으로 표시됩니다.</p>
          <TimeGrid classSlots={[]} availableSlots={form.workSlots} editable onToggle={toggleSlot} />
        </AdminPanel>

        {errors.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--sogang-red)' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>다음 항목을 입력해 주세요: {errors.join(', ')}</span>
          </div>
        )}
        {submitError && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--sogang-red)' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{submitError}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={onBack}>취소</Button>
          <Button onClick={submit} disabled={submitting}><Check size={14} /> {submitting ? '저장 중...' : isEditing ? '수정 완료' : '공고 등록'}</Button>
        </div>
      </div>

      {showPicker && <PreviousPostPicker posts={allPosts} onSelect={loadPrevious} onClose={() => setShowPicker(false)} />}
    </div>
  )
}

function PreviousPostPicker({ posts, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const query = q.trim()
  const filtered = query ? posts.filter(p => `${p.title} ${p.dept}`.includes(query)) : posts
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ width: 560, maxHeight: '80vh', background: '#fff', borderRadius: 'var(--radius-xl)', padding: 24, position: 'relative', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="var(--text-subtle)" /></button>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>이전 공고 불러오기</div>
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 14 }}>선택한 공고의 업무 내용·지원 자격·우대 조건·근무 가능 시간이 그대로 채워집니다.</div>
        <div style={{ position: 'relative', marginBottom: 14, flexShrink: 0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="공고명, 부서명으로 검색" autoFocus
            style={{ width: '100%', height: 38, padding: '0 12px 0 34px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}><Search size={14} color="var(--text-subtle)" /></span>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {filtered.map(p => (
            <button key={p.id} type="button" onClick={() => onSelect(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', textAlign: 'left', border: '1px solid var(--border-subtle)', background: '#fff', borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              <StatusPill status={adminStatusSlug(p.status)} label={p.status} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.dept} | {p.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>{p.weekly} · 등록 {p.reg}</span>
              </span>
              <ChevronDown size={14} color="var(--text-subtle)" style={{ transform: 'rotate(-90deg)' }} />
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>검색 결과가 없습니다.</div>}
        </div>
      </div>
    </div>
  )
}
