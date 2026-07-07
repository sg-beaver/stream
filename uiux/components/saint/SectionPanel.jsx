import React from "react";

/**
 * SectionPanel — the SAINT collapsible content block: a header row with a
 * chevron + title (optional right actions), and a bordered body. Grouping
 * primitive for forms, tables, and search areas inside a screen.
 */
export function SectionPanel({ title, right, defaultOpen = true, collapsible = true, padded = true, bodyStyle = {}, style = {}, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section style={{ border: "1px solid var(--saint-panel-border)", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", overflow: "hidden", ...style }}>
      <header
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          background: "var(--saint-tan-soft)",
          borderBottom: open ? "1px solid var(--saint-panel-border)" : "none",
          cursor: collapsible ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {collapsible && (
            <span aria-hidden="true" style={{ color: "var(--saint-maroon)", fontSize: 11, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform var(--dur-fast) var(--ease-standard)" }}>▼</span>
          )}
          <h3 style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-bold)", color: "var(--neutral-900)" }}>{title}</h3>
        </div>
        {right && <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>{right}</div>}
      </header>
      {open && <div style={{ padding: padded ? "16px 18px" : 0, ...bodyStyle }}>{children}</div>}
    </section>
  );
}
