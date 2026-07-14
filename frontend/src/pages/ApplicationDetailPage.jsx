import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import Shell from '../components/layout/Shell'
import StatusPill from '../components/ui/StatusPill'
import Button from '../components/ui/Button'
import TimeGrid from '../components/ui/TimeGrid'
import Stepper from '../components/ui/Stepper'
import { myApplications } from '../data/mockData'
import { applicationUiStatus, formatDateTime } from '../utils/format'

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const app = myApplications.find(a => a.application_id === Number(id))

  if (!app) {
    return (
      <Shell activeMenu="status">
        <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>지원 내역을 찾을 수 없습니다.</div>
      </Shell>
    )
  }

  const isRejected = app.status === '불합격'

  return (
    <Shell activeMenu="status">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', padding: 0 }}
      >
        <ChevronLeft size={16} /> 지원 현황으로
      </button>

      <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 공고 요약 */}
        <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div>
              <StatusPill status={applicationUiStatus(app.status)} label={app.status} style={{ marginBottom: 8 }} />
              <h2 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)' }}>{app.posting_title}</h2>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                {app.department_name} · {app.period}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>지원일시: {formatDateTime(app.submitted_at)}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/posts/${app.posting_id}`)}>공고 보기</Button>
          </div>

          {/* 단계 진행 */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 16 }}>진행 현황</div>
            <Stepper status={app.status} size="lg" />
          </div>
        </div>

        {/* 지원서 내용 */}
        <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>지원서 내용</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ContentBlock label="지원 동기" value={app.cover_letter} />
            <ContentBlock label="관련 경험" value={app.experience} />
          </div>
        </div>

        {/* 근무 가능 시간 */}
        <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>제출한 근무 가능 시간</h3>
          <TimeGrid classSlots={app.classSlots} availableSlots={app.availableSlots} editable={false} />
        </div>

        {/* 결과 미선발 안내 */}
        {isRejected && (
          <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-xl)', padding: '20px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>미선발 안내</div>
            <div style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.6 }}>
              아쉽게도 이번 선발에서 미선발 되었습니다. 다른 공고에 지원해 보세요.
            </div>
            <Button style={{ marginTop: 14 }} variant="secondary" size="sm" onClick={() => navigate('/posts')}>다른 공고 보기</Button>
          </div>
        )}
      </div>
    </Shell>
  )
}

function ContentBlock({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{
        padding: '14px 16px', background: 'var(--neutral-50)',
        borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--text-body)', lineHeight: 1.7,
        border: '1px solid var(--border-subtle)',
      }}>
        {value}
      </div>
    </div>
  )
}
