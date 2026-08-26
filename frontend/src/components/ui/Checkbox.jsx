// 디자인 시스템 Checkbox (uiux/components/forms/Checkbox.jsx 기준).
import { useId } from 'react'

export default function Checkbox({ label, checked, disabled = false, id, style = {}, ...rest }) {
  const auto = useId()
  const cid = id || auto
  return (
    <label htmlFor={cid} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      fontSize: 'var(--fs-body)', color: 'var(--text-body)', userSelect: 'none', ...style,
    }}>
      <input
        id={cid} type="checkbox" className="stream-control"
        checked={checked} disabled={disabled}
        style={{ width: 16, height: 16, margin: 0, accentColor: 'var(--sogang-red)', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  )
}
