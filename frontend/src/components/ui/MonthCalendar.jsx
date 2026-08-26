import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// 월 달력 기반 주 선택기 — 관리자·학생 근무 시간표 공용.
// 날짜를 클릭하면 그 날이 속한 주(월~일)의 월요일 ISO를 onSelectWeek로 알린다.
// - subDates  : 대타로 근무자가 바뀐 날 (금색 점) — 여러 달을 훑어볼 때 한눈에 찾기 위함.
//   상세(누가 누구 대신)는 주를 선택하면 아래 시간표의 금색 칸에서 확인한다.
// - weekStart : 현재 선택된 주의 월요일 (ISO) — 그 주 전체를 배경 톤으로 강조

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

// maxWidth는 픽셀 대신 비율(%)로 둔다 — 화면 폭이 다른 페이지마다 "적당히 넓지만
// 패널을 꽉 채우진 않는" 정도가 다르므로, 고정 픽셀보다 부모 너비에 비례하는 편이 안전하다.
export default function MonthCalendar({ subDates = [], weekStart, onSelectWeek, maxWidth = '55%' }) {
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

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // 요일 칸을 월요일 시작으로 맞춘다 — 이 앱의 다른 요일 표시(주간 시간표 등)와
  // 통일하고, 선택 단위(주=월~일)와도 그리드 줄이 일치해 선택한 주가 한 줄로 보인다.
  // getDay()는 일=0이라 월=0이 되도록 보정한다.
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const iso = d => `${year}-${pad2(month + 1)}-${pad2(d)}`
  const weekEnd = addDaysIso(weekStart, 6)
  const now = new Date()
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  return (
    <div style={{ maxWidth, minWidth: 340 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={navStyle}><ChevronLeft size={17} color="var(--text-muted)" /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{year}년 {month + 1}월</span>
        <button onClick={nextMonth} style={navStyle}><ChevronRight size={17} color="var(--text-muted)" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['월', '화', '수', '목', '금', '토', '일'].map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-subtle)', fontWeight: 700, padding: '4px 0' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <span key={`pad-${i}`} />
          const dateIso = iso(d)
          const hasSub = subSet.has(dateIso)
          const picked = dateIso >= weekStart && dateIso <= weekEnd
          const isToday = dateIso === today
          return (
            <button
              key={dateIso}
              onClick={() => onSelectWeek(mondayOfIso(dateIso))}
              title="클릭하면 이 날짜가 속한 주가 위 시간표에 반영됩니다"
              style={{
                // aspect-ratio로 시도했으나, 빈 칸(패딩 셀)만 있는 줄에서 그리드 행 높이가
                // 찌그러지는 버그가 있어 고정 높이로 되돌림
                position: 'relative', height: 48, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                border: `1px solid ${picked ? 'var(--saint-tan)' : 'var(--border-subtle)'}`,
                background: picked ? 'var(--saint-tan-soft)' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* 숫자는 점 유무와 무관하게 항상 칸 정중앙에 고정 — 점은 절대 위치로 아래에 따로 붙인다 */}
              <span style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: isToday ? 700 : 500,
                // "오늘"은 앱의 메인 컬러(빨강)를 채운 원으로 표시한다
                background: isToday ? 'var(--sogang-red)' : 'transparent',
                color: isToday ? '#fff' : 'var(--text-body)',
              }}>
                {d}
              </span>
              {hasSub && <span style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', width: 7, height: 7, borderRadius: '50%', background: SUB_GOLD }} />}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--sogang-red)', display: 'inline-block' }} /> 오늘
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: SUB_GOLD, display: 'inline-block' }} /> 대타로 근무자가 바뀐 날
        </span>
      </div>
    </div>
  )
}

const navStyle = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }
