import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, Info, Lock, Repeat, User, X } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import Button from '../components/ui/Button'
import StatusPill from '../components/ui/StatusPill'
import { adminStatusSlug } from '../utils/adminStatus'
import { formatDate, formatDateTime } from '../utils/format'
import { getSessionUser } from '../utils/session'
import {
  createSubstituteRequest,
  fetchMySchedule,
  fetchMySubstituteRequests,
  fetchOpenSubstituteRequests,
  fetchSubstituteCandidates,
  respondToSubstituteRequest,
} from '../api/client'

const hhmm = t => String(t ?? '').slice(0, 5)

// 개인정보 보호: 이름 가운데, 학번 뒷자리 마스킹 (PR #71 화면명세)
const maskName = name => {
  if (!name) return ''
  if (name.length <= 2) return name[0] + '*'
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}
const maskStudentId = sid => (sid ? String(sid).slice(0, 4) + '****' : '')

const todayIso = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function SubstitutePage() {
  const user = getSessionUser()
  const [tab, setTab] = useState('new') // new | inbox | history

  // ---- 새 요청 ----
  const [schedules, setSchedules] = useState(null)
  const [myRequests, setMyRequests] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [created, setCreated] = useState(null) // { request, schedule }
  const [candidates, setCandidates] = useState(null)
  const [notice, setNotice] = useState(null) // { tone, text }

  // ---- 받은 요청 ----
  const [openRequests, setOpenRequests] = useState(null)
  const [openError, setOpenError] = useState('')
  const [responding, setRespondingId] = useState(null)
  const [declinedIds, setDeclinedIds] = useState([]) // 이번 세션에서 '불가능'으로 답한 요청

  function loadBase() {
    fetchMySchedule({ from_date: todayIso() })
      .then(setSchedules)
      .catch(err => setLoadError(err.message))
    fetchMySubstituteRequests()
      .then(setMyRequests)
      .catch(err => setLoadError(err.message))
  }

  useEffect(() => {
    if (!user) return
    loadBase()
    fetchOpenSubstituteRequests()
      .then(setOpenRequests)
      .catch(err => setOpenError(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 이미 진행 중(대기·수락)인 요청이 걸린 근무는 다시 요청할 수 없다 (BE 409와 동일 기준)
  const openBySchedule = useMemo(() => {
    const map = new Map()
    for (const r of myRequests ?? []) {
      if (r.role === 'requester' && (r.status === '대기' || r.status === '수락')) map.set(r.schedule_id, r)
    }
    return map
  }, [myRequests])

  const selectable = schedules ?? []
  const selected = selectable.find(s => s.schedule_id === selectedId) ?? null

  async function submitRequest(reason) {
    if (!selected) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await createSubstituteRequest(selected.schedule_id, reason)
      setShowReasonModal(false)
      setCreated({ request: res, schedule: selected })
      setCandidates(null)
      fetchSubstituteCandidates(res.request_id)
        .then(setCandidates)
        .catch(() => setCandidates([]))
      fetchMySubstituteRequests().then(setMyRequests).catch(() => {})
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function resetNewRequest(next = {}) {
    setCreated(null)
    setCandidates(null)
    setSelectedId(null)
    setSubmitError('')
    if (next.notice) setNotice(next.notice)
    if (next.tab) setTab(next.tab)
  }

  async function respond(request, response) {
    setRespondingId(request.request_id)
    try {
      await respondToSubstituteRequest(request.request_id, user.id, response)
      if (response === '수락') {
        setOpenRequests(rs => (rs ?? []).filter(r => r.request_id !== request.request_id))
        setNotice({ tone: 'success', text: `${formatDate(request.date)} ${hhmm(request.start_time)}~${hhmm(request.end_time)} 대타를 가능으로 답변했어요. 담당 직원이 승인하면 근무표에 반영됩니다.` })
        fetchMySubstituteRequests().then(setMyRequests).catch(() => {})
      } else {
        setDeclinedIds(ids => [...ids, request.request_id])
      }
    } catch (err) {
      setNotice({ tone: 'warn', text: err.message })
      // 이미 다른 학생이 수락한 경우 등 — 목록을 최신 상태로
      fetchOpenSubstituteRequests().then(setOpenRequests).catch(() => {})
    } finally {
      setRespondingId(null)
    }
  }

  const visibleOpen = (openRequests ?? []).filter(r => !declinedIds.includes(r.request_id))
  const history = myRequests ?? []

  return (
    <Shell activeMenu="substitute">
      <PageTitle>대타 요청</PageTitle>
      <p style={{ margin: '0 0 20px 2px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        근무가 어려운 확정 일정에 대해 같은 부서 동료에게 대타를 요청할 수 있습니다. 동료가 가능으로 답하면 담당 직원이 최종 승인해야 근무표에 반영됩니다.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <TabButton active={tab === 'new'} onClick={() => setTab('new')}>새 요청</TabButton>
        <TabButton active={tab === 'inbox'} onClick={() => setTab('inbox')}>
          받은 요청{visibleOpen.length > 0 ? ` ${visibleOpen.length}` : ''}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>요청 기록</TabButton>
      </div>

      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />

      {tab === 'new' && (
        created ? (
          <CandidatesPanel
            created={created}
            candidates={candidates}
            onDone={() => resetNewRequest({ tab: 'history', notice: { tone: 'success', text: '대타 요청을 등록했어요. 동료가 가능으로 답하면 담당 직원 승인 후 근무표에 반영됩니다.' } })}
            onBack={() => resetNewRequest()}
          />
        ) : (
          <NewRequestPanel
            schedules={selectable}
            loading={schedules === null && !loadError}
            loadError={loadError}
            openBySchedule={openBySchedule}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNext={() => setShowReasonModal(true)}
          />
        )
      )}

      {tab === 'inbox' && (
        <InboxPanel
          requests={visibleOpen}
          loading={openRequests === null && !openError}
          loadError={openError}
          respondingId={responding}
          onRespond={respond}
        />
      )}

      {tab === 'history' && <HistoryPanel history={history} loading={myRequests === null && !loadError} />}

      {showReasonModal && selected && (
        <ReasonModal
          schedule={selected}
          submitting={submitting}
          submitError={submitError}
          onClose={() => { setShowReasonModal(false); setSubmitError('') }}
          onSubmit={submitRequest}
        />
      )}
    </Shell>
  )
}

// ---- 새 요청: 확정 근무 선택 ----
function NewRequestPanel({ schedules, loading, loadError, openBySchedule, selectedId, onSelect, onNext }) {
  if (loadError) return <ErrorCard message={loadError} />
  if (loading) return <LoadingCard text="확정 근무를 불러오는 중..." />
  if (schedules.length === 0) {
    return (
      <EmptyCard
        icon={<CalendarDays size={26} color="var(--text-subtle)" />}
        title="대타를 요청할 확정 근무가 없습니다"
        body={<>오늘 이후의 확정 근무가 있어야 대타를 요청할 수 있어요.<br />근무표가 확정되면 이곳에서 근무를 선택할 수 있습니다.</>}
      />
    )
  }
  return (
    <div style={panelStyle}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>대타가 필요한 근무를 선택하세요</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-subtle)' }}>오늘 이후의 확정 근무만 표시됩니다. 이미 요청이 진행 중인 근무는 다시 요청할 수 없어요.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {schedules.map(s => {
          const openReq = openBySchedule.get(s.schedule_id)
          const disabled = !!openReq
          const on = selectedId === s.schedule_id
          return (
            <label key={s.schedule_id} style={{
              border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-subtle)'}`,
              background: disabled ? 'var(--neutral-25)' : on ? 'var(--saint-row-hover)' : '#fff',
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1,
            }}>
              <input
                type="radio" name="substitute-shift" checked={on} disabled={disabled}
                onChange={() => onSelect(s.schedule_id)}
                style={{ width: 17, height: 17, accentColor: 'var(--sogang-red)', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                  {formatDate(s.date)} {hhmm(s.start_time)}~{hhmm(s.end_time)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.department_name ?? ''}</div>
              </div>
              {disabled && <StatusPill status={adminStatusSlug(openReq.status)} label={`요청 ${openReq.status}`} />}
            </label>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <Button onClick={onNext} disabled={!selectedId}>대타 사유 입력</Button>
      </div>
    </div>
  )
}

// ---- 새 요청: 사유 입력 팝업 (PR #71 — 슬롯 선택 직후 사유 입력) ----
function ReasonModal({ schedule, submitting, submitError, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 420, maxWidth: 'calc(100vw - 48px)', padding: 24, boxShadow: '0 20px 50px rgba(16,24,40,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>대타 요청 사유</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} color="var(--text-subtle)" /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 16px', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
          <Check size={15} color="var(--success)" /> {formatDate(schedule.date)} {hhmm(schedule.start_time)}~{hhmm(schedule.end_time)} · 대타 요청 가능
        </div>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="대타 사유를 입력해 주세요"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
        />
        {submitError && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--danger)' }}>{submitError}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button onClick={() => reason.trim() && onSubmit(reason.trim())} disabled={submitting || !reason.trim()}>
            {submitting ? '등록 중...' : '요청 등록 · 동료 찾기'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---- 새 요청: 등록 완료 + 후보 확인 ----
function CandidatesPanel({ created, candidates, onDone, onBack }) {
  const { schedule } = created
  return (
    <div style={panelStyle}>
      <button onClick={onBack} style={backLinkStyle}><ChevronLeft size={16} color="var(--text-subtle)" /> 다른 근무 선택</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Check size={17} color="var(--success)" /></span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>대타 요청을 등록했어요</h3>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {formatDate(schedule.date)} {hhmm(schedule.start_time)}~{hhmm(schedule.end_time)} · {schedule.department_name ?? ''}<br />
        아래 동료들이 이 시간에 가능해요. 동료가 '받은 요청'에서 가능으로 답하면, 담당 직원 승인 후 근무표에 반영됩니다.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-subtle)', marginBottom: 12 }}>
        <Lock size={13} color="var(--text-subtle)" /> 개인정보 보호를 위해 이름·학번 일부가 가려져 표시됩니다.
      </div>

      {!candidates ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>가능한 동료를 찾는 중...</p>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '20px 0', fontSize: 13.5, color: 'var(--text-subtle)' }}>
          이 시간에 가능한 같은 부서 동료가 아직 없어요. 동료들이 가능 시간을 등록하면 요청이 전달됩니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>총 {candidates.length}명 가능</div>
          {candidates.map(c => (
            <div key={c.student_id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={avatarStyle}><User size={17} color="var(--text-muted)" /></span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                {maskName(c.name) || maskStudentId(c.student_id)}{' '}
                <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 500 }}>({maskStudentId(c.student_id)})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <Button onClick={onDone}>확인 · 요청 기록 보기</Button>
      </div>
    </div>
  )
}

// ---- 받은 요청: 후보로서 가능/불가능 응답 (PR #71 — 수락/거절 대신 가능/불가능 워딩) ----
function InboxPanel({ requests, loading, loadError, respondingId, onRespond }) {
  if (loadError) return <ErrorCard message={loadError} />
  if (loading) return <LoadingCard text="받은 요청을 불러오는 중..." />
  if (requests.length === 0) {
    return (
      <EmptyCard
        icon={<Repeat size={26} color="var(--text-subtle)" />}
        title="받은 대타 요청이 없습니다"
        body={<>같은 부서 동료가 내 가능 시간과 겹치는 근무의 대타를 요청하면<br />이곳에서 가능 여부를 답할 수 있어요.</>}
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--neutral-25)', borderRadius: 'var(--radius-lg)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <Info size={14} color="var(--text-subtle)" style={{ marginTop: 1, flexShrink: 0 }} />
        가능으로 답해도 아직 확정은 아니에요. 담당 직원이 최종 승인하면 근무표에 반영됩니다.
      </div>
      {requests.map(r => (
        <div key={r.request_id} style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={avatarStyle}><User size={17} color="var(--text-muted)" /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)' }}>
              {r.requester_name ?? r.requester_id}님의 대타 요청
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-body)', marginTop: 3 }}>
              {formatDate(r.date)} {hhmm(r.start_time)}~{hhmm(r.end_time)} · {r.department_name ?? ''}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>사유: {r.reason || '(작성 안 함)'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => onRespond(r, '수락')} disabled={respondingId === r.request_id}>
              <Check size={14} /> 가능
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onRespond(r, '거절')} disabled={respondingId === r.request_id}>
              <X size={14} /> 불가능
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- 요청 기록 ----
function HistoryPanel({ history, loading }) {
  if (loading) return <LoadingCard text="요청 기록을 불러오는 중..." />
  if (history.length === 0) {
    return (
      <EmptyCard
        icon={<CalendarDays size={26} color="var(--text-subtle)" />}
        title="대타 요청 기록이 없습니다"
        body={<>내가 올린 대타 요청과 내가 대타로 참여한 내역이 이곳에 표시됩니다.</>}
      />
    )
  }
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--saint-tan)' }}>
            {['구분', '근무일 · 시간', '사유', '상대방', '요청일', '상태'].map((h, i) => (
              <th key={h} style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: i >= 4 ? 'center' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map(r => (
            <tr key={`${r.request_id}-${r.role}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.role === 'requester' ? 'var(--sogang-red)' : '#B8860B' }}>
                  {r.role === 'requester' ? '내 요청' : '대타 근무'}
                </span>
              </td>
              <td style={{ padding: '13px 16px', fontSize: 13 }}>
                {formatDate(r.date)} {hhmm(r.start_time)}~{hhmm(r.end_time)}
                <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.department_name ?? ''}</div>
              </td>
              <td style={{ padding: '13px 16px', fontSize: 13 }}>
                {r.reason || '-'}
                {r.status === '반려' && r.reject_reason && (
                  <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>반려 사유: {r.reject_reason}</div>
                )}
              </td>
              <td style={{ padding: '13px 16px', fontSize: 13 }}>
                {r.role === 'requester'
                  ? (r.substitute_name ? `대타: ${r.substitute_name}` : '대타 미정')
                  : `요청자: ${r.requester_name ?? r.requester_id}`}
              </td>
              <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{formatDateTime(r.requested_at)}</td>
              <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(r.status)} label={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- 공용 소품 ----
function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        height: 36, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        border: `1px solid ${active ? 'var(--sogang-red)' : 'var(--border-default)'}`,
        background: active ? 'var(--sogang-red)' : '#fff',
        color: active ? '#fff' : 'var(--text-body)',
      }}
    >{children}</button>
  )
}

function NoticeBanner({ notice, onClose }) {
  if (!notice) return null
  const tones = {
    success: { bg: 'var(--success-50)', fg: 'var(--success)', bd: 'var(--success-100)' },
    warn: { bg: 'var(--warning-50)', fg: 'var(--warning)', bd: 'var(--warning-100)' },
  }
  const t = tones[notice.tone] ?? tones.success
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, borderRadius: 10, padding: '11px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
      <span style={{ flex: 1 }}>{notice.text}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><X size={15} color={t.fg} /></button>
    </div>
  )
}

function LoadingCard({ text }) {
  return <div style={{ padding: '42px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>{text}</div>
}

function ErrorCard({ message }) {
  return (
    <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>불러오지 못했습니다</div>
      <div style={{ fontSize: 13, color: 'var(--danger)' }}>{message}</div>
    </div>
  )
}

function EmptyCard({ icon, title, body }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '44px 32px', textAlign: 'center' }}>
      <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{icon}</span>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}

const panelStyle = { background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20 }
const backLinkStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0, marginBottom: 12 }
const avatarStyle = { width: 36, height: 36, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
