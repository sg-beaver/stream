import { useState } from 'react'
import { HelpCircle, Check } from 'lucide-react'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import { ErrorNote } from './scheduleBits'
import { answerClarification } from '../../api/client'

// AI가 판단을 멈추고 되물은 항목 (#111). 백엔드는 이 배열을 검토 응답에 담아
// 보내지만 화면이 그리지 않아, 답변할 경로가 없었다 — clarification_answer
// 테이블이 비어 있으니 다음 검토의 "확인된 정보" 섹션도 늘 비고, AI는 같은
// 질문을 매번 다시 했다. 이 컴포넌트가 그 고리를 닫는다.

const TARGET_LABEL = {
  student: '학생 정보',
  department: '부서 정책',
  rule_interpretation: '규칙 해석',
}

// 되묻기 대상 표기 — target_id·field_name은 백엔드가 답변을 다시 찾아올 때 쓰는
// 구조화 키라, 담당자에게도 무엇에 대한 질문인지 그대로 보여준다.
function targetText(req) {
  if (req.target_type === 'rule_interpretation') return '규칙 문구 해석'
  const field = req.field_name ? ` · ${req.field_name}` : ''
  return `${req.target_id ?? ''}${field}`
}

export default function ClarificationRequests({ requests = [] }) {
  const [drafts, setDrafts] = useState({})
  const [saved, setSaved] = useState({})
  const [saving, setSaving] = useState({})
  const [errors, setErrors] = useState({})

  if (!requests.length) return null

  const save = async (req, key) => {
    const answer = (drafts[key] ?? '').trim()
    if (!answer) return
    setSaving(s => ({ ...s, [key]: true }))
    setErrors(e => ({ ...e, [key]: '' }))
    try {
      await answerClarification({
        target_type: req.target_type,
        target_id: req.target_id ?? null,
        field_name: req.field_name ?? null,
        question: req.question,
        answer,
      })
      setSaved(s => ({ ...s, [key]: answer }))
    } catch (err) {
      setErrors(e => ({ ...e, [key]: err.message }))
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  const answeredCount = Object.keys(saved).length

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <HelpCircle size={16} style={{ color: 'var(--info)' }} />
        <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>
          AI가 확인을 요청한 항목 {requests.length}건
        </span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        판단에 필요한 정보가 없어 AI가 결론을 내리지 않은 부분입니다. 답을 적어 두면
        <b style={{ color: 'var(--text-body)' }}> 다음 검토부터 같은 질문을 하지 않고</b> 그 값을 근거로 판단합니다.
        답변은 기록으로만 남고 학생·부서의 실제 값을 바꾸지 않습니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {requests.map((req, i) => {
          const key = `${req.target_type}:${req.target_id ?? ''}:${req.field_name ?? ''}:${i}`
          const done = saved[key]
          return (
            <div
              key={key}
              style={{
                padding: '12px 16px', background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--fs-body)', lineHeight: 1.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)',
                  background: 'var(--info-50)', border: '1px solid var(--info-100)',
                  padding: '1px 8px', borderRadius: 4,
                }}>
                  {TARGET_LABEL[req.target_type] ?? req.target_type}
                </span>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>{targetText(req)}</span>
              </div>
              <div style={{ color: 'var(--text-body)', fontWeight: 600 }}>{req.question}</div>
              {req.reason && (
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
                  필요한 이유: {req.reason}
                </div>
              )}

              {done ? (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8,
                  fontSize: 'var(--fs-sm)', color: 'var(--success)',
                }}>
                  <Check size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>답변 저장됨 — {done}</span>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <Textarea
                    rows={2}
                    placeholder="확인한 내용을 적어주세요"
                    value={drafts[key] ?? ''}
                    disabled={saving[key]}
                    onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                  />
                  {errors[key] && <div style={{ marginTop: 6 }}><ErrorNote message={errors[key]} /></div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Button
                      size="sm" variant="secondary"
                      disabled={saving[key] || !(drafts[key] ?? '').trim()}
                      onClick={() => save(req, key)}
                    >
                      {saving[key] ? '저장 중...' : '답변 저장'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {answeredCount > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
          {answeredCount}건 저장했습니다. 위의 <b style={{ color: 'var(--text-body)' }}>다시 검토</b>를 누르면 이 답변을 반영해 다시 검토합니다.
        </p>
      )}
    </div>
  )
}
