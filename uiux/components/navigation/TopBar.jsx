import React from "react";

/**
 * TopBar — SAINT global header. White, institutional: a thin utility strip
 * (date · welcome · account links) over the brand + horizontal global-nav row,
 * closed by a Sogang-red rule. Matches the live SAINT ERP portal chrome.
 */
export function TopBar({ logo, brandText = "STREAM", nav = [], activeNav, onNav, utility, user, style = {} }) {
  return (
    <header style={{ background: "var(--surface-header)", borderTop: "3px solid var(--sogang-red)", borderBottom: "2px solid var(--sogang-red)", ...style }}>
      {/* utility strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, height: 30, padding: "0 22px", fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
        {utility}
      </div>
      {/* brand + nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "0 22px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
          {logo}
          {brandText && (
            <span style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "0.04em", color: "var(--sogang-red)", lineHeight: 1 }}>{brandText}</span>
          )}
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {nav.map((n) => {
            const isActive = n.id === activeNav;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onNav && onNav(n.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontSize: 17,
                  fontWeight: isActive ? "var(--fw-extrabold)" : "var(--fw-bold)",
                  color: isActive ? "var(--sogang-red)" : "var(--neutral-800)",
                  padding: "4px 14px",
                  whiteSpace: "nowrap",
                }}
              >
                {n.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
