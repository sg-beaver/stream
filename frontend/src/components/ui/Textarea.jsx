// 디자인 시스템 Textarea (uiux/components/forms/Textarea.jsx 기준).
export default function Textarea({ invalid = false, disabled = false, rows = 4, style = {}, ...rest }) {
  return (
    <textarea
      className="stream-textarea"
      rows={rows}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '10px 12px',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-body)',
        lineHeight: 'var(--lh-normal)', color: 'var(--text-strong)',
        background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
        border: `1px solid ${invalid ? 'var(--danger)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical',
        transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
      {...rest}
    />
  )
}
