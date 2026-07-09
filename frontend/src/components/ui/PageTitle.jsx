export default function PageTitle({ children }) {
  return (
    <div style={{
      padding: '10px 16px',
      border: '1px solid var(--saint-red)',
      borderLeft: '4px solid var(--saint-red)',
      background: '#fff',
      marginBottom: 20,
      fontFamily: 'var(--font-saint)',
      fontSize: 15,
      fontWeight: 700,
      color: '#111111',
      letterSpacing: '-0.3px',
    }}>
      {children}
    </div>
  )
}
