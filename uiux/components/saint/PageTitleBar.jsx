import React from "react";

/**
 * PageTitleBar — the SAINT page header: the screen title inside a maroon-
 * bordered box, with optional right-aligned actions (e.g. a 도움말 link).
 */
export function PageTitleBar({ title, right, style = {} }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "13px 20px",
        border: "1.5px solid var(--saint-maroon)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-card)",
        ...style,
      }}
    >
      <h1 style={{ fontSize: "var(--fs-h2)", fontWeight: "var(--fw-extrabold)", color: "var(--neutral-900)", letterSpacing: "var(--ls-tight)" }}>{title}</h1>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>{right}</div>}
    </div>
  );
}
