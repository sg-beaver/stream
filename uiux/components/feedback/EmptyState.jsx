import React from "react";

/**
 * EmptyState — placeholder for empty lists/views: icon, title, message,
 * and an optional primary action.
 */
export function EmptyState({ icon, title, message, action, style = {} }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "44px 24px", ...style }}>
      {icon && (
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "var(--radius-lg)", background: "var(--neutral-50)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", marginBottom: 14 }}>{icon}</div>
      )}
      {title && <h3 style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-bold)", color: "var(--text-strong)", marginBottom: 6 }}>{title}</h3>}
      {message && <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", maxWidth: 340, lineHeight: 1.55, marginBottom: action ? 16 : 0 }}>{message}</p>}
      {action}
    </div>
  );
}
