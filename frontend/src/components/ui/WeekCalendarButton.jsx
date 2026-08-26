import { useEffect, useRef, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import MonthCalendar from './MonthCalendar'

// 평소엔 아이콘 버튼 하나만 있다가, 누르면 월 달력이 팝업으로 뜨는 "다른 날짜로 이동" 진입점.
// 자주 하는 이동(이전/다음 주)은 각 페이지의 주 네비게이션 버튼이 맡고, 이건 몇 달 전
// 기록처럼 가끔 필요한 "멀리 점프"용이라 평소엔 화면 자리를 차지하지 않는다.
export default function WeekCalendarButton({ weekStart, onSelectWeek, subDates = [] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="달력에서 다른 날짜로 이동"
        style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${open ? 'var(--sogang-red)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-sm)',
          background: '#fff', cursor: 'pointer',
        }}
      >
        <CalendarIcon size={15} color={open ? 'var(--sogang-red)' : 'var(--text-muted)'} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
          width: 376, boxSizing: 'border-box', padding: 16, background: '#fff', border: '1px solid var(--border-default)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>
          <MonthCalendar
            subDates={subDates}
            weekStart={weekStart}
            onSelectWeek={iso => { onSelectWeek(iso); setOpen(false) }}
            maxWidth="100%"
          />
        </div>
      )}
    </div>
  )
}
