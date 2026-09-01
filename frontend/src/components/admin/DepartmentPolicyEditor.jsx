import { useMemo, useState } from 'react'
import { Check, Info, RotateCcw } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import Alert from '../ui/Alert'
import ImportanceBar from './ImportanceBar'

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
export const ADJUSTABLE = [
  // [키, 설명] — 제목(PENALTY_LABELS)은 위반 내역 표기라 간결하게 두고,
  // 설명은 "이 기준이 근무표에 무엇을 해 주는지"를 풀어 쓴다
  ['preferred_staffing', '바쁜 시간대에 권장 인원(예: 2명)을 채워 배정합니다'],
  // preference_match는 뺀다 — 학생 화면에 '희망'과 '가능' 구분이 없어 백엔드
  // 채점에서도 빠져 있고(constraints.DEFAULT_SOFT_CONSTRAINTS), 서버가 이 키의
  // 배율 저장을 거부한다(schemas.ADJUSTABLE_PENALTY_CATEGORIES).
  // 학생 화면에 희망/가능 구분이 들어오면 양쪽을 함께 되살린다.
  // ['preference_match', "학생이 '희망'으로 체크한 시간을 우선 배정합니다"],
  ['contiguity', '하루 근무가 30분씩 쪼개지지 않고 길게 이어지게 합니다'],
  ['meal_break', '점심·저녁 시간대에 식사할 짬을 비워 둡니다'],
  ['morning_rules', '마감 다음 날 아침 근무, 연속된 아침 근무를 피합니다'],
  ['exam_proximity', '시험 시작 직전 몇 시간은 배정을 피합니다'],
  ['avoid_range', '학생이 피하고 싶다고 요청한 시간을 존중합니다'],
  ['non_campus_day', '원래 학교에 오지 않는 요일에는 배정을 줄입니다'],
  ['fair_hours', '근무 시간이 특정 학생에게 쏠리지 않게 고르게 나눕니다'],
]

// 조정 대상에서 빠진 카테고리(preference_match 등)의 저장값은 화면 밖으로 걸러낸다 —
// 그대로 PATCH에 실어 보내면 서버가 "조정할 수 없는 항목"으로 400을 낸다.
const onlyAdjustable = raw =>
  Object.fromEntries(
    Object.entries(raw ?? {}).filter(([key]) => ADJUSTABLE.some(([k]) => k === key)),
  )

// 반영 강도(배율) 눈금은 바 컴포넌트가 갖는다 — 여기서 재수출해 기존 import를 유지한다
export { SCALE_LEVELS } from './ImportanceBar'

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

// ---- 근무 슬롯 (블록, #89) ----
// 블록을 상태로 직접 들지 않고 "개관 구간을 내부 경계로 쪼갠 결과"로 파생한다.
// 개관 시간을 어떻게 고쳐도 블록이 항상 개관 시간을 정확히 타일링하므로
// 백엔드의 타일링 검증(400)에 걸릴 수 없고, 개관 밖에 남은 경계는 저장 시 무시된다.

// 개관 슬롯 Set → 연속 구간 [{start, end}] (toRanges와 같은 병합 규칙)
function openRuns(openSet) {
  const runs = []
  ;[...(openSet ?? [])].sort((a, b) => a - b).forEach(m => {
    const last = runs[runs.length - 1]
    if (last && last.end === m) last.end = m + SLOT_MINUTES
    else runs.push({ start: m, end: m + SLOT_MINUTES })
  })
  return runs
}

// 개관 구간을 내부 경계로 분할한 블록 목록. 구간 시작은 암묵 경계(제거 불가)다.
function deriveBlocks(openSet, boundaries) {
  const blocks = []
  openRuns(openSet).forEach(run => {
    let start = run.start
    for (let m = run.start + SLOT_MINUTES; m < run.end; m += SLOT_MINUTES) {
      if (boundaries.has(m)) {
        blocks.push({ start, end: m })
        start = m
      }
    }
    blocks.push({ start, end: run.end })
  })
  return blocks
}

// GET 응답의 work_slots 기간 값(정의된 요일만 포함) → { 요일: { enabled, boundaries } }.
// 내부 경계 = 앞 블록의 끝과 맞닿은 블록 시작 (구간 첫 블록의 시작은 암묵 경계라 제외)
function toSlotState(workDays = []) {
  const result = {}
  DAYS.forEach(d => { result[d.value] = { enabled: false, boundaries: new Set() } })
  workDays.forEach(day => {
    const ends = new Set(day.ranges.map(r => hhmmToMin(r.end_time)))
    const boundaries = new Set(
      day.ranges.map(r => hhmmToMin(r.start_time)).filter(m => ends.has(m)),
    )
    result[day.day_of_week] = { enabled: true, boundaries }
  })
  return result
}

// ---- 블록별 배정 인원 (#171) ----
// 블록은 상태로 들지 않고 경계에서 파생되므로, 인원은 "요일:시작:종료"를 키로 따로 든다.
// 블록을 나누거나 합치면 키가 사라져 그 설정도 함께 없어진다 — 잘린 블록에 옛 인원이
// 슬그머니 따라붙는 것보다 낫다(그때는 부서 기본값으로 돌아간다).
const blockKey = (day, start, end) => `${day}:${start}:${end}`

// GET 응답의 work_slots 기간 값 → { "요일:시작:종료": {min, max} }. 둘 다 null인 블록은 담지 않는다
function toStaffingState(workDays = []) {
  const result = {}
  workDays.forEach(day => {
    day.ranges.forEach(r => {
      if (r.min_per_slot == null && r.max_per_slot == null) return
      const key = blockKey(day.day_of_week, hhmmToMin(r.start_time), hhmmToMin(r.end_time))
      result[key] = { min: r.min_per_slot ?? null, max: r.max_per_slot ?? null }
    })
  })
  return result
}

// 인원 설정 맵을 비교 가능한 문자열로 (키 순서와 무관하게)
const staffingKey = staffing =>
  Object.keys(staffing).sort().map(k => `${k}=${staffing[k].min}/${staffing[k].max}`).join('|')

// 블록에 실제로 적용되는 (최소, 최대) — 정하지 않은 쪽은 부서 기본값이 채운다
const effectiveStaffing = (custom, defMin, defMax) => [
  custom?.min ?? defMin,
  custom?.max ?? defMax,
]

const staffingLabel = (custom, defMin, defMax) => {
  const [min, max] = effectiveStaffing(custom, defMin, defMax)
  return min === max ? `${min}명` : `${min}~${max}명`
}

// { 요일: {enabled, boundaries} } + 개관 슬롯 → PATCH work_slots 기간 값.
// 블록 미사용(자유 그리드) 요일과 개관이 통째로 닫힌 요일은 목록에서 뺀다
// (백엔드가 빈 ranges 요일을 미정의와의 모호성 때문에 422로 거부한다).
function toWorkSlotDays(slotSets, slotState, staffing = {}) {
  return DAYS
    .filter(d => slotState[d.value].enabled && (slotSets[d.value]?.size ?? 0) > 0)
    .map(d => ({
      day_of_week: d.value,
      ranges: deriveBlocks(slotSets[d.value], slotState[d.value].boundaries)
        .map(b => {
          const custom = staffing[blockKey(d.value, b.start, b.end)]
          return {
            start_time: minToHhmm(b.start),
            end_time: minToHhmm(b.end),
            // 설정한 블록만 인원을 싣는다 — 나머지는 서버에서 부서 기본값이 적용된다
            ...(custom ? { min_per_slot: custom.min, max_per_slot: custom.max } : {}),
          }
        }),
    }))
}

const MODES = [
  { key: 'open', label: '개관 시간' },
  { key: 'slots', label: '근무 슬롯' },
]

// 근무 슬롯 모드는 캘린더식 카드로 그린다 — 30분당 세로 픽셀과 총 높이
const SLOT_H = 22
const TOTAL_H = SLOTS.length * SLOT_H
const yOf = minute => ((minute - EDIT_START_MIN) / SLOT_MINUTES) * SLOT_H

const fmtDuration = minutes => {
  const h = minutes / 60
  return Number.isInteger(h) ? `${h}시간` : h > 1 ? `${h}시간` : `${minutes}분`
}

// 편집 전용 — 이 편집기를 여는 사람(직원·학생팀장)은 모두 저장 권한이 있다 (#156).
// 학생팀장에게 조회 전용으로 내주던 모드는 부서 설정 변경이 편성 권한과 같은 선으로
// 옮겨가면서 없앴다.
export default function DepartmentPolicyEditor({ policy, terms = [], onSave, saving, error, onClose }) {
  const [period, setPeriod] = useState('semester')
  const [mode, setMode] = useState('open') // 'open' = 개관 시간 편집, 'slots' = 근무 슬롯 편집
  const initial = useMemo(() => ({
    semester: toSlotSets(policy?.opening_hours?.semester),
    vacation: toSlotSets(policy?.opening_hours?.vacation),
  }), [policy])
  const initialSlots = useMemo(() => ({
    semester: toSlotState(policy?.work_slots?.semester),
    vacation: toSlotState(policy?.work_slots?.vacation),
  }), [policy])
  const initialStaffing = useMemo(() => ({
    semester: toStaffingState(policy?.work_slots?.semester),
    vacation: toStaffingState(policy?.work_slots?.vacation),
  }), [policy])

  const [draft, setDraft] = useState(initial)
  const [slotDraft, setSlotDraft] = useState(initialSlots)
  // 블록별 배정 인원 (#171) — 설정한 블록만 담는다
  const [blockStaffing, setBlockStaffing] = useState(initialStaffing)
  // 인원을 편집 중인 블록 { day, start, end }. 블록 카드를 누르면 잡힌다
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [minPerSlot, setMinPerSlot] = useState(policy?.min_per_slot ?? 1)
  const [maxPerSlot, setMaxPerSlot] = useState(policy?.max_per_slot ?? 2)
  const [biweekly, setBiweekly] = useState(policy?.biweekly_max_hours ?? 190)
  // 저장된 배율만 담는다 — 키가 없으면 정책 파일 기본값(보통)
  const [scales, setScales] = useState(onlyAdjustable(policy?.soft_weight_scales))
  // AI 검토용 자연어 운영 규칙 — 줄바꿈으로 여러 규칙, 비우면 검토 비활성화
  const [rules, setRules] = useState(policy?.custom_rules ?? '')
  // 학생이 특정 주만 가능 시간을 고칠 수 있는 범위 (이슈 #36 B안)
  const [availabilityMode, setAvailabilityMode] = useState(policy?.availability_mode ?? 'weekly_only')
  // 부서가 기본으로 보는 학기 (#172). 빈 값이면 오늘 날짜 기준 학기
  const [defaultTerm, setDefaultTerm] = useState(policy?.default_term ?? '')
  const current = draft[period]
  const currentSlots = slotDraft[period]
  const currentStaffing = blockStaffing[period]

  const staffingChanged =
    minPerSlot !== (policy?.min_per_slot ?? 1) || maxPerSlot !== (policy?.max_per_slot ?? 2)
  const staffingInvalid = minPerSlot > maxPerSlot
  // 선호 인원은 정책 파일 값이라 화면에서 못 바꾼다 — 최대 인원을 그보다 낮게 잡으면
  // 그 시간대는 영영 선호 인원을 못 채워 페널티만 쌓인다
  const belowPreferred = maxPerSlot < (policy?.preferred_staffing_max ?? 0)
  const biweeklyChanged = biweekly !== (policy?.biweekly_max_hours ?? 190)
  const biweeklyInvalid = !Number.isFinite(biweekly) || biweekly < 1
  const savedScales = onlyAdjustable(policy?.soft_weight_scales)
  const scalesChanged = JSON.stringify(scales) !== JSON.stringify(savedScales)
  const scaleOf = key => scales[key] ?? 1
  const rulesChanged = rules !== (policy?.custom_rules ?? '')

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

  // 근무 슬롯 모드: 셀 클릭 = 그 시각에 내부 분할 경계 토글.
  // 휴관 칸, 블록 미사용 요일, 개관 구간의 첫 칸(암묵 경계)은 나눌 수 없다.
  const toggleBoundary = (day, minute) => {
    const set = current[day]
    if (!currentSlots[day].enabled) return
    if (!set?.has(minute) || !set.has(minute - SLOT_MINUTES)) return
    setSlotDraft(prev => {
      const dayState = prev[period][day]
      const boundaries = new Set(dayState.boundaries)
      if (boundaries.has(minute)) boundaries.delete(minute)
      else boundaries.add(minute)
      return { ...prev, [period]: { ...prev[period], [day]: { ...dayState, boundaries } } }
    })
  }

  // 근무 슬롯 모드: 요일 머리글 클릭 = 블록 사용 ↔ 자유(30분 단위 자유 배정) 전환
  const toggleDayEnabled = day => {
    setSlotDraft(prev => {
      const dayState = prev[period][day]
      return {
        ...prev,
        [period]: { ...prev[period], [day]: { ...dayState, enabled: !dayState.enabled } },
      }
    })
  }

  const hoursChanged = PERIODS.some(p =>
    DAYS.some(d => {
      const a = [...(initial[p.key][d.value] ?? [])].sort().join(',')
      const b = [...(draft[p.key][d.value] ?? [])].sort().join(',')
      return a !== b
    }),
  )
  const slotStateKey = state => DAYS.map(d => {
    const s = state[d.value]
    return `${s.enabled ? 1 : 0}:${[...s.boundaries].sort((a, b) => a - b).join('.')}`
  }).join('|')
  const slotsChanged = PERIODS.some(
    p => slotStateKey(initialSlots[p.key]) !== slotStateKey(slotDraft[p.key]),
  )
  const blockStaffingChanged = PERIODS.some(
    p => staffingKey(initialStaffing[p.key]) !== staffingKey(blockStaffing[p.key]),
  )
  // 블록이 한쪽만 정하면 나머지는 부서 기본값이라, 부서 인원을 바꿔도 성립하지 않을 수 있다
  const invalidBlocks = PERIODS.flatMap(p =>
    Object.entries(blockStaffing[p.key]).filter(([, custom]) => {
      const [min, max] = effectiveStaffing(custom, minPerSlot, maxPerSlot)
      return min > max
    }),
  )
  const blockStaffingInvalid = invalidBlocks.length > 0
  // 기간을 바꾸거나 블록을 나누면 선택이 가리키던 블록이 사라진다
  const selectedIsLive = Boolean(
    selectedBlock
    && selectedBlock.period === period
    && currentSlots[selectedBlock.day]?.enabled
    && deriveBlocks(current[selectedBlock.day] ?? new Set(), currentSlots[selectedBlock.day].boundaries)
      .some(b => b.start === selectedBlock.start && b.end === selectedBlock.end),
  )
  const availabilityModeChanged = availabilityMode !== (policy?.availability_mode ?? 'weekly_only')
  const defaultTermChanged = defaultTerm !== (policy?.default_term ?? '')
  const changed = hoursChanged || slotsChanged || blockStaffingChanged || staffingChanged || biweeklyChanged || scalesChanged || rulesChanged || availabilityModeChanged || defaultTermChanged

  const handleSave = () => {
    const patch = {}
    if (hoursChanged) {
      // 두 기간을 함께 보낸다 — 화면에서 한쪽만 고쳤어도 나머지는 현재 값 그대로 유지된다
      patch.opening_hours = { semester: toRanges(draft.semester), vacation: toRanges(draft.vacation) }
    }
    if (hoursChanged || slotsChanged || blockStaffingChanged) {
      // 개관 시간이 바뀌면 블록이 재파생되므로 근무 슬롯도 항상 함께 보낸다 —
      // 한쪽만 보내 저장된 블록과 어긋나 400이 나는 경로를 없앤다
      patch.work_slots = {
        semester: toWorkSlotDays(draft.semester, slotDraft.semester, blockStaffing.semester),
        vacation: toWorkSlotDays(draft.vacation, slotDraft.vacation, blockStaffing.vacation),
      }
    }
    if (staffingChanged) {
      patch.min_per_slot = minPerSlot
      patch.max_per_slot = maxPerSlot
    }
    if (biweeklyChanged) patch.biweekly_max_hours = biweekly
    if (scalesChanged) patch.soft_weight_scales = scales
    // 빈 문자열도 그대로 보낸다 — 서버가 규칙 삭제(null)로 저장한다
    if (rulesChanged) patch.custom_rules = rules
    if (availabilityModeChanged) patch.availability_mode = availabilityMode
    // 빈 문자열도 그대로 보낸다 — 서버가 '오늘 기준 학기로 되돌리기'로 처리한다
    if (defaultTermChanged) patch.default_term = defaultTerm
    onSave(patch)
  }

  const reset = () => {
    setDraft(initial)
    setSlotDraft(initialSlots)
    setBlockStaffing(initialStaffing)
    setSelectedBlock(null)
    setMinPerSlot(policy?.min_per_slot ?? 1)
    setMaxPerSlot(policy?.max_per_slot ?? 2)
    setBiweekly(policy?.biweekly_max_hours ?? 190)
    setScales(onlyAdjustable(policy?.soft_weight_scales))
    setRules(policy?.custom_rules ?? '')
    setAvailabilityMode(policy?.availability_mode ?? 'weekly_only')
    setDefaultTerm(policy?.default_term ?? '')
  }

  // 근무 슬롯 모드: 마우스를 올린 30분 선 — { day, minute }. 나누기/합치기 안내 표시용
  const [hoverLine, setHoverLine] = useState(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 배정 인원과 학기·수합 설정은 서로 독립적인 짧은 상자라, 넓은 화면에서는
          나란히 둔다 — 세로로 쌓으면 아래 타임테이블이 첫 화면에서 밀려난다.
          좁아지면 auto-fit이 한 열로 접는다 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>시간대별 배정 인원</span>
            <InfoHint text="개관 시간 한 칸당 배정 인원입니다. 근무 슬롯에서 블록별로 인원을 따로 정하면 그 블록은 그 값이 우선합니다. 최소 인원을 못 채운 칸은 생성 실패 대신 미충원으로 보고됩니다." />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>최소 인원</span>
              <Input
                type="number" min={0} max={20} value={minPerSlot}
                onChange={e => setMinPerSlot(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <span style={{ paddingBottom: 10, color: 'var(--text-subtle)' }}>~</span>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>최대 인원</span>
              <Input
                type="number" min={1} max={20} value={maxPerSlot}
                onChange={e => setMaxPerSlot(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <span style={{ paddingBottom: 10, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
              현재 {policy?.staffing_source === 'department' ? '직접 설정' : '기본 정책'} 값
            </span>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 'auto' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
                2주 근로시간 상한 (부서 전체)
                <InfoHint text={`부서 교비 근로 학생 전체 합계에 적용되는 필수 제약입니다 (현재 ${policy?.biweekly_source === 'department' ? '직접 설정' : '기본 정책'} 값). 학생 개인 주간 상한(교비 14시간/국가 20·40시간)은 학교 규정이라 여기서 바꾸지 않습니다.`} />
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input
                  type="number" min={1} max={2000} value={biweekly}
                  onChange={e => setBiweekly(Number(e.target.value))}
                  style={{ width: 110 }}
                />
                <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>시간</span>
              </div>
            </label>
          </div>
          {staffingInvalid && (
            <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>
              최소 인원이 최대 인원보다 많을 수 없습니다.
            </p>
          )}
          {!staffingInvalid && belowPreferred && (
            <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--warning)', lineHeight: 1.6 }}>
              부서 정책의 선호 인원({policy.preferred_staffing_max}명)보다 최대 인원이 적습니다.
              해당 시간대는 선호 인원을 채울 수 없어 생성 결과에 페널티로 남습니다.
            </p>
          )}
        </div>

        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>기본 학기</span>
            <InfoHint text="학기를 따로 고르지 않은 화면(학생 관리·수합 조회·수업 조교)이 어느 학기를 열지 정합니다. '오늘 기준'으로 두면 날짜에 따라 학기가 바뀌어, 학기 중에만 운영하는 부서는 방학에 화면이 비어 보입니다." />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Select
              value={defaultTerm}
              onChange={e => setDefaultTerm(e.target.value)}
              style={{ width: 260 }}
            >
              <option value="">오늘 날짜 기준 학기</option>
              {terms.map(t => (
                <option key={t.key} value={t.key}>{t.label ?? t.key}</option>
              ))}
            </Select>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
              {defaultTerm
                ? '이 부서 화면은 항상 이 학기를 먼저 엽니다. 화면에서 학기를 직접 고르면 그 선택이 우선합니다.'
                : '오늘 날짜가 속한 학기를 씁니다. 방학에만 운영하지 않는 부서라면 학기를 지정해 두는 편이 낫습니다.'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>학생 가능 시간 수합</span>
            <InfoHint text="학생은 '근무 시간표 > 가능 시간 제출'에서 매주 반복되는 시간표를 냅니다. 여기서 특정 주만 고치는 것을 어디까지 허용할지 정합니다. 좁히더라도 학생이 이미 낸 예외는 지워지지 않고, 다시 넓히면 그대로 살아납니다." />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Select
              value={availabilityMode}
              onChange={e => setAvailabilityMode(e.target.value)}
              style={{ width: 320 }}
            >
              <option value="weekly_only">매주 반복 시간표만 받기</option>
              <option value="weekly_with_unavailable">특정 주 근무 불가 신고까지 허용</option>
              <option value="weekly_with_exceptions">특정 주 가능 시간 추가까지 허용</option>
            </Select>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
              {availabilityMode === 'weekly_only'
                ? '학생은 매주 반복되는 시간표만 낼 수 있습니다.'
                : availabilityMode === 'weekly_with_unavailable'
                  ? '시험 주처럼 특정 주만 빼 달라는 신고를 받습니다. 가능 시간을 늘리는 것은 막습니다.'
                  : '학생이 특정 주만 시간을 빼거나 더할 수 있습니다.'}
            </span>
          </div>
        </div>
      </div>

      {/* 타임테이블과 중요도는 '근무표를 어떻게 짤지'를 같이 정하는 짝이다 —
          넓은 화면에서는 나란히 두어 시간표를 보면서 기준을 조정할 수 있게 한다 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {mode === 'open' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              칸을 클릭해 30분 단위로 개관 시간 설정 · 요일 머리글로 전체 켜기/끄기
              <InfoHint text="점심시간처럼 중간에 비워 두면 그대로 반영됩니다. 저장하면 이후 근무표 생성이 이 시간표를 기준으로 이루어집니다." />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              블록 안 선에 마우스를 올려 나누기, 경계에 올려 합치기 · 요일 머리글로 블록 사용 전환
              <InfoHint text={`블록은 통째로 배정되거나 통째로 비워집니다 — 수업이 블록에 일부만 겹치는 학생도 배정되지 않습니다. 끈 요일은 30분 단위로 자유 배정됩니다. 개관 시간을 바꾸면 블록도 그에 맞게 잘립니다. (현재 ${policy?.work_slots_source === 'department' ? '직접 설정' : '기본 정책'} 값)`} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {PERIODS.map(p => {
              const on = period === p.key
              return (
                <button
                  key={p.key} type="button" onClick={() => setPeriod(p.key)}
                  style={{
                    height: 34, padding: '0 16px', background: 'var(--surface-card)',
                    border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
                    borderRadius: 8, fontSize: 'var(--fs-body)', fontWeight: on ? 700 : 500,
                    color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
            <span style={{ width: 1, height: 20, background: 'var(--border-default)', margin: '0 4px' }} />
            {MODES.map(m => {
              const on = mode === m.key
              return (
                <button
                  key={m.key} type="button" onClick={() => setMode(m.key)}
                  style={{
                    height: 34, padding: '0 16px', background: 'var(--surface-card)',
                    border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
                    borderRadius: 8, fontSize: 'var(--fs-body)', fontWeight: on ? 700 : 500,
                    color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}
                >
                  {m.label}
                </button>
              )
            })}
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              주간 개관 <b style={{ color: 'var(--text-strong)' }}>{hoursOf(current)}시간</b>
            </span>
          </div>

          {mode === 'open' ? (
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
                          ...slotLabelStyle, fontWeight: onHour ? 700 : 500,
                          color: onHour ? 'var(--saint-maroon)' : 'var(--text-subtle)',
                        }}>
                          {minToHhmm(minute)}
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
          ) : (
            // 근무 슬롯 모드 — 캘린더식 카드. 블록마다 시간 라벨이 붙고,
            // 블록 안 30분 선에 마우스를 올리면 '나누기', 블록 사이 경계에 올리면 '합치기'가 뜬다
            <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3 }}>
                <div style={{ ...headStyle, width: 60, boxSizing: 'border-box' }}>시간</div>
                {DAYS.map(d => {
                  const enabled = currentSlots[d.value].enabled
                  return (
                    <div
                      key={d.value}
                      onClick={() => toggleDayEnabled(d.value)}
                      title={`${d.label}요일 블록 사용 ↔ 자유(30분 단위) 전환`}
                      style={{ ...headStyle, flex: 1, cursor: 'pointer', boxSizing: 'border-box' }}
                    >
                      {d.label}
                      <span style={{
                        display: 'block', fontSize: 'var(--fs-micro)', fontWeight: 500,
                        color: enabled ? 'var(--sogang-red)' : 'var(--text-subtle)',
                      }}>
                        {enabled ? '블록' : '자유'}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex' }}>
                {/* 시간 축은 개관 시간 표와 같이 30분 단위로 읽는다 — 블록 경계가 30분에
                    걸리는 일이 흔한데 정시 라벨만 있으면 어디서 끊겼는지 세어야 했다.
                    정시는 진하게, 30분은 옅게 두어 눈금의 위계는 남긴다 */}
                <div style={{
                  width: 60, position: 'relative', height: TOTAL_H, flexShrink: 0,
                  backgroundColor: 'var(--saint-tan-soft)',
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--saint-grid) 0 1px, transparent 1px ${SLOT_H}px)`,
                }}>
                  {SLOTS.map(m => {
                    const onHour = m % 60 === 0
                    return (
                      <div key={m} style={{
                        position: 'absolute', top: yOf(m) - 6, right: 6, fontSize: 'var(--fs-caption)',
                        fontWeight: onHour ? 700 : 500,
                        color: onHour ? 'var(--saint-maroon)' : 'var(--text-subtle)',
                      }}>
                        {minToHhmm(m)}
                      </div>
                    )
                  })}
                </div>
                {DAYS.map(d => {
                  const dayState = currentSlots[d.value]
                  const runs = openRuns(current[d.value])
                  const blocks = dayState.enabled
                    ? deriveBlocks(current[d.value] ?? new Set(), dayState.boundaries)
                    : []
                  return (
                    <div
                      key={d.value}
                      style={{
                        flex: 1, position: 'relative', height: TOTAL_H,
                        borderLeft: '1px solid var(--saint-grid)',
                        // 정시는 진한 선, 30분은 옅은 선 — 시간축(30분 눈금)과 눈을 맞춘다
                        backgroundImage: [
                          `repeating-linear-gradient(to bottom, var(--neutral-100) 0 1px, transparent 1px ${SLOT_H * 2}px)`,
                          `repeating-linear-gradient(to bottom, var(--neutral-50) 0 1px, transparent 1px ${SLOT_H}px)`,
                        ].join(', '),
                      }}
                    >
                      {runs.length === 0 && (
                        <div style={{ position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
                          휴관
                        </div>
                      )}
                      {!dayState.enabled && runs.map(run => (
                        // 블록 미사용 요일: 개관 구간을 자유 배정 영역으로 표시
                        <div
                          key={run.start}
                          title="30분 단위 자유 배정 — 요일 머리글을 눌러 블록 사용으로 전환"
                          style={{
                            position: 'absolute', left: 3, right: 3,
                            top: yOf(run.start) + 1, height: yOf(run.end) - yOf(run.start) - 2,
                            background: 'var(--neutral-50)', border: '1px dashed var(--neutral-300)',
                            borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)',
                          }}
                        >
                          자유 배정
                        </div>
                      ))}
                      {blocks.map(b => {
                        const height = yOf(b.end) - yOf(b.start) - 2
                        const custom = currentStaffing[blockKey(d.value, b.start, b.end)]
                        const selected = selectedIsLive
                          && selectedBlock.day === d.value
                          && selectedBlock.start === b.start
                          && selectedBlock.end === b.end
                        return (
                          <div
                            key={b.start}
                            onClick={() => setSelectedBlock({ period, day: d.value, start: b.start, end: b.end })}
                            title={`${d.label} ${minToHhmm(b.start)}~${minToHhmm(b.end)} 블록 — 통째로 배정되거나 통째로 비워집니다. 눌러서 이 블록의 배정 인원을 정합니다`}
                            style={{
                              position: 'absolute', left: 3, right: 3,
                              top: yOf(b.start) + 1, height,
                              background: 'var(--sogang-red-50)',
                              border: `${selected ? 2 : 1}px solid ${selected || custom ? 'var(--sogang-red)' : 'var(--sogang-red-200)'}`,
                              borderRadius: 4, boxSizing: 'border-box', cursor: 'pointer',
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                              color: 'var(--saint-maroon)', overflow: 'hidden',
                            }}
                          >
                            <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, lineHeight: 1.2 }}>
                              {minToHhmm(b.start)}–{minToHhmm(b.end)}
                            </span>
                            {height >= 40 && (
                              <span style={{
                                fontSize: 'var(--fs-micro)',
                                fontWeight: custom ? 700 : 500,
                                color: 'var(--sogang-red)',
                              }}>
                                {/* 인원을 따로 정한 블록은 길이 대신 그 인원을 보여 준다 */}
                                {custom
                                  ? staffingLabel(custom, minPerSlot, maxPerSlot)
                                  : fmtDuration(b.end - b.start)}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      {dayState.enabled && runs.flatMap(run => {
                        // 구간 안 모든 30분 선이 클릭 대상 — 경계면 '합치기', 아니면 '나누기'
                        const lines = []
                        for (let m = run.start + SLOT_MINUTES; m < run.end; m += SLOT_MINUTES) lines.push(m)
                        return lines.map(m => {
                          const isBoundary = dayState.boundaries.has(m)
                          const hovered = hoverLine?.day === d.value && hoverLine?.minute === m
                          return (
                            <div
                              key={m}
                              onClick={() => toggleBoundary(d.value, m)}
                              onMouseEnter={() => setHoverLine({ day: d.value, minute: m })}
                              onMouseLeave={() => setHoverLine(null)}
                              style={{
                                position: 'absolute', left: 0, right: 0,
                                top: yOf(m) - 6, height: 12, zIndex: 2, cursor: 'pointer',
                              }}
                            >
                              {hovered && (
                                <>
                                  <div style={{
                                    position: 'absolute', left: 2, right: 2, top: 5, height: 0,
                                    borderTop: `2px ${isBoundary ? 'solid var(--danger)' : 'dashed var(--info)'}`,
                                  }} />
                                  <span style={{
                                    position: 'absolute', left: '50%', top: -8, transform: 'translateX(-50%)',
                                    padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                                    fontSize: 'var(--fs-micro)', fontWeight: 700, background: 'var(--surface-card)',
                                    border: `1px solid ${isBoundary ? 'var(--danger)' : 'var(--info)'}`,
                                    color: isBoundary ? 'var(--danger)' : 'var(--info)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                  }}>
                                    {minToHhmm(m)} {isBoundary ? '합치기' : '나누기'}
                                  </span>
                                </>
                              )}
                            </div>
                          )
                        })
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 20, fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
            {mode === 'open' ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--sogang-red)' }} /> 개관
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--saint-grid)', background: 'var(--neutral-0)' }} /> 휴관
                </span>
              </>
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--sogang-red-50)', border: '1px solid var(--sogang-red-200)' }} /> 근무 블록
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--neutral-50)', border: '1px dashed var(--neutral-300)' }} /> 자유 배정 (30분 단위)
                </span>
              </>
            )}
          </div>

          {mode === 'slots' && (
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>
                  블록별 배정 인원 <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--text-subtle)' }}>(선택)</span>
                </span>
                <InfoHint text="수업 시간대마다 필요한 인원이 다른 부서(예: 학과 출석체크 조교)를 위한 설정입니다. 비워 두면 위에서 정한 부서 기본 인원을 씁니다. 블록을 나누거나 합치면 그 블록의 인원 설정도 함께 사라집니다." />
              </div>
              {selectedIsLive ? (() => {
                const key = blockKey(selectedBlock.day, selectedBlock.start, selectedBlock.end)
                const custom = currentStaffing[key]
                const dayLabel = DAYS.find(d => d.value === selectedBlock.day)?.label
                const [min, max] = effectiveStaffing(custom, minPerSlot, maxPerSlot)
                // 빈 칸 = 그 항목은 부서 기본값. 둘 다 비면 설정 자체를 지운다
                const setField = (field, raw) => {
                  const next = { min: custom?.min ?? null, max: custom?.max ?? null }
                  next[field] = raw === '' ? null : Number(raw)
                  setBlockStaffing(prev => {
                    const forPeriod = { ...prev[period] }
                    if (next.min === null && next.max === null) delete forPeriod[key]
                    else forPeriod[key] = next
                    return { ...prev, [period]: forPeriod }
                  })
                }
                const clear = () => setBlockStaffing(prev => {
                  const forPeriod = { ...prev[period] }
                  delete forPeriod[key]
                  return { ...prev, [period]: forPeriod }
                })
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ paddingBottom: 10, fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>
                      {dayLabel} {minToHhmm(selectedBlock.start)}–{minToHhmm(selectedBlock.end)}
                    </span>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>최소 인원</span>
                      <Input
                        type="number" min={0} max={20}
                        value={custom?.min ?? ''}
                        placeholder={String(minPerSlot)}
                        onChange={e => setField('min', e.target.value)}
                        style={{ width: 90 }}
                      />
                    </label>
                    <span style={{ paddingBottom: 10, color: 'var(--text-subtle)' }}>~</span>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>최대 인원</span>
                      <Input
                        type="number" min={1} max={20}
                        value={custom?.max ?? ''}
                        placeholder={String(maxPerSlot)}
                        onChange={e => setField('max', e.target.value)}
                        style={{ width: 90 }}
                      />
                    </label>
                    <span style={{
                      paddingBottom: 10, fontSize: 'var(--fs-sm)', lineHeight: 1.6,
                      color: min > max ? 'var(--danger)' : 'var(--text-subtle)',
                    }}>
                      {min > max
                        ? `최소 인원(${min}명)이 최대 인원(${max}명)보다 많습니다.`
                        : `이 블록은 ${staffingLabel(custom, minPerSlot, maxPerSlot)}으로 배정됩니다. 비워 두면 부서 기본값(${minPerSlot}~${maxPerSlot}명)입니다.`}
                    </span>
                    {custom && (
                      <Button variant="secondary" size="sm" onClick={clear} style={{ marginBottom: 2 }}>
                        부서 기본값으로
                      </Button>
                    )}
                  </div>
                )
              })() : (
                <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  위 달력에서 블록을 클릭하면 그 블록만 인원을 다르게 잡을 수 있습니다.
                  설정한 블록은 카드에 인원이 표시됩니다.
                </p>
              )}
            </div>
          )}
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
            배정 기준의 중요도 <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--text-subtle)' }}>(선택)</span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            아래 항목은 <b style={{ color: 'var(--text-body)' }}>지키면 좋은 기준</b>입니다. 바를 오른쪽으로 옮길수록
            그 기준을 세게 반영하고, 기준끼리 충돌하면 더 세게 반영한 쪽을 먼저 지킵니다.
            손대지 않으면 부서 정책의 기본값(눈금 위치)을 그대로 씁니다.
            맨 왼쪽 &lsquo;반영 안 함&rsquo;으로 두면 그 기준을 아예 보지 않습니다.
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
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-strong)' }}>
                      {PENALTY_LABELS[key]}
                      {custom && (
                        <span style={{ marginLeft: 6, fontSize: 'var(--fs-caption)', fontWeight: 500, color: 'var(--sogang-red)' }}>직접 설정</span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>{description}</div>
                  </div>
                  {/* '기본'(1배)도 값으로 보낸다 — 서버가 1배를 저장에서 빼면서
                      정책 파일 값으로 되돌아간다. 지워서 보내면 되돌림이 전달되지 않는다. */}
                  <ImportanceBar
                    value={value}
                    label={PENALTY_LABELS[key]}
                    onChange={next => setScales(prev => ({ ...prev, [key]: next }))}
                  />
                </div>
              )
            })}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
            여기서 정한 값은 부서의 기본값입니다. 더 세밀한 조정은
            <b style={{ color: 'var(--text-muted)' }}> 근무표 편성 화면의 AI 챗봇</b>에서 대화로도 가능합니다
            (&lsquo;식사 시간 좀 더 챙겨줘&rsquo;처럼 말하면 그 초안에만 적용되고, 원하면 부서 기본값으로 저장할 수 있습니다).
          </p>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
        <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
          AI 검토 규칙 <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--text-subtle)' }}>(선택)</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          부서의 운영 규칙을 <b style={{ color: 'var(--text-body)' }}>자연어</b>로 적어 두면, 근무표 생성 후
          &lsquo;주간 그리드 · 비교&rsquo; 단계에서 AI가 이 규칙 기준으로 초안을 점검해 줍니다.
          한 줄에 규칙 하나씩 적어 주세요. 비워 두면 AI 검토를 사용하지 않습니다.
        </p>
        <Textarea
          value={rules}
          onChange={e => setRules(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder={'예: 금요일 마감 시간대(17시 이후)에는 경험자가 최소 1명 있어야 한다.\n예: 시험기간 전 주에는 신입을 혼자 배치하지 않는다.'}
        />
      </div>

      {error && (
<Alert tone="danger">{error}</Alert>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="secondary" size="sm" onClick={reset} disabled={!changed || saving}>
          <RotateCcw size={13} /> 되돌리기
        </Button>
        {onClose && <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>닫기</Button>}
        <Button size="sm" onClick={handleSave} disabled={!changed || saving || staffingInvalid || blockStaffingInvalid || biweeklyInvalid}>
          <Check size={13} /> {saving ? '저장 중...' : '설정 저장'}
        </Button>
      </div>
    </div>
  )
}

// 항상 보이는 설명 문장 대신, 마우스를 올렸을 때만 뜨는 짧은 도움말 아이콘.
// 브라우저 기본 title 속성을 그대로 써서 별도 팝업 구현 없이 가볍게 처리한다.
function InfoHint({ text }) {
  return (
    <span title={text} style={{ display: 'inline-flex', cursor: 'help', color: 'var(--text-subtle)' }}>
      <Info size={14} />
    </span>
  )
}


const headStyle = {
  // 헤더 행(요일 이름)의 획은 흰색 — 연한 베이지 배경 위에서 회색 획이 잘 안 보여서
  border: '1px solid var(--neutral-0)',
  background: 'var(--saint-tan)',
  color: 'var(--saint-maroon)',
  fontSize: 'var(--fs-sm)', fontWeight: 700,
  padding: '6px 4px', textAlign: 'center',
}

// 시간 행 머리글(왼쪽 첫 열) — 데이터 칸과 같은 높이(18px)로 고정해 30분 칸 크기를 맞춘다.
// 모든 행에 시각을 표시하므로(정시든 30분이든) 헤더 행과 달리 세로 패딩을 두지 않는다.
const slotLabelStyle = {
  border: '1px solid var(--neutral-0)',
  background: 'var(--saint-tan-soft)',
  color: 'var(--saint-maroon)',
  fontSize: 'var(--fs-caption)',
  height: 18, padding: '0 4px', textAlign: 'center',
}
