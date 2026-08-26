import React from "react";

/**
 * Tabs — underline tab bar for switching views within a page.
 * `tabs`: [{ id, label, badge }]. Controlled via `active` + `onChange`.
 */
export function Tabs({ tabs = [], active, onChange, style = {} }) {
  return (
    <div role="tablist" style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid var(--border-default)", ...style }}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            className="stream-tab"
            onClick={() => onChange && onChange(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 14px",
              marginBottom: -1,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body)",
              fontWeight: isActive ? "var(--fw-semibold)" : "var(--fw-medium)",
              color: isActive ? "var(--text-brand)" : "var(--text-muted)",
              borderBottom: `2px solid ${isActive ? "var(--sogang-red)" : "transparent"}`,
              transition: "color var(--dur-fast) var(--ease-standard)",
            }}
          >
            {t.label}
            {t.badge != null && (
              <span style={{ fontSize: "var(--fs-micro)", fontWeight: "var(--fw-bold)", background: isActive ? "var(--sogang-red-50)" : "var(--neutral-100)", color: isActive ? "var(--sogang-red)" : "var(--text-muted)", borderRadius: "var(--radius-pill)", padding: "1px 7px", fontVariantNumeric: "tabular-nums" }}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
