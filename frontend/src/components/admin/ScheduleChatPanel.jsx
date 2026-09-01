// 시간표 조정 도우미 — 플로팅 챗봇 (#137, #152, REQ-SCHED-019·020·021)
//
// 담당자가 확정 전 draft 근무표를 놓고 AI와 대화한다. AI는 조회(읽기 툴)로
// 근거를 대고, 요청받으면 draft를 직접 고치거나 배정 기준의 중요도를 조정한다.
//
// 화면 설계의 핵심 셋:
// 1) 버튼이 "승인"이 아니라 "되돌리기"다 — 변경은 이미 반영된 상태로 도착한다.
//    안전장치는 사전 승인이 아니라 사후 취소이며, 확정(4단계)은 여전히 사람만 한다.
// 2) 중요도 조정 결과는 '위반 건수'로 읽는다 — 중요도를 올리면 위반이 그대로여도
//    비용(penalty)은 배율만큼 부풀기 때문에, 비용 증감을 개선/악화로 오독하기 쉽다.
// 3) 화면에 박힌 카드가 아니라 떠 있는 패널이다 (#152) — 이 챗봇은 근무표를
//    고치는 도구라, 표를 보면서 대화하고 변경이 반영되는 것을 같은 화면에서
//    확인할 수 있어야 한다. 표를 밀어내지 않으려면 fixed로 띄워야 한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, ChevronDown, ChevronRight, Minus, RotateCcw, Send, Sparkles, Wrench,
} from 'lucide-react'

import Button from '../ui/Button'
import { PENALTY_LABELS } from './DepartmentPolicyEditor'
import {
  ApiError,
  createChatSession,
  fetchChatMessages,
  persistChatWeights,
  revertChatTurn,
  sendChatMessage,
} from '../../api/client'

// 툴 이름 → 담당자에게 보여줄 설명. 백엔드 툴 목록과 1:1
const TOOL_LABELS = {
  find_schedules: '근무표 조회',
  explain_penalty: '위반 내역 조회',
  get_student_availability: '학생 가능시간 조회',
  get_period_calendar: '학사일정 조회',
  verify_schedule: '규정 검증',
  move_schedule: '근무 시간 변경',
  remove_schedule: '근무 삭제',
  add_schedule: '근무 추가',
  adjust_weight: '배정 기준 중요도 조정',
}

// 쓰기 툴 — 되돌릴 수 있는 변경. 읽기 툴과 시각적으로 구분한다
const WRITE_TOOLS = new Set(['move_schedule', 'remove_schedule', 'add_schedule', 'adjust_weight'])

// 이 툴 호출로 실제 바뀐 건수. 다건 쓰기(#222) 이후 한 호출이 여러 건을 고칠 수
// 있어 "호출 1회 = 변경 1건"이 더는 성립하지 않는다. inverse(단수)는 #222 이전에
// 저장된 이력 — 되돌리기 버튼이 옛 턴에서도 떠야 한다.
const editCount = c => c.inverses?.length ?? (c.inverse ? 1 : 0)

const TURN_STATUS = {
  applied: { label: '변경 반영됨', color: 'var(--success)', bg: 'var(--success-50)', border: 'var(--success-100)' },
  partial_failed: { label: '일부 실패', color: 'var(--warning)', bg: 'var(--warning-50)', border: 'var(--warning-100)' },
  budget_exceeded: { label: '중간에 멈춤', color: 'var(--warning)', bg: 'var(--warning-50)', border: 'var(--warning-100)' },
  reverted: { label: '되돌림', color: 'var(--text-subtle)', bg: 'var(--surface-sunken)', border: 'var(--border-subtle)' },
}

const EXAMPLE_PROMPTS = [
  '이 근무표에서 눈에 띄는 문제가 있어?',
  '아침 근무가 특정 학생에게 몰려 있진 않아?',
  '식사 시간 확보를 더 중요하게 보고 다시 짜줘',
]

function toDateOnly(value) {
  return typeof value === 'string' ? value.slice(0, 10) : value
}

// 배정 기준 중요도 조정 결과 — 위반 건수 증감을 기준으로 보여준다
function WeightAdjustResult({ result }) {
  const before = result.violation_diff?.before ?? {}
  const after = result.violation_diff?.after ?? {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => (before[k] ?? 0) !== (after[k] ?? 0))
    .sort((a, b) => Math.abs((after[b] ?? 0) - (before[b] ?? 0)) - Math.abs((after[a] ?? 0) - (before[a] ?? 0)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
        <b style={{ color: 'var(--text-body)' }}>{result.label}</b> 중요도{' '}
        {result.scale?.before?.toFixed(2)} → <b style={{ color: 'var(--text-body)' }}>{result.scale?.after?.toFixed(2)}</b>배
        {result.solver && ` · 재생성 ${result.solver.solve_time_seconds}초`}
      </div>
      {keys.length === 0 ? (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
          위반 건수는 그대로입니다. 한 단계 더 조정해 볼 수 있습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {keys.map(k => {
            const delta = (after[k] ?? 0) - (before[k] ?? 0)
            const improved = delta < 0
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)' }}>
                <span style={{ color: 'var(--text-body)', minWidth: 120 }}>{PENALTY_LABELS[k] ?? k}</span>
                <span style={{ color: 'var(--text-subtle)' }}>{before[k] ?? 0}건 → {after[k] ?? 0}건</span>
                <span style={{ fontWeight: 700, color: improved ? 'var(--success)' : 'var(--warning)' }}>
                  {improved ? '▼' : '▲'} {Math.abs(delta)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 한 턴에 실행된 툴 목록 — 기본은 접어 두고, 무엇을 근거로 답했는지 펼쳐 볼 수 있게
function ToolCallList({ calls }) {
  const [open, setOpen] = useState(false)
  const writes = calls.reduce((n, c) => n + editCount(c), 0)
  const adjust = calls.find(c => c.tool === 'adjust_weight' && c.result?.ok)
  const failures = calls.filter(c => c.result?.error)
  const confirmations = calls.filter(c => c.result?.confirmation_required)

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {adjust && <WeightAdjustResult result={adjust.result} />}

      {confirmations.map((c, i) => (
        <div key={`confirm-${i}`} style={{
          display: 'flex', gap: 8, padding: '10px 12px', fontSize: 'var(--fs-sm)', lineHeight: 1.6,
          background: 'var(--warning-50)', border: '1px solid var(--warning-100)',
          borderRadius: 'var(--radius-sm)', color: 'var(--warning)',
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>이 대화에서 직접 고친 근무 {c.result.pending_manual_edits}건이 재생성으로 사라집니다. 진행하려면 답장으로 알려주세요.</span>
        </div>
      ))}

      {failures.map((c, i) => (
        <div key={`fail-${i}`} style={{
          display: 'flex', gap: 8, padding: '10px 12px', fontSize: 'var(--fs-sm)', lineHeight: 1.6,
          background: 'var(--danger-50)', border: '1px solid var(--danger-100)',
          borderRadius: 'var(--radius-sm)', color: 'var(--danger)',
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><b>{TOOL_LABELS[c.tool] ?? c.tool}</b> 실패 — {c.result.error}</span>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', fontFamily: 'var(--font-sans)',
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Wrench size={11} />
          작업 내역 {calls.length}건{writes > 0 && ` (변경 ${writes}건)`}
        </button>
        {open && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {calls.map((c, i) => (
              <div key={i} style={{
                fontSize: 'var(--fs-caption)', color: 'var(--text-muted)',
                paddingLeft: 18, lineHeight: 1.7,
              }}>
                <span style={{
                  fontWeight: 700,
                  color: c.result?.error ? 'var(--danger)' : WRITE_TOOLS.has(c.tool) ? 'var(--sogang-red)' : 'var(--text-body)',
                }}>
                  {TOOL_LABELS[c.tool] ?? c.tool}
                </span>
                {c.args && Object.keys(c.args).length > 0 && (
                  <span> · {Object.entries(c.args).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 우하단 고정 런처 — 닫혀 있어도 진행 중(busy)·미확인 변경(badge)을 알린다
function Launcher({ onClick, busy, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="시간표 조정 도우미 열기"
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 60,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px 10px 12px', cursor: 'pointer',
        background: 'var(--sogang-red)', border: 'none',
        borderRadius: 999, color: 'var(--text-on-brand)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-body)',
        fontWeight: 'var(--fw-bold)',
      }}
    >
      {/* 마스코트 — 학생 사이드바 카드에서 쓰던 자산을 런처로 옮겨 재사용 (#152) */}
      <img
        src="/assets/stream-mascot.png"
        alt=""
        width={26}
        height={33}
        style={{ objectFit: 'contain', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none' }}
      />
      <span>시간표 조정 도우미</span>
      {busy && (
        <span style={{ fontSize: 'var(--fs-caption)', opacity: 0.9 }}>· 작업 중</span>
      )}
      {!busy && badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--text-on-brand)', color: 'var(--sogang-red)',
          borderRadius: 999, fontSize: 'var(--fs-caption)', fontWeight: 800,
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// 헤더 우측 액션 — 아이콘 또는 짧은 글자. 붉은 배경 위라 색을 반전해 쓴다
function HeaderButton({ label, onClick, disabled, icon, text }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: text ? '3px 9px' : 4,
        background: text ? 'rgba(255,255,255,0.16)' : 'transparent',
        border: 'none', borderRadius: text ? 999 : 'var(--radius-sm)',
        color: 'var(--text-on-brand)', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-bold)',
      }}
    >
      {icon}
      {text}
    </button>
  )
}

function MessageBubble({ message, onRevert, reverting }) {
  const isUser = message.role === 'user'
  const calls = message.tool_calls ?? []
  const status = TURN_STATUS[message.turn_status]
  // 되돌릴 수 있는 턴 = 성공한 쓰기가 있고 아직 되돌리지 않은 턴
  const canRevert =
    !isUser && message.turn_status !== 'reverted' && calls.some(c => editCount(c) > 0)

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '78%', padding: '9px 13px', borderRadius: '12px 12px 3px 12px',
          background: 'var(--sogang-red)', color: 'var(--text-on-brand)',
          fontSize: 'var(--fs-body)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <div style={{
        maxWidth: '88%', padding: '11px 14px', borderRadius: '12px 12px 12px 3px',
        background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
        fontSize: 'var(--fs-body)', color: 'var(--text-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
      }}>
        {message.content}
        {calls.length > 0 && <ToolCallList calls={calls} />}
      </div>

      {(status || canRevert) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
          {status && (
            <span style={{
              fontSize: 'var(--fs-caption)', fontWeight: 700, color: status.color,
              background: status.bg, border: `1px solid ${status.border}`,
              padding: '1px 8px', borderRadius: 4,
            }}>
              {status.label}
            </span>
          )}
          {canRevert && (
            <button
              type="button"
              onClick={() => onRevert(message.message_id)}
              disabled={reverting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 9px', background: 'var(--surface-card)',
                border: '1px solid var(--border-default)', borderRadius: 4,
                fontSize: 'var(--fs-caption)', color: 'var(--text-body)',
                cursor: reverting ? 'default' : 'pointer', opacity: reverting ? 0.6 : 1,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <RotateCcw size={11} /> 이 변경 되돌리기
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScheduleChatPanel({ departmentId, periodStart, periodEnd, onScheduleChanged }) {
  const [open, setOpen] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [savingWeights, setSavingWeights] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  const scrollRef = useRef(null)

  // 이 대화에서 중요도를 조정한 적이 있으면 "부서 기본값으로 저장"을 제안한다
  const hasWeightChange = useMemo(
    () => messages.some(m =>
      m.turn_status !== 'reverted' &&
      (m.tool_calls ?? []).some(c => c.tool === 'adjust_weight' && c.result?.ok)),
    [messages],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending, open])

  // 대화가 열린 채 페이지를 벗어나는 실수를 막지는 않되, ESC로 접을 수는 있게 한다.
  // 닫아도 세션·이력은 그대로라 다시 열면 이어진다.
  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const start = useCallback(async () => {
    setStarting(true)
    setError('')
    try {
      const session = await createChatSession({
        department_id: departmentId,
        period_start: toDateOnly(periodStart),
        period_end: toDateOnly(periodEnd),
      })
      setSessionId(session.session_id)
      setMessages(await fetchChatMessages(session.session_id))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '대화를 시작하지 못했습니다.')
    } finally {
      setStarting(false)
    }
  }, [departmentId, periodStart, periodEnd])

  const send = useCallback(async (text) => {
    const content = text.trim()
    if (!content || sending || !sessionId) return
    setInput('')
    setError('')
    setSavedNote('')
    // 보낸 말이 바로 보이도록 낙관적 추가 — 실패하면 서버 이력으로 되돌린다
    setMessages(prev => [...prev, { message_id: `pending-${Date.now()}`, role: 'user', content }])
    setSending(true)
    try {
      const reply = await sendChatMessage(sessionId, content)
      setMessages(await fetchChatMessages(sessionId))
      // 근무표를 고쳤으면 상위 화면이 다시 불러오게 알린다
      if ((reply.tool_calls ?? []).some(c => editCount(c) > 0)) onScheduleChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '메시지를 보내지 못했습니다.')
      try {
        setMessages(await fetchChatMessages(sessionId))
      } catch {
        setMessages(prev => prev.filter(m => !String(m.message_id).startsWith('pending-')))
      }
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, onScheduleChanged])

  const revert = useCallback(async (messageId) => {
    setReverting(true)
    setError('')
    try {
      await revertChatTurn(sessionId, messageId)
      setMessages(await fetchChatMessages(sessionId))
      onScheduleChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '되돌리지 못했습니다.')
    } finally {
      setReverting(false)
    }
  }, [sessionId, onScheduleChanged])

  const saveWeights = useCallback(async () => {
    setSavingWeights(true)
    setError('')
    try {
      await persistChatWeights(sessionId)
      setSavedNote('이 부서의 기본 중요도로 저장했습니다. 이후 생성부터 적용됩니다.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
    } finally {
      setSavingWeights(false)
    }
  }, [sessionId])

  // 아직 되돌리지 않은 변경 수 — 패널을 닫아 둔 채 확정으로 넘어가지 않도록
  // 런처에 표시한다
  const pendingChanges = useMemo(
    () => messages.filter(m =>
      m.role === 'assistant' && m.turn_status !== 'reverted' &&
      (m.tool_calls ?? []).some(c => editCount(c) > 0)).length,
    [messages],
  )

  const openPanel = useCallback(() => {
    setOpen(true)
    if (!sessionId && !starting) start()   // 처음 열면 바로 대화를 준비한다
  }, [sessionId, starting, start])

  if (!open) {
    return <Launcher onClick={openPanel} busy={sending || starting} badge={pendingChanges} />
  }

  return (
    <div
      role="dialog"
      aria-label="시간표 조정 도우미"
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 60,
        width: 420, maxWidth: 'calc(100vw - 40px)',
        // 화면을 넘지 않게 — 본문만 스크롤되고 헤더·입력창은 고정된다
        height: 'min(620px, calc(100vh - 120px))',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}
    >
      <header style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 12px 11px 16px', background: 'var(--sogang-red)',
        color: 'var(--text-on-brand)',
      }}>
        <Sparkles size={15} style={{ flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-extrabold)',
          fontFamily: 'var(--font-saint)',
        }}>
          시간표 조정 도우미
        </span>
        {sessionId && hasWeightChange && (
          <HeaderButton
            label="중요도를 부서 기본값으로 저장"
            onClick={saveWeights}
            disabled={savingWeights}
            text={savingWeights ? '저장 중' : '기본값 저장'}
          />
        )}
        <HeaderButton label="접기" onClick={() => setOpen(false)} icon={<Minus size={15} />} />
      </header>

      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <p style={{
          margin: 0, padding: '9px 11px', borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
          fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          AI가 <b style={{ color: 'var(--text-body)' }}>초안(draft)만</b> 고칩니다. 요청한 변경은 바로
          반영되고, 마음에 들지 않으면 <b style={{ color: 'var(--text-body)' }}>되돌리기</b>로 취소할 수
          있습니다. 학생에게 공개되는 <b style={{ color: 'var(--text-body)' }}>확정은 마지막 단계에서
          담당자가</b> 합니다.
        </p>

        {error && (
          <div style={{
            display: 'flex', gap: 7, padding: '9px 11px',
            background: 'var(--danger-50)', border: '1px solid var(--danger-100)',
            borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)',
            color: 'var(--danger)', lineHeight: 1.6,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}
        {savedNote && (
          <div style={{
            padding: '9px 11px', background: 'var(--success-50)',
            border: '1px solid var(--success-100)', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--fs-sm)', color: 'var(--success)', lineHeight: 1.6,
          }}>
            {savedNote}
          </div>
        )}

        {starting && (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
            대화를 준비하는 중입니다...
          </div>
        )}

        {sessionId && messages.length === 0 && !starting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>이렇게 물어볼 수 있어요</div>
            {EXAMPLE_PROMPTS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={sending}
                style={{
                  textAlign: 'left', padding: '8px 11px', cursor: 'pointer',
                  background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)',
                  color: 'var(--text-body)', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map(m => (
          <MessageBubble key={m.message_id} message={m} onRevert={revert} reverting={reverting} />
        ))}

        {sending && (
          // 중요도 조정이 걸리면 재생성까지 돌아 수 초 이상 걸린다 —
          // 멈춘 것처럼 보이지 않게 예상 대기를 함께 알린다
          <div style={{
            padding: '9px 12px', borderRadius: '12px 12px 12px 3px',
            background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
            fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', lineHeight: 1.6,
          }}>
            생각하는 중입니다... (근무표를 다시 짜는 경우 10초 이상 걸릴 수 있어요)
          </div>
        )}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input) }}
        style={{
          flexShrink: 0, display: 'flex', gap: 7, padding: '10px 12px',
          borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-card)',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="예: 조수현 학생 월요일 근무를 오후로 옮겨줘"
          disabled={sending || !sessionId}
          style={{
            flex: 1, minWidth: 0, padding: '8px 11px',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--fs-sm)', fontFamily: 'var(--font-sans)',
            color: 'var(--text-body)', background: 'var(--surface-card)',
          }}
        />
        <Button type="submit" size="sm" disabled={sending || !sessionId || !input.trim()}>
          <Send size={13} />
        </Button>
      </form>
    </div>
  )
}

