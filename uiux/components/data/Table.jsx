import React from "react";

/**
 * Table — SAINT data grid: beige (tan) header, full grid borders, tabular
 * numerals, hover + pale-yellow selected row. Column-config driven.
 * Supports single/multi row selection via a leading radio/checkbox column.
 *
 * @startingPoint section="Data" subtitle="SAINT institutional table (tan header, grid, row select)" viewport="700x320"
 */
export function Table({
  columns = [],
  data = [],
  rowKey = "id",
  onRowClick,
  select = null,            // null | "radio" | "checkbox"
  selectedKeys = [],
  onSelect,
  empty = "조회된 내역이 없습니다.",
  dense = false,
  style = {},
}) {
  const pad = dense ? "6px 10px" : "9px 12px";
  const th = {
    padding: pad,
    fontSize: "var(--fs-sm)",
    fontWeight: "var(--fw-bold)",
    color: "var(--neutral-800)",
    background: "var(--saint-tan)",
    borderRight: "1px solid var(--saint-grid)",
    borderBottom: "1px solid var(--saint-tan-strong)",
    borderTop: "2px solid var(--saint-tan-strong)",
    textAlign: "center",
    whiteSpace: "nowrap",
  };
  const td = {
    padding: pad,
    fontSize: "var(--fs-sm)",
    color: "var(--neutral-800)",
    borderRight: "1px solid var(--saint-grid)",
    borderBottom: "1px solid var(--saint-grid)",
    verticalAlign: "middle",
  };

  const isSel = (k) => selectedKeys.includes(k);
  const toggle = (k) => {
    if (!onSelect) return;
    if (select === "radio") onSelect([k]);
    else onSelect(isSel(k) ? selectedKeys.filter((x) => x !== k) : [...selectedKeys, k]);
  };
  const allKeys = data.map((r, i) => r[rowKey] ?? i);
  const allSel = allKeys.length > 0 && allKeys.every((k) => isSel(k));

  return (
    <div style={{ width: "100%", overflowX: "auto", border: "1px solid var(--saint-grid)", borderRadius: "var(--radius-xs)", ...style }} className="stream-scroll">
      <table className="stream-table" style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            {select && (
              <th style={{ ...th, width: 40 }}>
                {select === "checkbox" ? (
                  <input type="checkbox" checked={allSel} onChange={() => onSelect && onSelect(allSel ? [] : allKeys)} style={{ accentColor: "var(--sogang-red)", cursor: "pointer" }} />
                ) : null}
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} style={{ ...th, textAlign: c.headerAlign || "center", width: c.width }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (select ? 1 : 0)} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "26px 12px", borderRight: "none" }}>{empty}</td>
            </tr>
          ) : (
            data.map((row, i) => {
              const k = row[rowKey] ?? i;
              const selected = isSel(k);
              return (
                <tr
                  key={k}
                  data-selected={selected}
                  onClick={() => { if (select) toggle(k); if (onRowClick) onRowClick(row); }}
                  style={{ cursor: onRowClick || select ? "pointer" : "default" }}
                >
                  {select && (
                    <td style={{ ...td, textAlign: "center" }}>
                      <input
                        type={select === "radio" ? "radio" : "checkbox"}
                        checked={selected}
                        onChange={() => toggle(k)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: "var(--sogang-red)", cursor: "pointer" }}
                      />
                    </td>
                  )}
                  {columns.map((c, ci) => (
                    <td key={c.key} style={{ ...td, textAlign: c.align || "left", borderRight: ci === columns.length - 1 ? "none" : td.borderRight, color: c.strong ? "var(--neutral-900)" : td.color, fontWeight: c.strong ? "var(--fw-semibold)" : "var(--fw-regular)" }}>
                      {c.render ? c.render(row[c.key], row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
