import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ExternalLink, ChevronRight, RotateCcw } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import Input from '../components/ui/Input'
import StatCard from '../components/ui/StatCard'
import Stepper from '../components/ui/Stepper'
import { myAppStats } from '../data/mockData'
import { formatDateTime, formatPeriod } from '../utils/format'
import { fetchMyApplications } from '../api/client'

// 지원 상태는 스펙 값(제출완료/검토중/합격/불합격)을 그대로 사용
const CHIPS = [
  { label: '전체',    key: 'all' },
  { label: '제출완료', key: '제출완료' },
  { label: '검토중',   key: '검토중' },
  { label: '합격',     key: '합격' },
  { label: '불합격',   key: '불합격' },
]

const STATUS_TONE = {
  '제출완료': { bg: 'var(--info-50)',    fg: 'var(--info)' },
  '검토중':   { bg: 'var(--warning-50)', fg: 'var(--warning)' },
  '합격':     { bg: 'var(--success-50)', fg: 'var(--success)' },
  '불합격':   { bg: 'var(--neutral-100)', fg: 'var(--neutral-600)' },
}

export default function MyApplicationsPage() {
  const navigate = useNavigate()
  const [chip, setChip] = useState('all')
  const [query, setQuery] = useState('')
  const [applications, setApplications] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    fetchMyApplications()
      .then(data => { if (alive) setApplications(data) })
      .catch(err => { if (alive) setLoadError(err.message) })
    return () => { alive = false }
  }, [])

  // 통계 카드 수치는 실제 지원 데이터에서 계산
  const stats = useMemo(() => {
    const list = applications ?? []
    const counts = {
      all: list.length,
      submitted: list.filter(a => a.status === '제출완료').length,
      screening: list.filter(a => a.status === '검토중').length,
      selected: list.filter(a => a.status === '합격').length,
    }
    return myAppStats.map(s => ({ ...s, value: applications ? String(counts[s.key]) : '–' }))
  }, [applications])

  const filtered = (applications ?? []).filter(a => {
    const matchChip = chip === 'all' || a.status === chip
    const matchQuery = !query || a.posting_title.includes(query) || (a.department_name ?? '').includes(query)
    return matchChip && matchQuery
  })

  return (
    <Shell activeMenu="status">
      <PageTitle>내 지원 현황</PageTitle>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {stats.map(s => <StatCard key={s.key} stat={s} />)}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {CHIPS.map(c => {
          const on = chip === c.key
          return (
            <button
              key={c.key}
              onClick={() => setChip(c.key)}
              style={{
                height: 36, padding: '0 16px',
                background: 'var(--surface-card)',
                border: `1px solid ${on ? 'var(--saint-red)' : 'var(--border-subtle)'}`,
                borderRadius: 8, fontSize: 13,
                fontWeight: on ? 700 : 500,
                color: on ? 'var(--saint-red)' : 'var(--text-body)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {c.label}
            </button>
          )
        })}

        {/* 검색 */}
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="공고명, 부서명으로 검색"
          iconRight={<Search size={14} />}
          style={{ marginLeft: 'auto', width: 260 }}
        />

        <button
          onClick={() => { setChip('all'); setQuery('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          <RotateCcw size={13} color="var(--text-subtle)" /> 초기화
        </button>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-body)', marginBottom: 12 }}>
        총 <b style={{ color: 'var(--text-strong)' }}>{filtered.length}개</b>의 지원 내역
      </div>

      {/* Table */}
      {loadError ? (
        <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 12, padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>지원 내역을 불러오지 못했습니다</div>
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{loadError}</div>
        </div>
      ) : !applications ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>지원 내역을 불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>해당하는 지원 내역이 없습니다</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>다른 필터를 선택하거나 검색어를 변경해보세요.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--saint-tan)', borderBottom: '1px solid var(--saint-tan-strong)' }}>
                {[
                  { label: '공고명 / 부서', align: 'left', pl: 20 },
                  { label: '지원 기간', w: 190 },
                  { label: '지원일', w: 160 },
                  { label: '현재 상태', w: 100 },
                  { label: '진행 단계', w: 240 },
                  { label: '관리', w: 160 },
                ].map(({ label, w, align, pl }) => (
                  <th key={label} style={{
                    padding: `11px ${pl ?? 16}px`, fontSize: 13, fontWeight: 700,
                    color: 'var(--text-strong)', textAlign: align ?? 'center',
                    width: w, whiteSpace: 'nowrap',
                  }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((app, i) => {
                const tone = STATUS_TONE[app.status] || { bg: 'var(--neutral-100)', fg: 'var(--neutral-600)' }
                return (
                  <tr
                    key={app.application_id}
                    style={{ borderBottom: i === filtered.length - 1 ? 'none' : '1px solid var(--saint-tan-strong)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--saint-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {/* 공고명/부서 */}
                    <td style={{ padding: '16px 20px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{app.posting_title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 3 }}>
                        {app.department_name}
                      </div>
                    </td>

                    {/* 지원 기간 — API 응답 확장 협의 대상(#19) */}
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--text-strong)', whiteSpace: 'nowrap', border: '1px solid var(--border-subtle)' }}>
                      {formatPeriod(app.period_start, app.period_end) || '—'}
                    </td>

                    {/* 지원일 */}
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--text-strong)', whiteSpace: 'nowrap', border: '1px solid var(--border-subtle)' }}>
                      {formatDateTime(app.submitted_at)}
                    </td>

                    {/* 현재 상태 */}
                    <td style={{ padding: '16px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                      <span style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                        background: tone.bg, color: tone.fg,
                        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                      }}>
                        {app.status}
                      </span>
                    </td>

                    {/* 진행 단계 */}
                    <td style={{ padding: '16px 24px', border: '1px solid var(--border-subtle)' }}>
                      <Stepper status={app.status} size="sm" />
                    </td>

                    {/* 관리 */}
                    <td style={{ padding: '16px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          onClick={() => navigate(`/applications/${app.application_id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            height: 32, padding: '0 10px', background: 'var(--surface-card)',
                            border: '1px solid var(--border-default)', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, color: 'var(--text-body)',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          지원 상세 보기 <ChevronRight size={13} color="var(--text-subtle)" />
                        </button>
                        <button
                          onClick={() => navigate(`/posts/${app.posting_id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            height: 32, padding: '0 10px', background: 'var(--surface-card)',
                            border: '1px solid var(--border-default)', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, color: 'var(--text-body)',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          공고 다시 보기 <ExternalLink size={13} color="var(--text-subtle)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}
