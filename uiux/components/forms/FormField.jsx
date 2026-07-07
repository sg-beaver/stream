import React from "react";

/**
 * FormField — label + control wrapper with optional required mark,
 * help text, and error message. Wrap any input primitive.
 */
export function FormField({ label, htmlFor, required = false, help, error, style = {}, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)" }}
        >
          {label}
          {required && <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span style={{ fontSize: "var(--fs-caption)", color: "var(--danger)" }}>{error}</span>
      ) : help ? (
        <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>{help}</span>
      ) : null}
    </div>
  );
}
