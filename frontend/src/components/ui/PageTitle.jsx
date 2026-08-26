export default function PageTitle({ children }) {
  return (
    <div style={{
      padding: '10px 16px',
      border: '2px solid var(--saint-red)',
      borderRadius: 10,
      background: 'var(--surface-card)',
      marginBottom: 20,
      fontFamily: 'var(--font-sans)',
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--text-strong)',
      letterSpacing: '-0.2px',
    }}>
      {children}
    </div>
  )
}
