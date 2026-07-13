import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ExternalLink, ChevronRight, RotateCcw } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import StatCard from '../components/ui/StatCard'
import { myApplications, myAppStats } from '../data/mockData'

const CHIPS = [
  { label: '전체',    key: 'all' },
  { label: '지원완료', key: 'submitted' },
  { label: '검토 중', key: 'screening' },
  { label: '면접 진행', key: 'interview' },
  { label: '최종 합격', key: 'selected' },
  { label: '미선발',  key: 'rejected' },
]

const STATUS_LABEL = {
  submitted: '지원완료',
  screening: '검토 중',
  interview: '면접 진행',
  selected:  '최종 합격',
  rejected:  '미선발',
}

const STATUS_TONE = {
  submitted: { bg: '#E8F0FB', fg: '#2563C9' },
  screening: { bg: '#FDEEE0', fg: '#D9791F' },
  interview: { bg: '#EEEAFB', fg: '#6D4FCB' },
  selected:  { bg: '#E7F4EA', fg: '#1F8A4C' },
  rejected:  { bg: '#EEF0F2', fg: '#6B7280' },
}

const STEPS = ['제출완료', '서류검토', '면접', '결과']

function Stepper({ currentStep, status }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STEPS.map((step, i) => {
        const done = i < currentStep
        const isCurrent = i === currentStep
        const isFail = status === 'rejected' && i === 3
        const isPass = status === 'selected' && i === 3

        let bg = '#fff', border = '#D5D8DC', textColor = '#9AA1A9', content = null
        if (done) {
          bg = '#1F8A4C'; border = '#1F8A4C'; textColor = '#1F8A4C'; content = '✓'
        } else if (isCurrent) {
          if (isFail)        { bg = '#9AA1A9'; border = '#9AA1A9'; textColor = '#6B7280'; content = '✕' }
          else if (isPass)   { bg = '#1F8A4C'; border = '#1F8A4C'; textColor = '#1F8A4C'; content = '✓' }
          else if (i === 2)  { bg = '#6D4FCB'; border = '#6D4FCB'; textColor = '#6D4FCB'; content = '●' }
          else if (i === 1)  { bg = '#D9791F'; border = '#D9791F'; textColor = '#D9791F'; content = '●' }
          else               { bg = '#1F8A4C'; border = '#1F8A4C'; textColor = '#1F8A4C'; content = '✓' }
        }

        return (
          <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: i < 3 ? 1 : '0 0 auto', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center', position: 'relative' }}>
              {i > 0 && (
                <span style={{
                  position: 'absolute', right: '50%', width: '100%', height: 2,
                  background: done ? '#1F8A4C' : '#E6E8EB', top: 9,
                }} />
              )}
              <span style={{
                position: 'relative', width: 20, height: 20, borderRadius: '50%',
                background: bg, border: `2px solid ${border}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1, fontSize: 9, color: '#fff', fontWeight: 700,
              }}>
                {content}
              </span>
            </div>
            <span style={{ fontSize: 10, color: textColor, marginTop: 5, whiteSpace: 'nowrap', fontWeight: (done || isCurrent) ? 600 : 400 }}>
              {step}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function MyApplicationsPage() {
  const navigate = useNavigate()
  const [chip, setChip] = useState('all')
  const [query, setQuery] = useState('')

  const filtered = myApplications.filter(a => {
    const matchChip = chip === 'all' || a.status === chip
    const matchQuery = !query || a.title.includes(query) || a.org.includes(query)
    return matchChip && matchQuery
  })

  return (
    <Shell activeMenu="status">
      <PageTitle>내 지원 현황</PageTitle>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {myAppStats.map(s => <StatCard key={s.key} stat={s} />)}
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
                const tone = STATUS_TONE[app.status] || { bg: '#EEF0F2', fg: '#6B7280' }
                return (
                  <tr
                    key={app.id}
                    style={{ borderBottom: i === filtered.length - 1 ? 'none' : '1px solid #ccbda7' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FBF8EE'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {/* 공고명/부서 */}
                    <td style={{ padding: '16px 20px', border: '1px solid #E5E5E5' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#32363A' }}>{app.title}</div>
                      <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 3 }}>
                        {app.org}{app.dept ? ` · ${app.dept}` : ''}
                      </div>
                    </td>

                    {/* 지원 기간 */}
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#32363A', whiteSpace: 'nowrap', border: '1px solid #E5E5E5' }}>
                      {app.period}
                    </td>

                    {/* 지원일 */}
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#32363A', whiteSpace: 'nowrap', border: '1px solid #E5E5E5' }}>
                      {app.appliedAt}
                    </td>

                    {/* 현재 상태 */}
                    <td style={{ padding: '16px', textAlign: 'center', border: '1px solid #E5E5E5' }}>
                      <span style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                        background: tone.bg, color: tone.fg,
                        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                      }}>
                        {STATUS_LABEL[app.status] ?? app.status}
                      </span>
                    </td>

                    {/* 진행 단계 */}
                    <td style={{ padding: '16px 24px', border: '1px solid #E5E5E5' }}>
                      <Stepper currentStep={app.currentStep} status={app.status} />
                    </td>

                    {/* 관리 */}
                    <td style={{ padding: '16px', border: '1px solid #E5E5E5' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          onClick={() => navigate(`/applications/${app.id}`)}
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
                          onClick={() => navigate(`/posts/${app.postId}`)}
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
