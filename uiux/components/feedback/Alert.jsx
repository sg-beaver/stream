import React from "react";

/**
 * Alert — inline banner for page/section messages. Tone maps to semantic
 * colors with a leading rule and optional title + dismiss.
 */
export function Alert({ tone = "info", title, icon, onDismiss, style = {}, children, ...rest }) {
  const tones = {
    info:    { fg: "var(--info)", bg: "var(--info-50)", bd: "var(--info-100)" },
    success: { fg: "var(--success)", bg: "var(--success-50)", bd: "var(--success-100)" },
    warning: { fg: "var(--warning)", bg: "var(--warning-50)", bd: "var(--warning-100)" },
    danger:  { fg: "var(--danger)", bg: "var(--danger-50)", bd: "var(--danger-100)" },
    neutral: { fg: "var(--neutral-700)", bg: "var(--neutral-50)", bd: "var(--neutral-200)" },
  };
  const t = tones[tone] || tones.info;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: t.bg,
        border: `1px solid ${t.bd}`,
        borderLeft: `3px solid ${t.fg}`,
        borderRadius: "var(--radius-sm)",
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: t.fg, display: "inline-flex", flex: "0 0 auto", marginTop: 1 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--text-strong)", marginBottom: children ? 3 : 0 }}>{title}</div>}
        {children && <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-body)", lineHeight: 1.55 }}>{children}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="stream-iconbtn" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", width: 24, height: 24, borderRadius: "var(--radius-xs)", flex: "0 0 auto", fontSize: 16, lineHeight: 1 }}>×</button>
      )}
    </div>
  );
}
