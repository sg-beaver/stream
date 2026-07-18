import React from "react";

/** Breadcrumb — hierarchical location trail. `items`: [{label, href}]. */
export function Breadcrumb({ items = [], style = {} }) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: "var(--fs-caption)", ...style }}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {last ? (
              <span style={{ color: "var(--text-body)", fontWeight: "var(--fw-semibold)" }}>{it.label}</span>
            ) : (
              <a href={it.href || "#"} style={{ color: "var(--text-muted)", textDecoration: "none" }}>{it.label}</a>
            )}
            {!last && <span aria-hidden="true" style={{ color: "var(--text-subtle)" }}>/</span>}
          </span>
        );
      })}
    </nav>
  );
}
