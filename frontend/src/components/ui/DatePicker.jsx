import { useEffect, useRef, useState } from 'react'
import Input from './Input'
import { Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

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
// (요일 순서는 월요일 시작 — 앱 내 다른 요일 표시와 통일. getDay()는 일=0이라 월=0으로 보정)
function buildCalendarGrid(year, month) {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7
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
        <Input
          size="sm"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={openPicker}
          style={{
            flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', cursor: 'pointer',
          }}
        >
          <CalendarIcon size={15} color="var(--text-muted)" />
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          width: 264, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 8px', background: 'var(--text-muted)' }}>
            <button type="button" onClick={prevMonth} style={navBtnStyle}><ChevronLeft size={13} color="var(--surface-card)" /></button>
            <select
              value={viewYear}
              onChange={e => setViewYear(Number(e.target.value))}
              style={{ fontSize: 13, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--text-on-brand)', cursor: 'pointer' }}
            >
              {yearOptions.map(y => <option key={y} value={y} style={{ color: 'var(--text-strong)' }}>{y}</option>)}
            </select>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-on-brand)' }}>년 {viewMonth}월</span>
            <button type="button" onClick={nextMonth} style={navBtnStyle}><ChevronRight size={13} color="var(--text-on-brand)" /></button>
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
                    background: isSelected ? 'var(--sogang-red-50)' : 'transparent',
                    color: c.outside ? 'var(--border-default)' : (isSelected ? 'var(--sogang-red)' : 'var(--text-strong)'),
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
              style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid var(--sogang-red)', borderRadius: 4, background: 'var(--surface-card)', color: 'var(--sogang-red)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <X size={12} /> 닫기
            </button>
            <button
              type="button"
              onClick={confirm}
              style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', borderRadius: 4, background: 'var(--sogang-red)', color: 'var(--text-on-brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
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
