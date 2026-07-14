import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ExternalLink, ChevronRight, RotateCcw } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import StatCard from '../components/ui/StatCard'
import Stepper from '../components/ui/Stepper'
import { myApplications, myAppStats } from '../data/mockData'
import { formatDateTime } from '../utils/format'

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

  // 통계 카드 수치는 실제 지원 데이터에서 계산
  const stats = useMemo(() => {
    const counts = {
      all: myApplications.length,
      submitted: myApplications.filter(a => a.status === '제출완료').length,
      screening: myApplications.filter(a => a.status === '검토중').length,
      selected: myApplications.filter(a => a.status === '합격').length,
    }
    return myAppStats.map(s => ({ ...s, value: String(counts[s.key]) }))
  }, [])

  const filtered = myApplications.filter(a => {
    const matchChip = chip === 'all' || a.status === chip
    const matchQuery = !query || a.posting_title.includes(query) || a.department_name.includes(query)
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
                background: '#fff',
                border: `1px solid ${on ? '#B60005' : '#E6E8EB'}`,
                borderRadius: 8, fontSize: 13,
                fontWeight: on ? 700 : 500,
                color: on ? '#B60005' : '#4B5563',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {c.label}
            </button>
          )
        })}

        {/* 검색 */}
        <div style={{ position: 'relative', marginLeft: 'auto', width: 260 }}>
          <Search size={14} color="#9AA1A9" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="공고명, 부서명으로 검색"
            style={{
              width: '100%', height: 36, padding: '0 36px 0 12px',
              border: '1px solid #DADEE3', borderRadius: 8,
              fontSize: 13, fontFamily: 'var(--font-sans)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={() => { setChip('all'); setQuery('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 8, fontSize: 13, color: '#6B7280', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          <RotateCcw size={13} color="#9AA1A9" /> 초기화
        </button>
      </div>

      <div style={{ fontSize: 14, color: '#4B5563', marginBottom: 12 }}>
        총 <b style={{ color: '#1F2937' }}>{filtered.length}개</b>의 지원 내역
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginBottom: 6 }}>해당하는 지원 내역이 없습니다</div>
          <div style={{ fontSize: 13, color: '#9AA1A9' }}>다른 필터를 선택하거나 검색어를 변경해보세요.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#dfd5c7', borderBottom: '1px solid #ccbda7' }}>
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
                    color: '#32363A', textAlign: align ?? 'center',
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
                    style={{ borderBottom: i === filtered.length - 1 ? 'none' : '1px solid #ccbda7' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FBF8EE'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {/* 공고명/부서 */}
                    <td style={{ padding: '16px 20px', border: '1px solid #E5E5E5' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#32363A' }}>{app.posting_title}</div>
                      <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 3 }}>
                        {app.department_name}
                      </div>
                    </td>

                    {/* 지원 기간 */}
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#32363A', whiteSpace: 'nowrap', border: '1px solid #E5E5E5' }}>
                      {app.period}
                    </td>

                    {/* 지원일 */}
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#32363A', whiteSpace: 'nowrap', border: '1px solid #E5E5E5' }}>
                      {formatDateTime(app.submitted_at)}
                    </td>

                    {/* 현재 상태 */}
                    <td style={{ padding: '16px', textAlign: 'center', border: '1px solid #E5E5E5' }}>
                      <span style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                        background: tone.bg, color: tone.fg,
                        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                      }}>
                        {app.status}
                      </span>
                    </td>

                    {/* 진행 단계 */}
                    <td style={{ padding: '16px 24px', border: '1px solid #E5E5E5' }}>
                      <Stepper status={app.status} size="sm" />
                    </td>

                    {/* 관리 */}
                    <td style={{ padding: '16px', border: '1px solid #E5E5E5' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          onClick={() => navigate(`/applications/${app.application_id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            height: 32, padding: '0 10px', background: '#fff',
                            border: '1px solid #DADEE3', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, color: '#3A4048',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          지원 상세 보기 <ChevronRight size={13} color="#9AA1A9" />
                        </button>
                        <button
                          onClick={() => navigate(`/posts/${app.posting_id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            height: 32, padding: '0 10px', background: '#fff',
                            border: '1px solid #DADEE3', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, color: '#3A4048',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          공고 다시 보기 <ExternalLink size={13} color="#9AA1A9" />
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
