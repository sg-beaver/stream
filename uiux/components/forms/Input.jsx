import React from "react";

/** Text input. Supports invalid state, sizes, and optional leading/trailing adornment. */
export function Input({
  size = "md",
  invalid = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { height: 32, fontSize: "var(--fs-sm)", pad: 10 },
    md: { height: 38, fontSize: "var(--fs-body)", pad: 12 },
    lg: { height: 44, fontSize: "var(--fs-title)", pad: 14 },
  };
  const s = sizes[size] || sizes.md;

  const field = (
    <input
      className="stream-input"
      disabled={disabled}
      aria-invalid={invalid || undefined}
      style={{
        width: "100%",
        height: s.height,
        padding: `0 ${s.pad}px`,
        paddingLeft: iconLeft ? s.height : s.pad,
        paddingRight: iconRight ? s.height : s.pad,
        fontFamily: "var(--font-sans)",
        fontSize: s.fontSize,
        color: "var(--text-strong)",
        background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
        border: `1px solid ${invalid ? "var(--danger)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-sm)",
        outline: "none",
        transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        ...(iconLeft || iconRight ? {} : style),
        ...(iconLeft || iconRight ? {} : {}),
      }}
      {...rest}
    />
  );

  if (!iconLeft && !iconRight) return field;

  return (
    <div style={{ position: "relative", display: "block", ...style }}>
      {iconLeft && (
        <span style={{ position: "absolute", left: 0, top: 0, height: s.height, width: s.height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", pointerEvents: "none" }}>{iconLeft}</span>
      )}
      {field}
      {iconRight && (
        <span style={{ position: "absolute", right: 0, top: 0, height: s.height, width: s.height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>{iconRight}</span>
      )}
    </div>
  );
}
