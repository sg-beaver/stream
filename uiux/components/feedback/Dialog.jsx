import React from "react";

/**
 * Dialog — modal for confirmations and short forms. Renders an overlay +
 * centered panel when `open`. Header (title), body (children), footer slot.
 */
export function Dialog({ open, title, onClose, footer, width = 460, style = {}, children }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(22, 24, 28, 0.44)",
        backdropFilter: "blur(1px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          ...style,
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", color: "var(--text-strong)" }}>{title}</h3>
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="stream-iconbtn" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", width: 30, height: 30, borderRadius: "var(--radius-sm)", fontSize: 20, lineHeight: 1 }}>×</button>
          )}
        </header>
        <div className="stream-scroll" style={{ padding: "18px 20px", overflowY: "auto", fontSize: "var(--fs-body)", color: "var(--text-body)", lineHeight: 1.6 }}>{children}</div>
        {footer && (
          <footer style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border-subtle)", background: "var(--neutral-25)" }}>{footer}</footer>
        )}
      </div>
    </div>
  );
}
