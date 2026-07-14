import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, MapPin, Mail, Phone, Clock } from 'lucide-react'
import Shell from '../components/layout/Shell'
import StatusPill from '../components/ui/StatusPill'
import Button from '../components/ui/Button'
import { postDetails, posts } from '../data/mockData'
import { postingUiStatus, calcDday, formatDate } from '../utils/format'

export default function PostDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const postingId = Number(id)
  const detail = postDetails[postingId]
  const summary = posts.find(p => p.posting_id === postingId)

  if (!detail && !summary) {
    return (
      <Shell activeMenu="posts">
        <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>공고를 찾을 수 없습니다.</div>
      </Shell>
    )
  }

  const post = detail || { ...summary, workSlots: [] }
  const uiStatus = postingUiStatus(post)
  // 스펙의 description/qualification은 문자열이므로 줄 단위로 나눠 목록으로 표시
  const duties = post.description ? post.description.split('\n').filter(Boolean) : []
  const qualifications = post.qualification ? post.qualification.split('\n').filter(Boolean) : []

  function handleApply() {
    navigate('/apply', { state: { postId: postingId } })
  }

  const canApply = !post.applied && uiStatus !== 'closed'

  return (
    <Shell activeMenu="posts">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', padding: 0 }}
      >
        <ChevronLeft size={16} /> 공고 목록으로
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }}>
        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header card */}
          <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <StatusPill status={uiStatus} style={{ marginBottom: 10 }} />
                <h2 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)', lineHeight: 1.3 }}>{post.title}</h2>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>{post.department_name}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 24px', padding: '20px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginTop: 20 }}>
              <InfoRow label="모집인원" value={post.headcount} />
              <InfoRow label="주간 최대 근무" value={post.weeklyMax} />
              <InfoRow label="근로 기간" value={post.period} />
              <InfoRow label="지원 마감" value={formatDate(post.deadline)} />
            </div>
          </div>

          {/* 업무 내용 */}
          {duties.length > 0 && (
            <Section title="업무 내용">
              <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {duties.map((d, i) => <li key={i} style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.7 }}>{d}</li>)}
              </ul>
            </Section>
          )}

          {/* 우대사항 */}
          {qualifications.length > 0 && (
            <Section title="자격 요건 및 우대사항">
              <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {qualifications.map((q, i) => <li key={i} style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.7 }}>{q}</li>)}
              </ul>
            </Section>
          )}

          {/* 근무 시간대 표시 */}
          {post.workSlots?.length > 0 && (
            <Section title="근무 요일·시간">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {post.workSlots.map(s => (
                  <span key={s} style={{
                    fontSize: 12, fontWeight: 600, padding: '4px 12px',
                    background: 'var(--sogang-red-50)', color: 'var(--sogang-red)',
                    border: '1px solid var(--sogang-red-200)',
                    borderRadius: 'var(--radius-pill)',
                  }}>
                    {s.replace('-', ' ')}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
          {/* Apply card */}
          <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 22px' }}>
            {post.applied ? (
              <>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>이미 지원한 공고입니다.</p>
                <Button variant="secondary" block onClick={() => navigate(`/applications/${post.application_id}`)}>내 지원 현황 보기</Button>
              </>
            ) : canApply ? (
              <>
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--warning-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning-100)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 2 }}>지원 마감까지</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sogang-red)' }}>{calcDday(post.deadline) || 'D-?'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{formatDate(post.deadline)}</div>
                </div>
                <Button block onClick={handleApply}>지원하기</Button>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>현재 지원할 수 없는 공고입니다.</p>
            )}
          </div>

          {/* Contact info */}
          <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 14 }}>담당자 정보</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {post.location && <ContactRow icon={<MapPin size={14} color="var(--text-muted)" />} text={post.location} />}
              {post.contactEmail && <ContactRow icon={<Mail size={14} color="var(--text-muted)" />} text={post.contactEmail} />}
              {post.contactPhone && <ContactRow icon={<Phone size={14} color="var(--text-muted)" />} text={post.contactPhone} />}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
      {children}
    </div>
  )
}

function ContactRow({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-body)' }}>
      {icon}
      <span>{text}</span>
    </div>
  )
}
