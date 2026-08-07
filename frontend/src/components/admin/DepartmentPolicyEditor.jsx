import { useMemo, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import Button from '../ui/Button'

// 부서 근무표 설정 — 개관 시간(요일 × 30분 슬롯)과 시간대별 배정 인원.
//
// 개관 시간을 슬롯 단위로 다루는 이유: 점심 휴관처럼 하루가 여러 구간으로 끊기는 경우가
// 있어서 시작·종료 시각 한 쌍으로는 표현할 수 없다. 저장할 때 맞닿은 슬롯을 구간으로 합쳐
// [{start_time, end_time}, ...] 형태로 보낸다 (API는 구간 목록을 받는다).
//
// 저장은 PATCH 한 번으로 보내되, 실제로 바뀐 항목만 담는다 — 개관 시간만 고쳤으면
// 인원은 서버의 저장값이 그대로 유지된다.

const DAYS = [
  { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
  { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
  { value: 7, label: '일' },
]

// 페널티 카테고리 표기 — backend scheduler/constraints/soft.py의 Constraint.name과 같은 키.
// 생성 결과의 '제약 위반 내역'에서도 같은 문구를 쓴다.
export const PENALTY_LABELS = {
  understaffing: '최소 인원 미달',
  preferred_staffing: '선호 인원 미충족',
  preference_match: '희망 외 시간 배정',
  contiguity: '근무 블록 분절',
  meal_break: '식사 시간 미확보',
  morning_rules: '아침 근무 규칙 위반',
  exam_proximity: '시험 직전 배정',
  avoid_range: '회피 요청 시간 배정',
  non_campus_day: '비등교일 배정',
  fair_hours: '주간 목표 시간 미달',
}

// 담당자가 중요도를 조정할 수 있는 항목 (understaffing은 제외 — 낮추면 근무표가 비어버린다).
// backend schemas.ADJUSTABLE_PENALTY_CATEGORIES와 같은 목록.
const ADJUSTABLE = [
  ['preferred_staffing', '선호 인원을 못 채운 시간대'],
  ['preference_match', '희망하지 않은 시간에 배정'],
  ['contiguity', '근무가 여러 조각으로 나뉨'],
  ['meal_break', '식사 시간을 못 확보'],
  ['morning_rules', '아침 근무 규칙 위반'],
  ['exam_proximity', '시험 직전 배정'],
  ['avoid_range', '회피 요청 시간에 배정'],
  ['non_campus_day', '비등교일에 배정'],
  ['fair_hours', '주간 목표 시간에 못 미침'],
]

// 배율은 정책 파일의 기본 가중치에 곱해진다 — 항목마다 절대값이 달라 배율로 다룬다
const SCALE_LEVELS = [
  { value: 0, label: '끄기' },
  { value: 0.5, label: '낮음' },
  { value: 1, label: '보통' },
  { value: 2, label: '높음' },
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

export default function DepartmentPolicyEditor({ policy, onSave, saving, error, onClose }) {
  const [period, setPeriod] = useState('semester')
  const initial = useMemo(() => ({
    semester: toSlotSets(policy?.opening_hours?.semester),
    vacation: toSlotSets(policy?.opening_hours?.vacation),
  }), [policy])

  const [draft, setDraft] = useState(initial)
  const [minPerSlot, setMinPerSlot] = useState(policy?.min_per_slot ?? 1)
  const [maxPerSlot, setMaxPerSlot] = useState(policy?.max_per_slot ?? 2)
  const [biweekly, setBiweekly] = useState(policy?.biweekly_max_hours ?? 190)
  // 저장된 배율만 담는다 — 키가 없으면 정책 파일 기본값(보통)
  const [scales, setScales] = useState(policy?.soft_weight_scales ?? {})
  const current = draft[period]

  const staffingChanged =
    minPerSlot !== (policy?.min_per_slot ?? 1) || maxPerSlot !== (policy?.max_per_slot ?? 2)
  const staffingInvalid = minPerSlot > maxPerSlot
  // 선호 인원은 정책 파일 값이라 화면에서 못 바꾼다 — 최대 인원을 그보다 낮게 잡으면
  // 그 시간대는 영영 선호 인원을 못 채워 페널티만 쌓인다
  const belowPreferred = maxPerSlot < (policy?.preferred_staffing_max ?? 0)
  const biweeklyChanged = biweekly !== (policy?.biweekly_max_hours ?? 190)
  const biweeklyInvalid = !Number.isFinite(biweekly) || biweekly < 1
  const savedScales = policy?.soft_weight_scales ?? {}
  const scalesChanged = JSON.stringify(scales) !== JSON.stringify(savedScales)
  const scaleOf = key => scales[key] ?? 1

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

  const hoursChanged = PERIODS.some(p =>
    DAYS.some(d => {
      const a = [...(initial[p.key][d.value] ?? [])].sort().join(',')
      const b = [...(draft[p.key][d.value] ?? [])].sort().join(',')
      return a !== b
    }),
  )
  const changed = hoursChanged || staffingChanged || biweeklyChanged || scalesChanged

  const handleSave = () => {
    const patch = {}
    if (hoursChanged) {
      // 두 기간을 함께 보낸다 — 화면에서 한쪽만 고쳤어도 나머지는 현재 값 그대로 유지된다
      patch.opening_hours = { semester: toRanges(draft.semester), vacation: toRanges(draft.vacation) }
    }
    if (staffingChanged) {
      patch.min_per_slot = minPerSlot
      patch.max_per_slot = maxPerSlot
    }
    if (biweeklyChanged) patch.biweekly_max_hours = biweekly
    if (scalesChanged) patch.soft_weight_scales = scales
    onSave(patch)
  }

  const reset = () => {
    setDraft(initial)
    setMinPerSlot(policy?.min_per_slot ?? 1)
    setMaxPerSlot(policy?.max_per_slot ?? 2)
    setBiweekly(policy?.biweekly_max_hours ?? 190)
    setScales(policy?.soft_weight_scales ?? {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
          시간대별 배정 인원
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          개관 시간 한 칸에 몇 명을 배정할지 정합니다. 최소 인원을 못 채운 칸은 생성이 실패하는 대신
          <b style={{ color: 'var(--text-body)' }}> 미충원</b>으로 보고됩니다.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>최소 인원</span>
            <input
              type="number" min={0} max={20} value={minPerSlot}
              onChange={e => setMinPerSlot(Number(e.target.value))}
              style={numberInputStyle}
            />
          </label>
          <span style={{ paddingBottom: 10, color: 'var(--text-subtle)' }}>~</span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>최대 인원</span>
            <input
              type="number" min={1} max={20} value={maxPerSlot}
              onChange={e => setMaxPerSlot(Number(e.target.value))}
              style={numberInputStyle}
            />
          </label>
          <span style={{ paddingBottom: 10, fontSize: 12, color: 'var(--text-subtle)' }}>
            현재 {policy?.staffing_source === 'department' ? '직접 설정' : '기본 정책'} 값
          </span>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 'auto' }}>
            <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>2주 근로시간 상한 (부서 전체)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min={1} max={2000} value={biweekly}
                onChange={e => setBiweekly(Number(e.target.value))}
                style={{ ...numberInputStyle, width: 110 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>시간</span>
            </div>
          </label>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
          2주 상한은 부서 <b style={{ color: 'var(--text-body)' }}>교비 근로 학생 전체의 합계</b>에 적용되는
          필수 제약입니다 (현재 {policy?.biweekly_source === 'department' ? '직접 설정' : '기본 정책'} 값).
          학생 개인의 주간 상한(교비 14시간 / 국가 20·40시간)은 학교 규정이라 여기서 바꾸지 않습니다.
        </p>
        {staffingInvalid && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--danger)' }}>
            최소 인원이 최대 인원보다 많을 수 없습니다.
          </p>
        )}
        {!staffingInvalid && belowPreferred && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--warning)', lineHeight: 1.6 }}>
            부서 정책의 선호 인원({policy.preferred_staffing_max}명)보다 최대 인원이 적습니다.
            해당 시간대는 선호 인원을 채울 수 없어 생성 결과에 페널티로 남습니다.
          </p>
        )}
      </div>

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

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
          배정 기준의 중요도 <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-subtle)' }}>(선택)</span>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          아래 항목은 <b style={{ color: 'var(--text-body)' }}>지키면 좋은 기준</b>입니다. 서로 충돌하면 중요도가 높은 쪽을
          우선 지킵니다. 손대지 않으면 부서 정책의 기본값을 그대로 씁니다.
          &lsquo;끄기&rsquo;로 두면 그 기준을 아예 고려하지 않습니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ADJUSTABLE.map(([key, description], i) => {
            const value = scaleOf(key)
            const custom = savedScales[key] !== undefined
            return (
              <div
                key={key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '10px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                    {PENALTY_LABELS[key]}
                    {custom && (
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--sogang-red)' }}>직접 설정</span>
                    )}
                    {/* API로 프리셋 밖의 배율이 저장된 경우 — 버튼으로는 표시할 수 없어 값을 함께 알려준다 */}
                    {!SCALE_LEVELS.some(l => l.value === value) && (
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-subtle)' }}>
                        현재 {value}배
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{description}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {SCALE_LEVELS.map(level => {
                    const on = value === level.value
                    return (
                      <button
                        key={level.value} type="button"
                        // '보통'(1배)도 값으로 보낸다 — 서버가 1배를 저장에서 빼면서
                        // 정책 파일 값으로 되돌아간다. 지워서 보내면 되돌림이 전달되지 않는다.
                        onClick={() => setScales(prev => ({ ...prev, [key]: level.value }))}
                        style={{
                          height: 30, padding: '0 12px', background: on ? 'var(--sogang-red-50)' : '#fff',
                          border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
                          borderRadius: 6, fontSize: 12, fontWeight: on ? 700 : 500,
                          color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
                          cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        }}
                      >
                        {level.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="secondary" size="sm" onClick={reset} disabled={!changed || saving}>
          <RotateCcw size={13} /> 되돌리기
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>닫기</Button>
        <Button size="sm" onClick={handleSave} disabled={!changed || saving || staffingInvalid || biweeklyInvalid}>
          <Check size={13} /> {saving ? '저장 중...' : '설정 저장'}
        </Button>
      </div>
    </div>
  )
}

const numberInputStyle = {
  width: 90, height: 38, padding: '0 12px',
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
  fontSize: 14, fontFamily: 'var(--font-sans)', color: 'var(--text-strong)',
  outline: 'none', boxSizing: 'border-box',
}

const headStyle = {
  border: '1px solid var(--saint-grid)',
  background: 'var(--saint-tan)',
  color: 'var(--saint-maroon)',
  fontSize: 12, fontWeight: 700,
  padding: '6px 4px', textAlign: 'center',
}
