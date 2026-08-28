import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon } from 'lucide-react'
import MonthCalendar from './MonthCalendar'

// 평소엔 아이콘 버튼 하나만 있다가, 누르면 월 달력이 팝업으로 뜨는 "다른 날짜로 이동" 진입점.
// 자주 하는 이동(이전/다음 주)은 각 페이지의 주 네비게이션 버튼이 맡고, 이건 몇 달 전
// 기록처럼 가끔 필요한 "멀리 점프"용이라 평소엔 화면 자리를 차지하지 않는다.
//
// 팝오버는 body로 포털해서 띄운다. 이 버튼을 담은 카드에 `overflow: hidden`이 걸려 있어서
// (둥근 모서리 처리용) 카드 안에 absolute로 띄우면 카드 높이를 넘는 만큼 잘렸다.
// 확정 근무가 없는 주는 카드가 짧아져 달력의 2/3가 사라졌다.

const WIDTH = 376
const GAP = 6
const MARGIN = 8 // 뷰포트 가장자리 여백

export default function WeekCalendarButton({ weekStart, onSelectWeek, subDates = [] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  // 버튼 기준 우측 정렬. 달력 전체가 들어가는 쪽(아래 우선, 안 되면 위)에 붙이고,
  // 양쪽 다 부족하면 그 쪽 여유만큼 잘라 내부 스크롤로 넘긴다.
  // 어느 경우든 뷰포트를 벗어나지 않게 top을 최종 클램프한다.
  const place = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const b = btn.getBoundingClientRect()
    const vh = window.innerHeight
    const below = Math.max(0, vh - b.bottom - GAP - MARGIN)
    const above = Math.max(0, b.top - GAP - MARGIN)
    // maxHeight가 걸려 있어도 내용 전체 높이를 알 수 있게 scrollHeight를 쓴다
    const natural = popRef.current?.scrollHeight || 0

    const dropDown = natural ? (natural <= below || below >= above) : below >= above
    const room = dropDown ? below : above
    const h = natural ? Math.min(natural, room) : room
    const top = Math.max(MARGIN, Math.min(dropDown ? b.bottom + GAP : b.top - GAP - h, vh - MARGIN - h))
    const left = Math.max(MARGIN, Math.min(b.right - WIDTH, window.innerWidth - WIDTH - MARGIN))
    setPos({ top, left, maxHeight: room })
  }, [])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    place()
    // 첫 배치 때는 달력이 아직 그려지기 전이라 높이를 못 재는 경우가 있다.
    // 다음 프레임에 실제 높이로 한 번 더 잡아 준다.
    const raf = requestAnimationFrame(place)
    return () => cancelAnimationFrame(raf)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    // 포털은 카드와 함께 움직이지 않으므로 스크롤·리사이즈 때 위치를 다시 잡아 준다
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title="달력에서 다른 날짜로 이동"
        aria-expanded={open}
        style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${open ? 'var(--sogang-red)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-card)', cursor: 'pointer',
        }}
      >
        <CalendarIcon size={15} color={open ? 'var(--sogang-red)' : 'var(--text-muted)'} />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999, left: pos?.left ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
            width: WIDTH, maxHeight: pos?.maxHeight, overflowY: 'auto',
            boxSizing: 'border-box', padding: 16, zIndex: 200,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          <MonthCalendar
            subDates={subDates}
            weekStart={weekStart}
            onSelectWeek={iso => { onSelectWeek(iso); setOpen(false) }}
            maxWidth="100%"
          />
        </div>,
        document.body,
      )}
    </>
  )
}
