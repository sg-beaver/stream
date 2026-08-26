import React from "react";

/**
 * IconButton — square, icon-only action for toolbars and table rows.
 * Pass a Lucide <Icon /> (or any node) as children.
 */
export function IconButton({
  size = "md",
  variant = "ghost",
  disabled = false,
  label,
  style = {},
  children,
  ...rest
}) {
  const dims = { sm: 28, md: 34, lg: 40 };
  const d = dims[size] || dims.md;
  const variants = {
    ghost: { background: "transparent", border: "1px solid transparent", color: "var(--text-muted)" },
    outline: { background: "var(--surface-card)", border: "1px solid var(--border-default)", color: "var(--text-body)" },
  };
  const v = variants[variant] || variants.ghost;
  return (
    <button
      type="button"
      className="stream-iconbtn"
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: d,
        height: d,
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background var(--dur-fast) var(--ease-standard)",
        ...v,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
