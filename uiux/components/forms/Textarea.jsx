import React from "react";

/** Multi-line text input. */
export function Textarea({ invalid = false, disabled = false, rows = 4, style = {}, ...rest }) {
  return (
    <textarea
      className="stream-textarea"
      disabled={disabled}
      rows={rows}
      aria-invalid={invalid || undefined}
      style={{
        width: "100%",
        padding: "10px 12px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
        lineHeight: "var(--lh-normal)",
        color: "var(--text-strong)",
        background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
        border: `1px solid ${invalid ? "var(--danger)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-sm)",
        outline: "none",
        resize: "vertical",
        transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
      {...rest}
    />
  );
}
