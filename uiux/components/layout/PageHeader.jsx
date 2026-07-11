import React from "react";

/**
 * PageHeader — standard view title block: breadcrumb slot, H1 title,
 * optional description and right-aligned actions.
 */
export function PageHeader({ title, description, breadcrumb, actions, style = {}, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, ...style }}>
      {breadcrumb}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "var(--fs-h1)", fontWeight: "var(--fw-extrabold)", color: "var(--text-strong)", letterSpacing: "var(--ls-tight)", lineHeight: 1.2 }}>{title}</h1>
          {description && <p style={{ fontSize: "var(--fs-body)", color: "var(--text-muted)", marginTop: 6, maxWidth: 620 }}>{description}</p>}
        </div>
        {actions && <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}
