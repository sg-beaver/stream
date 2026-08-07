import { useMemo, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import Button from '../ui/Button'

// 부서 개관 시간 설정 — 요일 × 30분 슬롯을 켜고 끄는 표.
//
// 슬롯 단위로 다루는 이유: 점심 휴관처럼 하루가 여러 구간으로 끊기는 경우가 있어서,
// 시작·종료 시각 한 쌍으로는 표현할 수 없다. 저장할 때 맞닿은 슬롯을 구간으로 합쳐
// [{start_time, end_time}, ...] 형태로 보낸다 (API는 구간 목록을 받는다).

const DAYS = [
  { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
  { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
  { value: 7, label: '일' },
]

const PERIODS = [
  { key: 'semester', label: '학기 중' },
  { key: 'vacation', label: '방학 중' },
]

const SLOT_MINUTES = 30
// 편집 가능한 범위 — 교내 부서 운영 시간을 넉넉히 덮는 06:00~24:00
const EDIT_START_MIN = 6 * 60
const EDIT_END_MIN = 24 * 60

const pad2 = n => String(n).padStart(2, '0')
const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
const hhmmToMin = t => {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

const SLOTS = (() => {
  const list = []
  for (let m = EDIT_START_MIN; m < EDIT_END_MIN; m += SLOT_MINUTES) list.push(m)
  return list
})()

// API 응답(구간 목록) → { 요일: Set(슬롯 시작 분) }
function toSlotSets(days = []) {
  const result = {}
  DAYS.forEach(d => { result[d.value] = new Set() })
  days.forEach(day => {
    const set = result[day.day_of_week] ?? new Set()
    day.ranges.forEach(r => {
      for (let m = hhmmToMin(r.start_time); m < hhmmToMin(r.end_time); m += SLOT_MINUTES) {
        set.add(m)
      }
    })
    result[day.day_of_week] = set
  })
  return result
}

// { 요일: Set(슬롯) } → API 요청 형태. 맞닿은 슬롯은 한 구간으로 합친다.
function toRanges(slotSets) {
  return DAYS.map(d => {
    const sorted = [...(slotSets[d.value] ?? [])].sort((a, b) => a - b)
    const ranges = []
    sorted.forEach(m => {
      const last = ranges[ranges.length - 1]
      if (last && last.end === m) last.end = m + SLOT_MINUTES
      else ranges.push({ start: m, end: m + SLOT_MINUTES })
    })
    return {
      day_of_week: d.value,
      ranges: ranges.map(r => ({ start_time: minToHhmm(r.start), end_time: minToHhmm(r.end) })),
    }
  })
}

const hoursOf = slotSets =>
  DAYS.reduce((sum, d) => sum + (slotSets[d.value]?.size ?? 0), 0) * SLOT_MINUTES / 60

export default function OpeningHoursEditor({ policy, onSave, saving, error, onClose }) {
  const [period, setPeriod] = useState('semester')
  const initial = useMemo(() => ({
    semester: toSlotSets(policy?.opening_hours?.semester),
    vacation: toSlotSets(policy?.opening_hours?.vacation),
  }), [policy])

  const [draft, setDraft] = useState(initial)
  const current = draft[period]

  const toggleSlot = (day, minute) => {
    setDraft(prev => {
      const set = new Set(prev[period][day])
      if (set.has(minute)) set.delete(minute)
      else set.add(minute)
      return { ...prev, [period]: { ...prev[period], [day]: set } }
    })
  }

  // 요일 머리글 클릭 — 그 요일을 통째로 열거나(편집 범위 전체) 닫는다
  const toggleDay = day => {
    setDraft(prev => {
      const set = prev[period][day]
      const next = set.size > 0 ? new Set() : new Set(SLOTS)
      return { ...prev, [period]: { ...prev[period], [day]: next } }
    })
  }

  const changed = PERIODS.some(p =>
    DAYS.some(d => {
      const a = [...(initial[p.key][d.value] ?? [])].sort().join(',')
      const b = [...(draft[p.key][d.value] ?? [])].sort().join(',')
      return a !== b
    }),
  )

  const handleSave = () => {
    // 두 기간을 함께 보낸다 — 화면에서 한쪽만 고쳤어도 나머지는 현재 값 그대로 유지된다
    onSave({ semester: toRanges(draft.semester), vacation: toRanges(draft.vacation) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        칸을 클릭해 <b style={{ color: 'var(--text-body)' }}>30분 단위</b>로 개관 시간을 설정합니다.
        요일 머리글을 누르면 그 요일 전체를 켜거나 끕니다. 점심시간처럼 중간에 닫는 시간대도
        비워 두면 그대로 반영됩니다. 저장하면 이후 근무표 생성이 이 시간표를 기준으로 이루어집니다.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {PERIODS.map(p => {
          const on = period === p.key
          return (
            <button
              key={p.key} type="button" onClick={() => setPeriod(p.key)}
              style={{
                height: 34, padding: '0 16px', background: '#fff',
                border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
                borderRadius: 8, fontSize: 13, fontWeight: on ? 700 : 500,
                color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {p.label}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
          주간 개관 <b style={{ color: 'var(--text-strong)' }}>{hoursOf(current)}시간</b>
        </span>
      </div>

      <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ ...headStyle, width: 60 }}>시간</th>
              {DAYS.map(d => (
                <th
                  key={d.value} onClick={() => toggleDay(d.value)}
                  title={`${d.label}요일 전체 켜기/끄기`}
                  style={{ ...headStyle, cursor: 'pointer' }}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map(minute => {
              const onHour = minute % 60 === 0
              return (
                <tr key={minute}>
                  <td style={{
                    ...headStyle, fontSize: 11, fontWeight: onHour ? 700 : 500,
                    color: onHour ? 'var(--saint-maroon)' : 'var(--text-subtle)',
                  }}>
                    {onHour ? minToHhmm(minute) : ''}
                  </td>
                  {DAYS.map(d => {
                    const open = current[d.value]?.has(minute)
                    return (
                      <td
                        key={d.value}
                        onClick={() => toggleSlot(d.value, minute)}
                        title={`${d.label} ${minToHhmm(minute)}~${minToHhmm(minute + SLOT_MINUTES)}`}
                        style={{
                          border: '1px solid var(--saint-grid)',
                          borderTopStyle: onHour ? 'solid' : 'dotted',
                          height: 18, padding: 0, cursor: 'pointer',
                          background: open ? 'var(--sogang-red)' : 'var(--neutral-0)',
                        }}
                      />
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 20, fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--sogang-red)' }} /> 개관
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--saint-grid)', background: 'var(--neutral-0)' }} /> 휴관
        </span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="secondary" size="sm" onClick={() => setDraft(initial)} disabled={!changed || saving}>
          <RotateCcw size={13} /> 되돌리기
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>닫기</Button>
        <Button size="sm" onClick={handleSave} disabled={!changed || saving}>
          <Check size={13} /> {saving ? '저장 중...' : '개관 시간 저장'}
        </Button>
      </div>
    </div>
  )
}

const headStyle = {
  border: '1px solid var(--saint-grid)',
  background: 'var(--saint-tan)',
  color: 'var(--saint-maroon)',
  fontSize: 12, fontWeight: 700,
  padding: '6px 4px', textAlign: 'center',
}
