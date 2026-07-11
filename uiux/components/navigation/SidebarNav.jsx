import React from "react";

/**
 * SidebarNav — SAINT left menu. A red module title over a bordered box of
 * menu items, each with a small red square bullet; the active item is red.
 * Accepts either flat `items` or grouped `sections` (title optional).
 */
export function SidebarNav({ title, items, sections, active, onSelect, width = 232, footer, style = {} }) {
  const groups = sections || (items ? [{ items }] : []);

  const Item = ({ it }) => {
    const isActive = it.id === active;
    return (
      <button
        type="button"
        className="stream-navitem"
        data-active={isActive}
        onClick={() => onSelect && onSelect(it.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "9px 12px",
          border: "none",
          borderBottom: "1px solid var(--neutral-100)",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body)",
          fontWeight: isActive ? "var(--fw-bold)" : "var(--fw-medium)",
          color: isActive ? "var(--sogang-red)" : "var(--neutral-800)",
          textAlign: "left",
        }}
      >
        <span aria-hidden="true" style={{ width: 7, height: 7, flex: "0 0 auto", background: isActive ? "var(--sogang-red)" : "var(--sogang-red)", opacity: isActive ? 1 : 0.85 }} />
        <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
        {it.badge != null && (
          <span className="stream-tabular" style={{ fontSize: "var(--fs-micro)", fontWeight: "var(--fw-bold)", color: "#fff", background: "var(--sogang-red)", borderRadius: "var(--radius-pill)", padding: "1px 6px", minWidth: 16, textAlign: "center" }}>{it.badge}</span>
        )}
      </button>
    );
  };

  return (
    <aside
      style={{
        width,
        flex: `0 0 ${typeof width === "number" ? width + "px" : width}`,
        padding: "18px 14px",
        background: "var(--surface-page)",
        borderRight: "1px solid var(--border-subtle)",
        ...style,
      }}
    >
      {title && (
        <h2 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-extrabold)", color: "var(--sogang-red)", padding: "0 4px 14px" }}>{title}</h2>
      )}
      <nav style={{ border: "1px solid var(--saint-panel-border)", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", overflow: "hidden" }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <div style={{ padding: "8px 12px", fontSize: "var(--fs-caption)", fontWeight: "var(--fw-bold)", color: "var(--neutral-600)", background: "var(--saint-tan-soft)", borderBottom: "1px solid var(--saint-panel-border)" }}>{g.label}</div>
            )}
            {g.items.map((it) => <Item key={it.id} it={it} />)}
          </div>
        ))}
      </nav>
      {footer && <div style={{ padding: "14px 4px 0" }}>{footer}</div>}
    </aside>
  );
}
