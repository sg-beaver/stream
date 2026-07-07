import React from "react";

/**
 * Card — the primary content container. Optional header (title + actions)
 * and padded body. Institutional: 1px border, soft shadow, modest radius.
 */
export function Card({ title, subtitle, actions, padded = true, footer, style = {}, headerStyle = {}, bodyStyle = {}, children, ...rest }) {
  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-subtle)",
            ...headerStyle,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-bold)", color: "var(--text-strong)", lineHeight: 1.3 }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: padded ? "18px" : 0, ...bodyStyle }}>{children}</div>
      {footer && (
        <footer style={{ padding: "12px 18px", borderTop: "1px solid var(--border-subtle)", background: "var(--neutral-25)" }}>{footer}</footer>
      )}
    </section>
  );
}
