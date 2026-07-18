import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { X, AlertCircle } from 'lucide-react'
import Shell from '../components/layout/Shell'
import Button from '../components/ui/Button'
import TimeGrid from '../components/ui/TimeGrid'
import { getSessionUser } from '../utils/session'
import { postingUiStatus } from '../utils/format'
import { fetchPosting, fetchMyApplications, submitApplication } from '../api/client'

const CLASS_SLOTS = ['화-09:00', '화-10:00', '목-09:00', '목-10:00', '월-13:00']

// 스펙의 cover_letter는 단일 필드 — 폼 입력을 하나로 병합해 제출 (필드 확장 협의: #19)
function buildCoverLetter(motivation, experience, slots) {
  return [
    '[지원 동기]', motivation.trim(),
    '', '[관련 경험]', experience.trim(),
    '', '[근무 가능 시간]', slots.join(', '),
  ].join('\n')
}

export default function ApplicationFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getSessionUser() ?? {}
  const postId = Number(location.state?.postId)
  const [post, setPost] = useState(null)

  const [motivation, setMotivation] = useState('')
  const [experience, setExperience] = useState('')
  const [available, setAvailable] = useState([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // 공고를 거치지 않은 직접 접근, 마감·기지원 공고는 지원 불가
  useEffect(() => {
    let alive = true
    if (!postId) {
      navigate('/posts', { replace: true })
      return
    }
    Promise.all([fetchPosting(postId), fetchMyApplications().catch(() => [])])
      .then(([detail, applications]) => {
        if (!alive) return
        const applied = applications.some(a => a.posting_id === postId)
        if (applied || postingUiStatus(detail) === 'closed') {
          navigate(`/posts/${postId}`, { replace: true })
        } else {
          setPost(detail)
        }
      })
      .catch(() => { if (alive) navigate('/posts', { replace: true }) })
    return () => { alive = false }
  }, [postId, navigate])

  function toggleSlot(key) {
    setAvailable(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function validate() {
    const e = {}
    if (!motivation.trim()) e.motivation = '지원 동기를 입력해주세요.'
    else if (motivation.trim().length < 50) e.motivation = '지원 동기를 50자 이상 입력해주세요.'
    if (!experience.trim()) e.experience = '관련 경험을 입력해주세요.'
    if (available.length === 0) e.available = '근무 가능 시간을 1개 이상 선택해주세요.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (validate()) { setSubmitError(''); setShowConfirm(true) }
  }

  async function handleConfirm() {
    setSubmitting(true)
    try {
      // POST /api/applications — 마감 400, 중복 409
      await submitApplication(postId, buildCoverLetter(motivation, experience, available))
      navigate('/apply/complete', { state: { postId, title: post.title, departmentName: post.department_name } })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!post) return null

  return (
    <Shell activeMenu="apply">
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)' }}>지원서 작성</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {post.department_name && `${post.department_name} · `}{post.title}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 지원자 정보 */}
          <FormSection title="지원자 정보" subtitle="SAINT 학적 정보가 자동으로 불러와집니다.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
              <ReadonlyField label="이름" value={user.name} />
              <ReadonlyField label="학번" value={user.id} />
            </div>
          </FormSection>

          {/* 지원 동기 */}
          <FormSection title="지원 동기" required>
            <textarea
              value={motivation}
              onChange={e => { setMotivation(e.target.value); setErrors(prev => ({ ...prev, motivation: '' })) }}
              placeholder="해당 근로를 지원하게 된 동기를 구체적으로 작성해주세요. (50자 이상)"
              rows={5}
              style={{
                width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                border: `1px solid ${errors.motivation ? 'var(--danger)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--text-strong)', resize: 'vertical', outline: 'none',
                background: 'var(--neutral-0)', lineHeight: 1.7,
              }}
            />
            {errors.motivation && <ErrorMsg text={errors.motivation} />}
            <div style={{ textAlign: 'right', fontSize: 12, color: motivation.length < 50 ? 'var(--danger)' : 'var(--text-subtle)', marginTop: 4 }}>
              {motivation.length}자
            </div>
          </FormSection>

          {/* 관련 경험 */}
          <FormSection title="관련 경험" required>
            <textarea
              value={experience}
              onChange={e => { setExperience(e.target.value); setErrors(prev => ({ ...prev, experience: '' })) }}
              placeholder="해당 근로와 관련된 경험이나 역량을 작성해주세요."
              rows={4}
              style={{
                width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                border: `1px solid ${errors.experience ? 'var(--danger)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--text-strong)', resize: 'vertical', outline: 'none',
                background: 'var(--neutral-0)', lineHeight: 1.7,
              }}
            />
            {errors.experience && <ErrorMsg text={errors.experience} />}
          </FormSection>

          {/* 근무 가능 시간 */}
          <FormSection title="근무 가능 시간" required subtitle="수업 시간을 제외한 근무 가능한 시간을 클릭하여 선택해주세요.">
            <TimeGrid classSlots={CLASS_SLOTS} availableSlots={available} editable onToggle={toggleSlot} />
            {errors.available && <ErrorMsg text={errors.available} />}
            {available.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                선택된 시간: {available.length}개
              </div>
            )}
          </FormSection>

          {/* 제출 버튼 */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => navigate(-1)} type="button">취소</Button>
            <Button type="submit">지원서 제출</Button>
          </div>
        </form>
      </div>

      {/* 제출 확인 모달 (S-04) */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--neutral-0)', borderRadius: 'var(--radius-xl)',
            padding: '32px 36px', width: 420, maxWidth: '90vw',
            boxShadow: 'var(--shadow-xl)', position: 'relative',
          }}>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              <X size={20} />
            </button>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--warning-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <AlertCircle size={26} color="var(--warning)" />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>지원서를 제출하시겠습니까?</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                제출 후에는 내용을 수정하거나 취소할 수 없습니다.<br />
                <strong style={{ color: 'var(--text-strong)' }}>{post.department_name} · {post.title}</strong>에 지원합니다.
              </p>
            </div>
            {submitError && (
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--danger)', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', textAlign: 'center' }}>
                {submitError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" block onClick={() => setShowConfirm(false)} disabled={submitting}>다시 확인</Button>
              <Button block onClick={handleConfirm} disabled={submitting}>{submitting ? '제출 중...' : '제출하기'}</Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function FormSection({ title, subtitle, required, children }) {
  return (
    <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
          {required && <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>*</span>}
        </div>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ReadonlyField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{
        height: 38, padding: '0 12px', display: 'flex', alignItems: 'center',
        background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text-body)',
      }}>
        {value}
      </div>
    </div>
  )
}

function ErrorMsg({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
      <AlertCircle size={13} />
      {text}
    </div>
  )
}
