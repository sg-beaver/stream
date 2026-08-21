import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// 대타 발생 캘린더 (#71 화면명세) — 관리자·학생 근무 시간표 공용.
// 날짜를 클릭하면 그 날이 속한 주(월~일)의 월요일 ISO를 onSelectWeek로 알린다.
// - subDates  : 대타로 근무자가 바뀐 날 (금색 점 + 붉은 배경)
// - workDates : 확정 근무가 있는 날 (옅은 점)
// - weekStart : 현재 선택된 주의 월요일 (ISO) — 그 주 전체를 테두리로 강조

const SUB_GOLD = '#B8860B'

const pad2 = n => String(n).padStart(2, '0')

const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

export function mondayOfIso(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

export default function MonthCalendar({ subDates = [], workDates = [], weekStart, onSelectWeek, maxWidth = 560 }) {
  const [y0, m0] = weekStart.split('-').map(Number)
  const [year, setYear] = useState(y0)
  const [month, setMonth] = useState(m0 - 1) // 0-indexed

  // 부모가 weekStart를 바꾸면(주 이동·가까운 주 스냅) 선택된 주가 보이도록 그 달로 따라간다.
  // 화살표로 다른 달을 구경하는 것은 자유지만, 선택이 바뀌는 순간 다시 동기화한다.
  useEffect(() => {
    setYear(y0)
    setMonth(m0 - 1)
  }, [y0, m0])

  const subSet = useMemo(() => new Set(subDates), [subDates])
  const workSet = useMemo(() => new Set(workDates), [workDates])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const iso = d => `${year}-${pad2(month + 1)}-${pad2(d)}`
  const weekEnd = addDaysIso(weekStart, 6)
  const now = new Date()
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  return (
    <div style={{ maxWidth }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={navStyle}><ChevronLeft size={17} color="var(--text-muted)" /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{year}년 {month + 1}월</span>
        <button onClick={nextMonth} style={navStyle}><ChevronRight size={17} color="var(--text-muted)" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-subtle)', fontWeight: 700, padding: '4px 0' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <span key={`pad-${i}`} />
          const dateIso = iso(d)
          const hasSub = subSet.has(dateIso)
          const hasWork = workSet.has(dateIso)
          const picked = dateIso >= weekStart && dateIso <= weekEnd
          const isToday = dateIso === today
          return (
            <button
              key={dateIso}
              onClick={() => onSelectWeek(mondayOfIso(dateIso))}
              title="클릭하면 이 날짜가 속한 주가 위 시간표에 반영됩니다"
              style={{
                height: 52, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                border: picked ? '2px solid var(--sogang-red)' : `1px solid ${hasSub ? 'var(--sogang-red-100)' : 'var(--border-subtle)'}`,
                background: hasSub ? 'var(--sogang-red-50)' : picked ? 'var(--saint-row-hover)' : '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: hasSub || isToday ? 700 : 500,
                color: hasSub ? 'var(--sogang-red)' : isToday ? 'var(--text-strong)' : hasWork ? 'var(--text-body)' : 'var(--text-subtle)',
              }}>
                {d}
              </span>
              {hasSub
                ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUB_GOLD }} />
                : hasWork && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sogang-red-100)' }} />}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: SUB_GOLD, display: 'inline-block' }} /> 대타로 근무자가 바뀐 날
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sogang-red-100)', display: 'inline-block' }} /> 확정 근무가 있는 날
        </span>
      </div>
    </div>
  )
}

const navStyle = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }
