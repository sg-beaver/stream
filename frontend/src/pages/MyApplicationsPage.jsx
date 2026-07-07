import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import Shell from '../components/layout/Shell'
import StatCard from '../components/ui/StatCard'
import StatusPill from '../components/ui/StatusPill'
import { myApplications, myAppStats } from '../data/mockData'

const STEP_LABELS = ['제출완료', '서류검토', '면접', '결과']

export default function MyApplicationsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('all')

  const filtered = myApplications.filter(a => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'submitted') return a.status === 'submitted'
    if (activeFilter === 'screening') return a.status === 'screening'
    if (activeFilter === 'selected') return a.status === 'selected' || a.status === 'waitlist'
    return true
  })

  return (
    <Shell activeMenu="status">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-strong)' }}>내 지원 현황</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>내가 지원한 교내 근로 공고의 처리 현황을 확인하세요.</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {myAppStats.map(s => (
          <StatCard
            key={s.key}
            stat={s}
            active={activeFilter === s.key}
            onClick={() => setActiveFilter(prev => prev === s.key ? 'all' : s.key)}
          />
        ))}
      </div>

      {/* Application list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '64px 32px', textAlign: 'center', background: 'var(--neutral-0)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: 14 }}>
            해당하는 지원 내역이 없습니다.
          </div>
        ) : filtered.map(app => (
          <ApplicationCard key={app.id} app={app} onClick={() => navigate(`/applications/${app.id}`)} />
        ))}
      </div>
    </Shell>
  )
}

function ApplicationCard({ app, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)', padding: '22px 24px',
        cursor: 'pointer', transition: 'box-shadow var(--dur-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <StatusPill status={app.status} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 3 }}>{app.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            {app.org}{app.dept ? ` · ${app.dept}` : ''} · {app.period}
          </div>

          {/* 단계 진행 표시 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEP_LABELS.map((step, i) => {
              const isDone = i < app.currentStep
              const isCurrent = i === app.currentStep
              const isRejected = app.status === 'rejected'
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: isCurrent && isRejected ? 'var(--danger)' : isCurrent ? 'var(--sogang-red)' : isDone ? 'var(--success)' : 'var(--neutral-200)',
                      margin: '0 auto 4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isDone || isCurrent ? '#fff' : 'var(--text-subtle)' }}>
                        {isDone ? '✓' : i + 1}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: isCurrent ? (isRejected ? 'var(--danger)' : 'var(--sogang-red)') : isDone ? 'var(--success)' : 'var(--text-subtle)', fontWeight: isCurrent || isDone ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {step}
                    </div>
                  </div>
                  {i < 3 && <div style={{ width: 28, height: 2, background: isDone ? 'var(--success)' : 'var(--neutral-200)', margin: '0 2px 18px' }} />}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{app.appliedAt}</span>
          <ChevronRight size={16} color="var(--text-subtle)" />
        </div>
      </div>
    </div>
  )
}
