import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { X, AlertCircle, IdCard, Check, Eye } from 'lucide-react'
import Shell from '../components/layout/Shell'
import Button from '../components/ui/Button'
import Textarea from '../components/ui/Textarea'
import TimeGrid from '../components/ui/TimeGrid'
import { getSessionUser } from '../utils/session'
import { postingUiStatus } from '../utils/format'
import {
  fetchPosting, fetchMyApplications, submitApplication, fetchMyClassTime,
  fetchMyCommonApplication, fetchMyAvailability,
} from '../api/client'
import { RowTable, AddRowButton, TextField } from '../components/ui/ResumeTables'
import {
  commonApplicationFromApi,
  newCareerRow, newLanguageRow, newCertificateRow,
  CAREER_COLUMNS, LANGUAGE_COLUMNS, CERTIFICATE_COLUMNS,
} from '../utils/commonApplication'
import { buildCoverLetter } from '../utils/coverLetter'
import { toHourlySlots, classToHourly } from '../utils/timeSlots'

const EMPTY_RESUME = { basic: { major: '', phone: '', email: '' }, careers: [], languages: [], certificates: [] }

// 경력·어학·자격증 입력 내용을 지원서 제출용 텍스트로 요약 (스펙의 cover_letter는 단일 필드)
function summarizeExperience(resume) {
  const lines = []
  if (resume.careers.length > 0) {
    lines.push('· 경력·활동', ...resume.careers.map(c => {
      const period = [c.periodStart, c.periodEnd].filter(Boolean).join(' ~ ')
      return `  - [${c.type || '경력'}] ${c.org} · ${c.role}${period ? ` (${period})` : ''}${c.detail ? ` — ${c.detail}` : ''}`
    }))
  }
  const quals = [
    ...resume.languages.map(l => {
      const scoreGrade = [l.score, l.grade].filter(Boolean).join('/')
      return `${l.test}${scoreGrade ? ` ${scoreGrade}` : ''}${l.date ? ` (${l.date})` : ''}`
    }),
    ...resume.certificates.map(c => `${c.name}${c.org ? ` - ${c.org}` : ''}${c.date ? ` (${c.date})` : ''}`),
  ]
  if (quals.length > 0) lines.push('· 어학·자격증', ...quals.map(q => `  - ${q}`))
  return lines.join('\n')
}

// 행에 실제 입력된 내용이 있는지 (빈 행만 추가해둔 경우 제외)
function hasContent(row) {
  return Object.entries(row).some(([k, v]) => k !== 'id' && String(v ?? '').trim())
}

export default function ApplicationFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getSessionUser() ?? {}
  const postId = Number(location.state?.postId)
  const [post, setPost] = useState(null)

  const [motivation, setMotivation] = useState('')
  const [selfIntro, setSelfIntro] = useState('')
  const [resume, setResume] = useState(EMPTY_RESUME) // 경력·어학·자격증 — 직접 입력하거나 공통 지원서에서 불러옴
  const [available, setAvailable] = useState([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // 공통 지원서 — 서버가 원본이다(#122). 학생 행은 항상 있으므로 "작성 안 함"은
  // 경력·어학·자격증이 모두 비어 있는 상태로 판단한다.
  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [classSlots, setClassSlots] = useState([]) // 본인 수업 시간 (REQ-SCHED-015) — /profile에서 입력한 값

  function updateBasic(field, value) {
    setResume(prev => ({ ...prev, basic: { ...prev.basic, [field]: value } }))
  }
  function addRow(key, factory) {
    setResume(prev => ({ ...prev, [key]: [...prev[key], factory()] }))
  }
  function updateRow(key, id, field, value) {
    setResume(prev => ({ ...prev, [key]: prev[key].map(r => r.id === id ? { ...r, [field]: value } : r) }))
  }
  function removeRow(key, id) {
    setResume(prev => ({ ...prev, [key]: prev[key].filter(r => r.id !== id) }))
  }

  function loadProfile() {
    if (!profile) return
    setResume({
      basic: { ...profile.basic },
      careers: profile.careers, languages: profile.languages, certificates: profile.certificates,
    })
    if (profile.availableSlots.length) setAvailable(toHourlySlots(profile.availableSlots))
    setProfileLoaded(true)
    setErrors(prev => ({ ...prev, experience: '' }))
  }

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
    fetchMyClassTime().then(res => { if (alive) setClassSlots(classToHourly(res.slots)) }).catch(() => {})
    // 공통 지원서와 근무 가능 시간 — "불러오기" 카드가 쓸 값
    Promise.all([fetchMyCommonApplication(), fetchMyAvailability().catch(() => ({ slots: [] }))])
      .then(([res, avail]) => {
        if (!alive) return
        const mapped = commonApplicationFromApi(res)
        const hasContent = Boolean(
          mapped.careers.length || mapped.languages.length || mapped.certificates.length,
        )
        setProfile(hasContent ? { ...mapped, availableSlots: avail.slots } : null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [postId, navigate])

  function toggleSlot(key) {
    setAvailable(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function validate() {
    const e = {}
    if (!motivation.trim()) e.motivation = '지원 동기를 입력해주세요.'
    else if (motivation.trim().length < 50) e.motivation = '지원 동기를 50자 이상 입력해주세요.'
    if (!selfIntro.trim()) e.selfIntro = '자기소개를 입력해주세요.'
    else if (selfIntro.trim().length < 50) e.selfIntro = '자기소개를 50자 이상 입력해주세요.'
    const hasResumeContent = resume.careers.some(hasContent) || resume.languages.some(hasContent) || resume.certificates.some(hasContent)
    if (!hasResumeContent) e.experience = '경력·활동, 어학성적, 자격증 중 하나 이상 입력하거나 공통 지원서를 불러와주세요.'
    if (available.length === 0) e.available = '근무 가능 시간을 1개 이상 선택해주세요.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const experienceText = summarizeExperience(resume)

  function goToConfirm() {
    if (validate()) { setSubmitError(''); setShowConfirm(true) }
  }

  function handleSubmit(e) {
    e.preventDefault()
    goToConfirm()
  }

  async function handleConfirm() {
    setSubmitting(true)
    try {
      // POST /api/applications — 마감 400, 중복 409
      await submitApplication(postId, buildCoverLetter({ motivation, selfIntro, resume, slots: available }))
      navigate('/apply/complete', { state: { postId, title: post.title, departmentName: post.department_name } })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!post) return null

  return (
    <Shell activeMenu="posts">
      <div>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)' }}>지원서 작성</h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
            {post.department_name && `${post.department_name} · `}{post.title}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 공통 지원서 불러오기 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px',
            background: profileLoaded ? 'var(--success-50)' : 'var(--surface-card)',
            border: profileLoaded ? '1px solid var(--success-100)' : '1.5px solid var(--sogang-red)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <span style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: profileLoaded ? 'var(--success-100)' : 'var(--sogang-red-50)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {profileLoaded ? <Check size={20} color="var(--success)" /> : <IdCard size={20} color="var(--sogang-red)" />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {profileLoaded ? (
                <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--success)' }}>공통 지원서를 불러왔습니다</div>
              ) : profile ? (
                <>
                  <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)' }}>공통 지원서 불러오기</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: 3 }}>저장해 둔 경력·자격증·근무 가능 시간이 자동으로 채워집니다. 지원 동기만 작성하면 끝!</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)' }}>작성된 공통 지원서가 없습니다</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: 3 }}>사이드바의 "공통 지원서"에서 먼저 작성해두면 다음부터 자동으로 채울 수 있어요.</div>
                </>
              )}
            </div>
            {!profileLoaded && profile && (
              <Button type="button" onClick={loadProfile}>불러오기</Button>
            )}
            {!profile && (
              <Button type="button" variant="secondary" onClick={() => navigate('/profile')}>작성하러 가기</Button>
            )}
          </div>

          {/* 지원자 정보 */}
          <FormSection title="지원자 정보" subtitle="이름·학번은 SAINT 학적 정보가 자동으로 불러와집니다.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
              <ReadonlyField label="이름" value={user.name} />
              <ReadonlyField label="학번" value={user.id} />
              <TextField label="학과" value={resume.basic.major} onChange={v => updateBasic('major', v)} placeholder="예: 경영학과" />
              <TextField label="연락처" value={resume.basic.phone} onChange={v => updateBasic('phone', v)} placeholder="010-0000-0000" />
              <TextField label="이메일" value={resume.basic.email} onChange={v => updateBasic('email', v)} placeholder="example@sogang.ac.kr" />
            </div>
          </FormSection>

          {/* 지원 동기 */}
          <FormSection title="지원 동기" required>
            <Textarea
              value={motivation}
              onChange={e => { setMotivation(e.target.value); setErrors(prev => ({ ...prev, motivation: '' })) }}
              placeholder="해당 근로를 지원하게 된 동기를 구체적으로 작성해주세요. (50자 이상)"
              rows={5}
              invalid={Boolean(errors.motivation)}
            />
            {errors.motivation && <ErrorMsg text={errors.motivation} />}
            <div style={{ textAlign: 'right', fontSize: 'var(--fs-sm)', color: motivation.length < 50 ? 'var(--danger)' : 'var(--text-subtle)', marginTop: 4 }}>
              {motivation.length}자
            </div>
          </FormSection>

          {/* 자기소개 */}
          <FormSection title="자기소개" required>
            <Textarea
              value={selfIntro}
              onChange={e => { setSelfIntro(e.target.value); setErrors(prev => ({ ...prev, selfIntro: '' })) }}
              placeholder="본인의 성격, 강점, 근로 태도 등을 자유롭게 작성해주세요. (50자 이상)"
              rows={5}
              invalid={Boolean(errors.selfIntro)}
            />
            {errors.selfIntro && <ErrorMsg text={errors.selfIntro} />}
            <div style={{ textAlign: 'right', fontSize: 'var(--fs-sm)', color: selfIntro.length < 50 ? 'var(--danger)' : 'var(--text-subtle)', marginTop: 4 }}>
              {selfIntro.length}자
            </div>
          </FormSection>

          {/* 경력·활동 사항 */}
          <FormSection title="경력·활동 사항" subtitle="교내근로, 인턴, 동아리, 봉사, 아르바이트 등" required>
            <RowTable
              columns={CAREER_COLUMNS}
              rows={resume.careers}
              onChange={(id, field, value) => { updateRow('careers', id, field, value); setErrors(prev => ({ ...prev, experience: '' })) }}
              onRemove={id => removeRow('careers', id)}
            />
            <AddRowButton label="경력·활동 추가" onClick={() => addRow('careers', newCareerRow)} />
          </FormSection>

          {/* 어학성적 */}
          <FormSection title="어학성적">
            <RowTable
              columns={LANGUAGE_COLUMNS}
              rows={resume.languages}
              onChange={(id, field, value) => { updateRow('languages', id, field, value); setErrors(prev => ({ ...prev, experience: '' })) }}
              onRemove={id => removeRow('languages', id)}
            />
            <AddRowButton label="어학성적 추가" onClick={() => addRow('languages', newLanguageRow)} />
          </FormSection>

          {/* 자격증 */}
          <FormSection title="자격증">
            <RowTable
              columns={CERTIFICATE_COLUMNS}
              rows={resume.certificates}
              onChange={(id, field, value) => { updateRow('certificates', id, field, value); setErrors(prev => ({ ...prev, experience: '' })) }}
              onRemove={id => removeRow('certificates', id)}
            />
            <AddRowButton label="자격증 추가" onClick={() => addRow('certificates', newCertificateRow)} />
            {errors.experience && <ErrorMsg text={errors.experience} />}
          </FormSection>

          {/* 근무 가능 시간 */}
          <FormSection title="근무 가능 시간" required subtitle="수업 시간을 제외한 근무 가능한 시간을 클릭하여 선택해주세요.">
            <TimeGrid classSlots={classSlots} availableSlots={available} editable onToggle={toggleSlot} />
            {errors.available && <ErrorMsg text={errors.available} />}
            {available.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                선택된 시간: {available.length}개
              </div>
            )}
          </FormSection>

          {/* 제출 버튼 */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => navigate(-1)} type="button">취소</Button>
            <Button variant="secondary" type="button" onClick={() => setShowPreview(true)}>
              <Eye size={14} /> 미리보기
            </Button>
            <Button type="submit">지원서 제출</Button>
          </div>
        </form>
      </div>

      {/* 미리보기 모달 */}
      {showPreview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--neutral-0)', borderRadius: 'var(--radius-xl)',
            padding: '32px 36px', width: 520, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: 'var(--shadow-xl)', position: 'relative',
          }}>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              <X size={20} />
            </button>
            <h3 style={{ margin: '0 0 4px', fontSize: 'var(--fs-h3)', fontWeight: 700, color: 'var(--text-strong)' }}>지원서 미리보기</h3>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{post.department_name} · {post.title}</p>

            <PreviewRow label="이름" value={user.name} />
            <PreviewRow label="학번" value={user.id} />
            <PreviewRow label="지원 동기" value={motivation.trim() || '(작성 안 함)'} multiline />
            <PreviewRow label="자기소개" value={selfIntro.trim() || '(작성 안 함)'} multiline />
            <PreviewRow label="관련 경험" value={experienceText.trim() || '(작성 안 함)'} multiline />
            <PreviewRow label="근무 가능 시간" value={available.length > 0 ? `${available.length}개 선택됨 (${available.join(', ')})` : '(선택 안 함)'} multiline />

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Button variant="secondary" block onClick={() => setShowPreview(false)}>닫기</Button>
              <Button block onClick={() => { setShowPreview(false); goToConfirm() }}>제출하기</Button>
            </div>
          </div>
        </div>
      )}

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
              <h3 style={{ margin: '0 0 8px', fontSize: 'var(--fs-h3)', fontWeight: 700, color: 'var(--text-strong)' }}>지원서를 제출하시겠습니까?</h3>
              <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                제출 후에는 내용을 수정하거나 취소할 수 없습니다.<br />
                <strong style={{ color: 'var(--text-strong)' }}>{post.department_name} · {post.title}</strong>에 지원합니다.
              </p>
            </div>
            {submitError && (
              <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-sm)', color: 'var(--danger)', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', textAlign: 'center' }}>
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
          <h3 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
          {required && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)', fontWeight: 600 }}>*</span>}
        </div>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ReadonlyField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{
        height: 38, padding: '0 12px', display: 'flex', alignItems: 'center',
        background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--text-body)',
      }}>
        {value}
      </div>
    </div>
  )
}

function ErrorMsg({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>
      <AlertCircle size={13} />
      {text}
    </div>
  )
}

function PreviewRow({ label, value, multiline }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 'var(--fs-body)', color: 'var(--text-body)', lineHeight: 1.7,
        whiteSpace: multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-word',
      }}>
        {value}
      </div>
    </div>
  )
}
