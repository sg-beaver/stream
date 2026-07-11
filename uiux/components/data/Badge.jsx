import React from "react";

/**
 * Badge — small status/label chip. Tones map to semantic colors.
 * Use `soft` (default, tinted fill) or `solid`.
 */
export function Badge({ tone = "neutral", variant = "soft", dot = false, style = {}, children, ...rest }) {
  const tones = {
    neutral: { fg: "var(--neutral-700)", soft: "var(--neutral-100)", solid: "var(--neutral-700)", border: "var(--neutral-200)" },
    brand:   { fg: "var(--sogang-red)", soft: "var(--sogang-red-50)", solid: "var(--sogang-red)", border: "var(--sogang-red-100)" },
    success: { fg: "var(--success)", soft: "var(--success-50)", solid: "var(--success)", border: "var(--success-100)" },
    warning: { fg: "var(--warning)", soft: "var(--warning-50)", solid: "var(--warning)", border: "var(--warning-100)" },
    danger:  { fg: "var(--danger)", soft: "var(--danger-50)", solid: "var(--danger)", border: "var(--danger-100)" },
    info:    { fg: "var(--info)", soft: "var(--info-50)", solid: "var(--info)", border: "var(--info-100)" },
  };
  const t = tones[tone] || tones.neutral;
  const solid = variant === "solid";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 21,
        padding: "0 8px",
        fontSize: "var(--fs-micro)",
        fontWeight: "var(--fw-semibold)",
        letterSpacing: "var(--ls-wide)",
        lineHeight: 1,
        borderRadius: "var(--radius-sm)",
        color: solid ? "#fff" : t.fg,
        background: solid ? t.solid : t.soft,
        border: `1px solid ${solid ? "transparent" : t.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: solid ? "#fff" : t.fg }} />}
      {children}
    </span>
  );
}
