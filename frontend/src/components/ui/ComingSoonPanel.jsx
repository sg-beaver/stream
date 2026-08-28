// 관리자 화면 명세 도착 전까지 사용하는 뼈대용 플레이스홀더 (uiux/ui_kits/admin 기능 구조만 참고, 비주얼은 미확정)
export default function ComingSoonPanel({ description }) {
  return (
    <div style={{
      background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)',
      padding: '48px 28px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>준비 중인 화면입니다</div>
      <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>{description}</p>
    </div>
  )
}
