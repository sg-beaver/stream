import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import Shell from '../components/layout/Shell'
import StatusPill from '../components/ui/StatusPill'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import TimeGrid from '../components/ui/TimeGrid'
import Stepper from '../components/ui/Stepper'
import { applicationUiStatus, formatDateTime, formatPeriod } from '../utils/format'
import { fetchMyApplications, fetchMyClassTime } from '../api/client'
import { parseCoverLetter } from '../utils/coverLetter'
import { CAREER_COLUMNS, LANGUAGE_COLUMNS, CERTIFICATE_COLUMNS } from '../utils/commonApplication'
import { ReadOnlyRowTable } from '../components/ui/ResumeTables'
import { classToHourly } from '../utils/timeSlots'

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [applications, setApplications] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [classSlots, setClassSlots] = useState([]) // 본인 수업 시간 (REQ-SCHED-015) — /profile에서 입력한 값

  useEffect(() => {
    let alive = true
    // 단건 조회 API가 없어 내 지원 목록에서 찾는다
    fetchMyApplications()
      .then(data => { if (alive) setApplications(data) })
      .catch(err => { if (alive) setLoadError(err.message) })
    // /class-time/me는 30분 단위 슬롯을 내려주므로 이 페이지의 1시간 그리드에 맞게 낮춘다
    fetchMyClassTime().then(res => { if (alive) setClassSlots(classToHourly(res.slots)) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (loadError) {
    return (
      <Shell activeMenu="status">
        <div style={{ padding: 64, textAlign: 'center', color: 'var(--danger)' }}>지원 내역을 불러오지 못했습니다. ({loadError})</div>
      </Shell>
    )
  }

  if (!applications) {
    return (
      <Shell activeMenu="status">
        <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>지원 내역을 불러오는 중...</div>
      </Shell>
    )
  }

  const app = applications.find(a => a.application_id === Number(id))

  if (!app) {
    return (
      <Shell activeMenu="status">
        <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>지원 내역을 찾을 수 없습니다.</div>
      </Shell>
    )
  }

  const isRejected = app.status === '불합격'
  const parsed = parseCoverLetter(app.cover_letter)

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 공고 요약 */}
        <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div>
              <StatusPill status={applicationUiStatus(app.status)} label={app.status} style={{ marginBottom: 8 }} />
              <h2 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)' }}>{app.posting_title}</h2>
              {(app.department_name || app.period_start) && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {[app.department_name, formatPeriod(app.period_start, app.period_end)].filter(Boolean).join(' · ')}
                </div>
              )}
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

        {/* 지원서 내용 — cover_letter에 동기/자기소개/경험/가능시간이 병합 저장됨 (#19). 제출 당시 폼과 같은 형태로 복원해서 보여준다 */}
        {parsed ? (
          <>
            <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>지원서 내용</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <ContentBlock label="지원 동기" value={parsed.motivation || '(작성 안 함)'} />
                <ContentBlock label="자기소개" value={parsed.selfIntro || '(작성 안 함)'} />
                <ContentTable label="경력·활동 사항" columns={CAREER_COLUMNS} rows={parsed.careers} />
                <ContentTable label="어학성적" columns={LANGUAGE_COLUMNS} rows={parsed.languages} />
                <ContentTable label="자격증" columns={CERTIFICATE_COLUMNS} rows={parsed.certificates} />
              </div>
            </div>

            {parsed.slots.length > 0 && (
              <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>제출한 근무 가능 시간</h3>
                <TimeGrid classSlots={classSlots} availableSlots={parsed.slots} editable={false} />
              </div>
            )}
          </>
        ) : (
          <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>지원서 내용</h3>
            <ContentBlock label="자기소개서" value={app.cover_letter} />
          </div>
        )}

        {/* 결과 미선발 안내 */}
        {isRejected && (
          <Alert tone="danger" title="미선발 안내">
            아쉽게도 이번 선발에서 미선발 되었습니다. 다른 공고에 지원해 보세요.
            <Button style={{ marginTop: 14 }} variant="secondary" size="sm" onClick={() => navigate('/posts')}>다른 공고 보기</Button>
          </Alert>
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
        border: '1px solid var(--border-subtle)', whiteSpace: 'pre-line',
      }}>
        {value}
      </div>
    </div>
  )
}

function ContentTable({ label, columns, rows }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <ReadOnlyRowTable columns={columns} rows={rows} />
      </div>
    </div>
  )
}

