import { useNavigate, useLocation } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import Shell from '../components/layout/Shell'
import Button from '../components/ui/Button'

export default function ApplicationCompletePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { title, org } = location.state || {}

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

        <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>
          지원이 완료되었습니다
        </h1>
        {(org || title) && (
          <p style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text-body)', fontWeight: 600 }}>
            {org && `${org} · `}{title}
          </p>
        )}
        <p style={{ margin: '0 0 32px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          지원서가 정상적으로 제출되었습니다.<br />
          결과는 이메일 및 STREAM 알림으로 안내드립니다.
        </p>

        {/* 진행 단계 안내 */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0,
          marginBottom: 36, padding: '16px 0',
          borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          {['제출완료', '서류검토', '면접', '결과'].map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: i === 0 ? 'var(--sogang-red)' : 'var(--neutral-200)',
                  color: i === 0 ? '#fff' : 'var(--text-subtle)',
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 6px',
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 11, color: i === 0 ? 'var(--sogang-red)' : 'var(--text-subtle)', fontWeight: i === 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {step}
                </div>
              </div>
              {i < 3 && (
                <div style={{ width: 32, height: 2, background: 'var(--neutral-200)', margin: '0 4px 20px' }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button block onClick={() => navigate('/applications')}>내 지원 현황 보기</Button>
          <Button block variant="secondary" onClick={() => navigate('/posts')}>공고 목록으로 돌아가기</Button>
        </div>
      </div>
    </Shell>
  )
}
