import React from "react";

/**
 * ToolbarButton — the bordered SAINT action button (e.g. 조회, 신고생성, 수정),
 * a compact white/grey button with an optional small icon. `tone="primary"`
 * fills it Sogang red for the main confirm action (조회, 저장).
 */
export function ToolbarButton({ icon, tone = "default", disabled = false, style = {}, children, ...rest }) {
  const tones = {
    default: { background: "linear-gradient(var(--neutral-0), var(--neutral-50))", color: "var(--neutral-800)", border: "1px solid var(--border-default)" },
    primary: { background: "var(--sogang-red)", color: "#fff", border: "1px solid var(--sogang-red)" },
    ghost:   { background: "transparent", color: "var(--neutral-700)", border: "1px solid transparent" },
  };
  const t = tones[tone] || tones.default;
  return (
    <button
      type="button"
      className="stream-toolbtn"
      data-tone={tone}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 11px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-sm)",
        fontWeight: "var(--fw-semibold)",
        lineHeight: 1,
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        ...t,
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** Toolbar — a horizontal action row, usually above a table. `align` end/between. */
export function Toolbar({ align = "start", label, style = {}, children }) {
  const justify = align === "end" ? "flex-end" : align === "between" ? "space-between" : "flex-start";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 8, flexWrap: "wrap", ...style }}>
      {label && <span style={{ fontSize: "var(--fs-sm)", color: "var(--neutral-600)", fontWeight: "var(--fw-semibold)", marginRight: 4 }}>{label}</span>}
      {children}
    </div>
  );
}
