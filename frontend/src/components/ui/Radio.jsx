// 디자인 시스템 Radio (uiux/components/forms/Radio.jsx 기준). 같은 name으로 묶는다.
import { useId } from 'react'

export default function Radio({ label, checked, disabled = false, id, name, value, style = {}, ...rest }) {
  const auto = useId()
  const rid = id || auto
  return (
    <label htmlFor={rid} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      fontSize: 'var(--fs-body)', color: 'var(--text-body)', userSelect: 'none', ...style,
    }}>
      <input
        id={rid} type="radio" className="stream-control"
        name={name} value={value} checked={checked} disabled={disabled}
        style={{ width: 16, height: 16, margin: 0, accentColor: 'var(--sogang-red)', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  )
}
