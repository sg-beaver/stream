import { useEffect, useRef, useState } from 'react'
import { Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function parseDate(value) {
  const m = String(value ?? '').match(/^(\d{4})\.(\d{2})\.(\d{2})$/)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function formatDate({ year, month, day }) {
  const p2 = n => String(n).padStart(2, '0')
  return `${year}.${p2(month)}.${p2(day)}`
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

// 1일이 위치한 요일만큼 앞뒤로 이전/다음 달 날짜를 채워 7의 배수 칸을 만듦
function buildCalendarGrid(year, month) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const prevTotalDays = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)
  const cells = []
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ day: prevTotalDays - firstWeekday + 1 + i, outside: true })
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, outside: false })
  }
  let nextDay = 1
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, outside: true })
  }
  return cells
}

export default function DatePicker({ value, onChange, placeholder = 'YYYY.MM.DD' }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => parseDate(value)?.year ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => parseDate(value)?.month ?? new Date().getMonth() + 1)
  const [pendingDay, setPendingDay] = useState(() => parseDate(value)?.day ?? null)
  const rootRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function openPicker() {
    const today = new Date()
    const parsed = parseDate(value)
    setViewYear(parsed?.year ?? today.getFullYear())
    setViewMonth(parsed?.month ?? today.getMonth() + 1)
    setPendingDay(parsed?.day ?? null)
    setOpen(true)
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) } else setViewMonth(m => m + 1)
  }
  function confirm() {
    if (pendingDay) onChange(formatDate({ year: viewYear, month: viewMonth, day: pendingDay }))
    setOpen(false)
  }

  const cells = buildCalendarGrid(viewYear, viewMonth)
  const thisYear = new Date().getFullYear()
  const yearOptions = []
  for (let y = thisYear - 5; y <= thisYear + 3; y++) yearOptions.push(y)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', height: 34, padding: '0 10px', boxSizing: 'border-box',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-strong)', outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={openPicker}
          style={{
            flexShrink: 0, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: '#fff', cursor: 'pointer',
          }}
        >
          <CalendarIcon size={15} color="var(--text-muted)" />
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          width: 264, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 8px', background: '#6B6F76' }}>
            <button type="button" onClick={prevMonth} style={navBtnStyle}><ChevronLeft size={13} color="#fff" /></button>
            <select
              value={viewYear}
              onChange={e => setViewYear(Number(e.target.value))}
              style={{ fontSize: 13, fontWeight: 700, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer' }}
            >
              {yearOptions.map(y => <option key={y} value={y} style={{ color: '#000' }}>{y}</option>)}
            </select>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>년 {viewMonth}월</span>
            <button type="button" onClick={nextMonth} style={navBtnStyle}><ChevronRight size={13} color="#fff" /></button>
          </div>

          <div style={{ padding: '10px 10px 4px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0' }}>{w}</div>
            ))}
            {cells.map((c, i) => {
              const isSelected = !c.outside && c.day === pendingDay
              return (
                <button
                  type="button"
                  key={i}
                  disabled={c.outside}
                  onClick={() => setPendingDay(c.day)}
                  style={{
                    height: 26, fontSize: 12, borderRadius: 4,
                    border: isSelected ? '1px solid var(--sogang-red)' : 'none',
                    background: isSelected ? '#FDECEC' : 'transparent',
                    color: c.outside ? '#C6C6C6' : (isSelected ? 'var(--sogang-red)' : 'var(--text-strong)'),
                    cursor: c.outside ? 'default' : 'pointer', fontWeight: isSelected ? 700 : 400,
                  }}
                >
                  {c.day}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid var(--sogang-red)', borderRadius: 4, background: '#fff', color: 'var(--sogang-red)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <X size={12} /> 닫기
            </button>
            <button
              type="button"
              onClick={confirm}
              style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', borderRadius: 4, background: 'var(--sogang-red)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <Check size={12} /> 확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtnStyle = {
  width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
