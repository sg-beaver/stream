import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Shell from '../components/layout/Shell'
import IdPhoto from '../components/ui/IdPhoto'
import PageTitle from '../components/ui/PageTitle'
import Button from '../components/ui/Button'
import TimeGrid from '../components/ui/TimeGrid'
import { RowTable, AddRowButton, TextField } from '../components/ui/ResumeTables'
import { getSessionUser } from '../utils/session'
import {
  fetchMyAvailability, replaceMyAvailability, fetchMyClassTime, replaceMyClassTime,
  fetchMyCommonApplication, saveMyCommonApplication,
} from '../api/client'
import {
  emptyCommonApplication, commonApplicationFromApi, commonApplicationToApi,
  INTEREST_OPTIONS,
  newCareerRow, newLanguageRow, newCertificateRow,
  CAREER_COLUMNS, LANGUAGE_COLUMNS, CERTIFICATE_COLUMNS,
} from '../utils/commonApplication'

// 시간표 그리드의 30분 단위 행 (08:00~22:00) — 실제 시급 지급 기준 단위 (uiux 킷 명세, PR #71)
const HALF_HOUR_ROWS = Array.from({ length: (22 - 8) * 2 }, (_, i) => {
  const m = 8 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

export default function CommonApplicationPage() {
  const user = getSessionUser() ?? {}
  const [data, setData] = useState(emptyCommonApplication)
  const [profileLoading, setProfileLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [classSlots, setClassSlots] = useState([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [classTimeLoading, setClassTimeLoading] = useState(true)
  const timesLoading = availabilityLoading || classTimeLoading
  // 시간표 입력 모드 — 하나의 그리드에서 클릭이 수업/근무 가능 중 무엇을 토글할지 (uiux 킷 단일 그리드)
  const [gridMode, setGridMode] = useState('class') // 'class' | 'avail'

  // 기본 인적사항·경력·어학·자격증(#122)과 근무 가능 시간·수업 시간(REQ-SCHED-014/015) 모두
  // 서버가 원본이다. 수업 시간은 SAINT 수강신청 자동 연동 전까지 학생이 직접 입력하는 임시 수단.
  useEffect(() => {
    let alive = true
    fetchMyCommonApplication()
      .then(res => {
        if (!alive) return
        // 가능 시간은 별도 API가 채우므로 여기서 덮어쓰지 않는다
        setData(prev => ({ ...commonApplicationFromApi(res), availableSlots: prev.availableSlots }))
      })
      .catch(err => { if (alive) setLoadError(err.message) })
      .finally(() => { if (alive) setProfileLoading(false) })
    fetchMyAvailability()
      .then(res => { if (alive) setData(prev => ({ ...prev, availableSlots: res.slots })) })
      .catch(() => {}) // 조회 실패 시 로컬에 남아있던 값을 그대로 둔다
      .finally(() => { if (alive) setAvailabilityLoading(false) })
    fetchMyClassTime()
      .then(res => { if (alive) setClassSlots(res.slots) })
      .catch(() => {})
      .finally(() => { if (alive) setClassTimeLoading(false) })
    return () => { alive = false }
  }, [])

  // 두 값이 각각 독립적으로 로드되므로, 과거에 저장된 근무 가능 시간이 그 사이 새로 등록된
  // 수업 시간과 겹치는 경우를 정리한다 (겹치는 슬롯은 화면에도 항상 "수업"으로만 보이지만,
  // 저장 시 서버에도 중복 없이 반영되도록 로드 시점에 한 번 맞춰둔다).
  useEffect(() => {
    if (timesLoading) return
    setData(prev => {
      const overlap = prev.availableSlots.some(k => classSlots.includes(k))
      return overlap ? { ...prev, availableSlots: prev.availableSlots.filter(k => !classSlots.includes(k)) } : prev
    })
  }, [classSlots, timesLoading])

  function update(patch) {
    setData(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }
  function updateBasic(field, value) {
    update({ basic: { ...data.basic, [field]: value } })
  }

  function addRow(key, factory) {
    update({ [key]: [...data[key], factory()] })
  }
  function updateRow(key, id, field, value) {
    update({ [key]: data[key].map(r => r.id === id ? { ...r, [field]: value } : r) })
  }
  function removeRow(key, id) {
    update({ [key]: data[key].filter(r => r.id !== id) })
  }

  function toggleInterest(opt) {
    const cur = data.basic.interests ?? []
    updateBasic('interests', cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt])
  }

  function toggleSlot(key) {
    const has = data.availableSlots.includes(key)
    update({ availableSlots: has ? data.availableSlots.filter(k => k !== key) : [...data.availableSlots, key] })
  }

  function toggleClassSlot(key) {
    const has = classSlots.includes(key)
    setClassSlots(has ? classSlots.filter(k => k !== key) : [...classSlots, key])
    if (!has) {
      // 그 시간을 수업으로 표시하면 더 이상 근무 가능 시간일 수 없다
      update({ availableSlots: data.availableSlots.filter(k => k !== key) })
    } else {
      setSaved(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const [, , saved] = await Promise.all([
        replaceMyClassTime(classSlots),
        replaceMyAvailability(data.availableSlots),
        saveMyCommonApplication(commonApplicationToApi(data)),
      ])
      // 저장 결과로 화면을 맞춘다 — 서버가 빈 행을 걸러내거나 순서를 정리했을 수 있다
      setData(prev => ({ ...commonApplicationFromApi(saved), availableSlots: prev.availableSlots }))
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell activeMenu="profile">
      <PageTitle>공통 지원서</PageTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Section title="기본 인적사항">
          <div style={{ display: 'flex', gap: 24 }}>
            <IdPhoto studentId={user.id} placeholder="사진 준비 중" />
            {/* 2행 4열 — 1행: 이름·학번·학과·학기 / 2행: 재학상태·연락처·이메일 */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 24px' }}>
              <ReadonlyField label="이름" value={data.basic.name || user.name} />
              <ReadonlyField label="학번" value={data.basic.student_id || user.id} />
              <ReadonlyField label="학과" value={data.basic.department_name || user.major} />
              <ReadonlyField label="학기" value={data.basic.semester ? `${data.basic.semester}학기` : '-'} />
              <ReadonlyField label="재학상태" value={data.basic.enroll_status} />
              <TextField label="연락처" value={data.basic.phone} onChange={v => updateBasic('phone', v)} placeholder="010-0000-0000" />
              <TextField label="이메일" value={data.basic.email} onChange={v => updateBasic('email', v)} placeholder="example@sogang.ac.kr" />
            </div>
          </div>
        </Section>

        <Section title="관심 분야" subtitle="선택한 분야의 공고가 우선 추천됩니다">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {INTEREST_OPTIONS.map(opt => {
              const on = (data.basic.interests ?? []).includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleInterest(opt)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 38, padding: '0 16px',
                    background: on ? 'var(--sogang-red-50)' : 'var(--surface-card)',
                    border: `1px solid ${on ? 'var(--sogang-red-200)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-pill)',
                    fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-body)',
                    fontWeight: on ? 'var(--fw-bold)' : 'var(--fw-medium)',
                    color: on ? 'var(--sogang-red)' : 'var(--text-body)',
                    cursor: 'pointer',
                  }}
                >
                  {on && <Check size={14} />}
                  {opt}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="경력·활동 사항" subtitle="교내근로, 인턴, 동아리, 봉사, 아르바이트 등">
          <RowTable
            columns={CAREER_COLUMNS}
            rows={data.careers}
            onChange={(id, field, value) => updateRow('careers', id, field, value)}
            onRemove={id => removeRow('careers', id)}
          />
          <AddRowButton label="경력·활동 추가" onClick={() => addRow('careers', newCareerRow)} />
        </Section>

        <Section title="어학성적">
          <RowTable
            columns={LANGUAGE_COLUMNS}
            rows={data.languages}
            onChange={(id, field, value) => updateRow('languages', id, field, value)}
            onRemove={id => removeRow('languages', id)}
          />
          <AddRowButton label="어학성적 추가" onClick={() => addRow('languages', newLanguageRow)} />
        </Section>

        <Section title="자격증">
          <RowTable
            columns={CERTIFICATE_COLUMNS}
            rows={data.certificates}
            onChange={(id, field, value) => updateRow('certificates', id, field, value)}
            onRemove={id => removeRow('certificates', id)}
          />
          <AddRowButton label="자격증 추가" onClick={() => addRow('certificates', newCertificateRow)} />
        </Section>

        <Section
          title="이번 학기 시간표 · 근무 가능 시간"
          subtitle="한 학기 동안 매주 반복되는 고정 시간표입니다. 수업 시간을 먼저 표시한 뒤, 입력 모드를 바꿔 빈 칸을 눌러 근무 가능 시간을 표시해주세요 (30분 단위). 담당자가 이 시간표를 기준으로 학기 근무표를 편성하며, 지원서 작성 시에도 그대로 사용됩니다. 저장은 아래 '공통 지원서 저장'으로 한 번에 됩니다."
        >
          {timesLoading ? (
            <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>불러오는 중...</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <ModeTab active={gridMode === 'class'} onClick={() => setGridMode('class')}>수업 시간 입력</ModeTab>
                <ModeTab active={gridMode === 'avail'} onClick={() => setGridMode('avail')}>근무 가능 시간 입력</ModeTab>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
                  {gridMode === 'class'
                    ? '칸을 클릭하면 수업시간으로 표시/해제됩니다. 수업으로 표시한 칸은 근무 가능 시간에서 자동 제외됩니다.'
                    : '빈 칸을 클릭하면 근무 가능 시간으로 표시/해제됩니다. 수업시간 칸은 선택할 수 없습니다.'}
                </span>
              </div>
              <TimeGrid
                rows={HALF_HOUR_ROWS} rowHeight={17}
                classSlots={classSlots} classLabel="수업"
                availableSlots={data.availableSlots}
                editable
                onToggle={gridMode === 'class' ? toggleClassSlot : toggleSlot}
                clickableSlots={gridMode === 'class' ? classSlots : []}
                onSlotClick={gridMode === 'class' ? toggleClassSlot : undefined}
                classLegendText={gridMode === 'class' ? '수업시간 (클릭하여 표시/해제)' : '수업시간 (선택 불가)'}
                availableLegendText="근무 가능 시간 (클릭하여 표시/해제)"
              />
            </>
          )}
        </Section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
          {saveError && <span style={{ fontSize: 'var(--fs-body)', color: 'var(--danger)', fontWeight: 600 }}>{saveError}</span>}
          {saved && <span style={{ fontSize: 'var(--fs-body)', color: 'var(--success)', fontWeight: 600 }}>저장되었습니다</span>}
          <Button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '공통 지원서 저장'}</Button>
        </div>
      </div>
    </Shell>
  )
}

function ModeTab({ active, onClick, children }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        minHeight: 32, padding: '6px 14px', borderRadius: 8, fontSize: 'var(--fs-sm)', fontWeight: 700,
        lineHeight: 1.35, wordBreak: 'keep-all', // 좁아지면 "수업 시간 / 입력"처럼 단어 단위로만 줄바꿈
        cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0,
        border: `1px solid ${active ? 'var(--sogang-red)' : 'var(--border-default)'}`,
        background: active ? 'var(--sogang-red)' : 'var(--surface-card)',
        color: active ? 'var(--text-on-brand)' : 'var(--text-body)',
      }}
    >{children}</button>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ReadonlyField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{
        height: 38, padding: '0 12px', display: 'flex', alignItems: 'center',
        background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--text-body)',
      }}>
        {value}
      </div>
    </div>
  )
}
