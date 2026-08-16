import { useEffect, useState } from 'react'
import { User as UserIcon } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import Button from '../components/ui/Button'
import TimeGrid from '../components/ui/TimeGrid'
import { RowTable, AddRowButton, TextField } from '../components/ui/ResumeTables'
import { getSessionUser } from '../utils/session'
import { fetchMyAvailability, replaceMyAvailability, fetchMyClassTime, replaceMyClassTime } from '../api/client'
import {
  getCommonApplication, saveCommonApplication, emptyCommonApplication,
  MOCK_ACADEMIC_INFO,
  newCareerRow, newLanguageRow, newCertificateRow,
  CAREER_COLUMNS, LANGUAGE_COLUMNS, CERTIFICATE_COLUMNS,
} from '../utils/commonApplication'

export default function CommonApplicationPage() {
  const user = getSessionUser() ?? {}
  const [data, setData] = useState(() => getCommonApplication() ?? emptyCommonApplication())
  const [classSlots, setClassSlots] = useState([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [classTimeLoading, setClassTimeLoading] = useState(true)
  const timesLoading = availabilityLoading || classTimeLoading

  // 근무 가능 시간·수업 시간 모두 이제 서버(available_time·class_time)가 원본이다 — 새로고침해도
  // 이전에 저장했거나 지원서에서 연동된 상태를 그대로 복원한다 (REQ-SCHED-014/015). 수업 시간은
  // SAINT 수강신청 자동 연동 전까지 학생이 직접 입력하는 임시 수단이다. 나머지 항목(경력·어학·
  // 자격증 등)은 아직 백엔드 API가 없어(API_SPEC.md 미정의) 로컬 저장을 유지한다.
  useEffect(() => {
    let alive = true
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
      await Promise.all([
        replaceMyClassTime(classSlots),
        replaceMyAvailability(data.availableSlots),
      ])
      saveCommonApplication(data)
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
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
        여기에 저장해두면 공고 지원 시 "공통 지원서 불러오기"로 자동 채울 수 있습니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Section title="기본 인적사항">
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={photoBox}>
              <UserIcon size={36} color="var(--sogang-silver)" />
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}>사진 준비 중</div>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 24px' }}>
              <ReadonlyField label="이름" value={user.name} />
              <ReadonlyField label="학번" value={user.id} />
              <ReadonlyField label="학기" value={MOCK_ACADEMIC_INFO.semester} />
              <ReadonlyField label="재학상태" value={MOCK_ACADEMIC_INFO.enrollStatus} />
              <TextField label="학과" value={data.basic.major} onChange={v => updateBasic('major', v)} placeholder="예: 경영학과" />
              <TextField label="연락처" value={data.basic.phone} onChange={v => updateBasic('phone', v)} placeholder="010-0000-0000" />
              <TextField label="이메일" value={data.basic.email} onChange={v => updateBasic('email', v)} placeholder="example@sogang.ac.kr" />
            </div>
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

        <Section title="수업 시간" subtitle="요일별 수업이 있는 시간을 클릭하여 표시해주세요. SAINT 수강신청 자동 연동 전까지는 직접 입력합니다.">
          {timesLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</p>
          ) : (
            <TimeGrid availableSlots={classSlots} editable onToggle={toggleClassSlot} availableLegendText="수업 시간" />
          )}
        </Section>

        <Section title="근무 가능 시간" subtitle="수업 시간을 제외한 근무 가능한 시간을 클릭하여 선택해주세요.">
          {timesLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</p>
          ) : (
            <TimeGrid classSlots={classSlots} availableSlots={data.availableSlots} editable onToggle={toggleSlot} />
          )}
        </Section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
          {saveError && <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>{saveError}</span>}
          {saved && <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>저장되었습니다</span>}
          <Button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '공통 지원서 저장'}</Button>
        </div>
      </div>
    </Shell>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const photoBox = {
  width: 104, height: 132, flexShrink: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
}

function ReadonlyField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{
        height: 38, padding: '0 12px', display: 'flex', alignItems: 'center',
        background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text-body)',
      }}>
        {value}
      </div>
    </div>
  )
}
