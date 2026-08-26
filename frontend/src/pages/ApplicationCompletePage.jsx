import { useNavigate, useLocation } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import Shell from '../components/layout/Shell'
import Button from '../components/ui/Button'
import Stepper from '../components/ui/Stepper'

export default function ApplicationCompletePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { title, departmentName } = location.state || {}

  return (
    <Shell activeMenu="apply">
      <div style={{
        maxWidth: 520, margin: '64px auto', textAlign: 'center',
        background: 'var(--neutral-0)', borderRadius: 'var(--radius-xl)',
        padding: '52px 40px', border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* 완료 아이콘 */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 0 0 10px var(--success-50)',
        }}>
          <CheckCircle size={40} color="var(--success)" strokeWidth={2} />
        </div>

        <h1 style={{ margin: '0 0 10px', fontSize: 'var(--fs-h2)', fontWeight: 800, color: 'var(--text-strong)' }}>
          지원이 완료되었습니다
        </h1>
        {(departmentName || title) && (
          <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-title)', color: 'var(--text-body)', fontWeight: 600 }}>
            {departmentName && `${departmentName} · `}{title}
          </p>
        )}
        <p style={{ margin: '0 0 32px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          지원서가 정상적으로 제출되었습니다.<br />
          결과는 이메일 및 STREAM 알림으로 안내드립니다.
        </p>

        {/* 진행 단계 안내 */}
        <div style={{
          marginBottom: 36, padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <Stepper status="제출완료" size="md" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button block onClick={() => navigate('/applications')}>내 지원 현황 보기</Button>
          <Button block variant="secondary" onClick={() => navigate('/posts')}>공고 목록으로 돌아가기</Button>
        </div>
      </div>
    </Shell>
  )
}
