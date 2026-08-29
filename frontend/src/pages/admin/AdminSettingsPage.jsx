import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import DepartmentPolicyEditor from '../../components/admin/DepartmentPolicyEditor'
import { fetchDepartmentPolicy, fetchTerms, updateDepartmentPolicy } from '../../api/client'
import { getSessionUser } from '../../utils/session'

// 부서 설정 — 부서 정책(개관 시간·근무 슬롯·배정 인원·중요도·AI 검토 규칙)을 편집하는
// 유일한 지점. 근무표 생성 화면에는 편집기를 두지 않고 이 페이지로 보낸다 (#154).
//
// 학생팀장에게도 직원과 똑같이 열려 있다 (#156) — 개관 시간·근무 슬롯·배정 인원이 곧
// 편성 결과라, 근무표를 짜는 사람이 그 기준값도 잡는다. 백엔드도 같은 경계다:
// GET·PATCH /schedule/policy/{id} 모두 require_schedule_editor.

// generate가 받지 않는(부서 정책 JSON에 고정된) 필수 제약 — 담당자에게 무엇이 적용되는지 알려준다.
// 생성 화면에 있던 목록을 정책을 실제로 고치는 이 화면으로 옮겼다 (#154).
const APPLIED_CONSTRAINTS = [
  ['중복 근무 제한', '동일 학생이 같은 시간대에 두 번 배정되지 않습니다.'],
  ['주간 근로시간 상한', '교비 주 14시간 / 국가 주 20시간(학기)·40시간(방학) 기준으로 제한합니다.'],
  ['수업시간 자동 회피', '학생이 제출한 수업시간과 겹치는 시간대는 배정에서 제외됩니다.'],
  ['2주 근로시간 상한', '부서 교비 근로 학생 전체의 2주 합계가 설정한 상한을 넘지 않습니다.'],
  ['최소 인원 확보', '개관 시간대의 최소 배정 인원을 맞추고, 못 맞춘 칸은 미충원으로 보고합니다.'],
]

export default function AdminSettingsPage() {
  const user = getSessionUser()
  const departmentId = user?.department_id

  const [policy, setPolicy] = useState(null)
  // 기본 학기 선택기가 쓰는 학사 학기 목록 (#172)
  const [terms, setTerms] = useState([])
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  // 저장 성공 시 편집기를 리마운트해 draft 상태를 새 정책 기준으로 재초기화한다
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!departmentId) {
      setLoadError('로그인 정보에 소속 부서가 없습니다. 다시 로그인해 주세요.')
      return
    }
    let alive = true
    fetchTerms()
      .then(res => { if (alive) setTerms(res.terms ?? []) })
      .catch(() => { /* 학기 목록은 없어도 '오늘 기준'으로 쓸 수 있다 */ })
    fetchDepartmentPolicy(departmentId)
      .then(p => { if (alive) setPolicy(p) })
      .catch(e => { if (alive) setLoadError(`부서 정책을 불러오지 못했습니다. ${e.message}`) })
    return () => { alive = false }
  }, [departmentId])

  const handleSave = async patch => {
    setSaving(true)
    setSaveError('')
    setSaved(false)
    try {
      setPolicy(await updateDepartmentPolicy(departmentId, patch))
      setRevision(v => v + 1)
      setSaved(true)
    } catch (e) {
      setSaveError(`설정을 저장하지 못했습니다. ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminShell activeMenu="settings">
      <PageTitle>부서 설정</PageTitle>
      <p style={{ margin: '0 0 20px 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {user?.department_name ?? '우리 부서'}의 근무표 생성 기준을 관리합니다 — 개관 시간, 근무 슬롯(블록),
        배정 인원, 배정 기준의 중요도, AI 검토 규칙. 저장하면 이후 근무표 생성부터 바로 적용됩니다.
      </p>

      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--success)' }}>
          <CircleCheck size={15} style={{ flexShrink: 0 }} /> 설정이 저장되었습니다.
        </div>
      )}

      {loadError ? (
        <div style={{ padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--danger)' }}>
          {loadError}
        </div>
      ) : policy === null ? (
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>부서 정책을 불러오는 중...</p>
      ) : (
        <div style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px 22px' }}>
          <DepartmentPolicyEditor
            key={revision}
            policy={policy}
            terms={terms}
            onSave={handleSave}
            saving={saving}
            error={saveError}
          />
        </div>
      )}

      {/* 화면에서 켜고 끄지 않는 필수 제약 — 값은 위 설정과 학교 규정에서 온다 */}
      <div style={{ marginTop: 18, background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px 22px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-h3)', fontWeight: 700, color: 'var(--text-strong)' }}>항상 적용되는 제약</h3>
        <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          아래 필수 제약(Hard Constraint)은 근무표를 생성할 때마다 항상 적용됩니다. 생성 화면에서 켜고 끌 수 없고,
          값은 위 부서 설정과 학교 근로 규정에서 옵니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {APPLIED_CONSTRAINTS.map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-25)' }}>
              <CircleCheck size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>{title}</span>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>{desc}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  )
}
