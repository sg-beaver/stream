// 시간표 검토 챗봇 패널 (#137, REQ-SCHED-019·020·021)
//
// 담당자가 확정 전 draft 근무표를 놓고 AI와 대화한다. AI는 조회(읽기 툴)로
// 근거를 대고, 요청받으면 draft를 직접 고치거나 배정 기준의 중요도를 조정한다.
//
// 화면 설계의 핵심 두 가지:
// 1) 버튼이 "승인"이 아니라 "되돌리기"다 — 변경은 이미 반영된 상태로 도착한다.
//    안전장치는 사전 승인이 아니라 사후 취소이며, 확정(4단계)은 여전히 사람만 한다.
// 2) 중요도 조정 결과는 '위반 건수'로 읽는다 — 중요도를 올리면 위반이 그대로여도
//    비용(penalty)은 배율만큼 부풀기 때문에, 비용 증감을 개선/악화로 오독하기 쉽다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, ChevronDown, ChevronRight, RotateCcw, Send, Sparkles, Wrench,
} from 'lucide-react'

import Button from '../ui/Button'
import { AdminPanel } from './AdminPanel'
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
  move_schedule: '근무 시간 변경',
  remove_schedule: '근무 삭제',
  add_schedule: '근무 추가',
  adjust_weight: '배정 기준 중요도 조정',
}

// 쓰기 툴 — 되돌릴 수 있는 변경. 읽기 툴과 시각적으로 구분한다
const WRITE_TOOLS = new Set(['move_schedule', 'remove_schedule', 'add_schedule', 'adjust_weight'])

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
  const writes = calls.filter(c => WRITE_TOOLS.has(c.tool) && !c.result?.error)
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
          작업 내역 {calls.length}건{writes.length > 0 && ` (변경 ${writes.length}건)`}
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

function MessageBubble({ message, onRevert, reverting }) {
  const isUser = message.role === 'user'
  const calls = message.tool_calls ?? []
  const status = TURN_STATUS[message.turn_status]
  // 되돌릴 수 있는 턴 = 성공한 쓰기가 있고 아직 되돌리지 않은 턴
  const canRevert =
    !isUser && message.turn_status !== 'reverted' && calls.some(c => c.inverse)

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
  }, [messages, sending])

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
      if ((reply.tool_calls ?? []).some(c => c.inverse)) onScheduleChanged?.()
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

  return (
    <AdminPanel
      title="AI와 대화하며 다듬기"
      right={sessionId && hasWeightChange ? (
        <Button variant="secondary" size="sm" onClick={saveWeights} disabled={savingWeights}>
          {savingWeights ? '저장 중...' : '중요도를 부서 기본값으로 저장'}
        </Button>
      ) : null}
    >
      <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        AI가 <b style={{ color: 'var(--text-body)' }}>초안(draft)만</b> 고칩니다. 요청한 변경은 바로 반영되고,
        마음에 들지 않으면 <b style={{ color: 'var(--text-body)' }}>되돌리기</b>로 취소할 수 있습니다.
        학생에게 공개되는 <b style={{ color: 'var(--text-body)' }}>확정은 마지막 단계에서 담당자가</b> 합니다.
      </p>

      {error && (
        <div style={{
          display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 10,
          background: 'var(--danger-50)', border: '1px solid var(--danger-100)',
          borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--danger)',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
      {savedNote && (
        <div style={{
          padding: '10px 14px', marginBottom: 10,
          background: 'var(--success-50)', border: '1px solid var(--success-100)',
          borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--success)',
        }}>
          {savedNote}
        </div>
      )}

      {!sessionId ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>
            초안을 놓고 AI와 대화하며 고칠 수 있습니다.
          </div>
          <Button onClick={start} disabled={starting}>
            <Sparkles size={14} /> {starting ? '준비 중...' : '대화 시작'}
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              maxHeight: 420, overflowY: 'auto', padding: '4px 2px 12px',
            }}
          >
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>이렇게 물어볼 수 있어요</div>
                {EXAMPLE_PROMPTS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    disabled={sending}
                    style={{
                      textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
                      background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)',
                      color: 'var(--text-body)', fontFamily: 'var(--font-sans)',
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
                padding: '9px 13px', borderRadius: '12px 12px 12px 3px',
                background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
                fontSize: 'var(--fs-body)', color: 'var(--text-subtle)', lineHeight: 1.6,
              }}>
                생각하는 중입니다... (근무표를 다시 짜는 경우 10초 이상 걸릴 수 있어요)
              </div>
            )}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); send(input) }}
            style={{ display: 'flex', gap: 8, marginTop: 10 }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="예: 조수현 학생 월요일 근무를 오후로 옮겨줘"
              disabled={sending}
              style={{
                flex: 1, padding: '9px 12px',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--fs-body)', fontFamily: 'var(--font-sans)',
                color: 'var(--text-body)', background: 'var(--surface-card)',
              }}
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              <Send size={14} /> 보내기
            </Button>
          </form>
        </>
      )}
    </AdminPanel>
  )
}
