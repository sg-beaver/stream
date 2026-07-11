import React from "react";

/** Pagination — page navigation for tables/lists. */
export function Pagination({ page = 1, pageCount = 1, onChange, style = {} }) {
  const go = (p) => { if (p >= 1 && p <= pageCount && p !== page && onChange) onChange(p); };
  const pages = [];
  const add = (p) => pages.push(p);
  if (pageCount <= 7) {
    for (let i = 1; i <= pageCount; i++) add(i);
  } else {
    add(1);
    if (page > 3) add("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) add(i);
    if (page < pageCount - 2) add("…");
    add(pageCount);
  }
  const btn = (active) => ({
    minWidth: 32,
    height: 32,
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "var(--fs-sm)",
    fontWeight: active ? "var(--fw-semibold)" : "var(--fw-regular)",
    fontVariantNumeric: "tabular-nums",
    color: active ? "#fff" : "var(--text-body)",
    background: active ? "var(--sogang-red)" : "var(--surface-card)",
    border: `1px solid ${active ? "var(--sogang-red)" : "var(--border-default)"}`,
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
      <button className="stream-page-btn" style={btn(false)} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous">‹</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ minWidth: 20, textAlign: "center", color: "var(--text-subtle)" }}>…</span>
        ) : (
          <button key={p} className="stream-page-btn" style={btn(p === page)} onClick={() => go(p)}>{p}</button>
        )
      )}
      <button className="stream-page-btn" style={btn(false)} disabled={page >= pageCount} onClick={() => go(page + 1)} aria-label="Next">›</button>
    </div>
  );
}
