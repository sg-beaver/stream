import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import DepartmentPolicyEditor from '../../components/admin/DepartmentPolicyEditor'
import { fetchDepartmentPolicy, updateDepartmentPolicy } from '../../api/client'
import { getSessionUser } from '../../utils/session'

// 부서 설정 — 근무표 생성 플로우에 들어가지 않고도 부서 정책(개관 시간·근무 슬롯·
// 배정 인원·중요도·AI 검토 규칙)을 바로 편집하는 전용 페이지.
// 편집기 자체는 생성 플로우의 '근무표 설정'과 같은 DepartmentPolicyEditor를 공유한다.
export default function AdminSettingsPage() {
  const user = getSessionUser()
  const departmentId = user?.department_id

  const [policy, setPolicy] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  // 저장 성공 시 편집기를 리마운트해 draft 상태를 새 정책 기준으로 재초기화한다
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!departmentId) {
      setLoadError('로그인 정보에 소속 부서가 없습니다. 직원 계정으로 다시 로그인해 주세요.')
      return
    }
    let alive = true
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
            onSave={handleSave}
            saving={saving}
            error={saveError}
          />
        </div>
      )}
    </AdminShell>
  )
}
