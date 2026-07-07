import React from "react";

/**
 * Field — a SAINT label:value form pair. Label sits to the left; children is
 * any control or, for read-only display, a plain value styled via `readOnly`.
 */
export function Field({ label, required = false, labelWidth = 84, readOnly = false, children, style = {} }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
      <label style={{ flex: `0 0 ${labelWidth}px`, textAlign: "right", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--neutral-700)", whiteSpace: "nowrap" }}>
        {label}
        {required && <span style={{ color: "var(--sogang-red)", marginLeft: 2 }}>*</span>}
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>
        {readOnly ? (
          <div style={{ height: 34, display: "flex", alignItems: "center", padding: "0 10px", fontSize: "var(--fs-sm)", color: "var(--neutral-800)", background: "var(--saint-readonly)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
        ) : children}
      </div>
    </div>
  );
}

/** FieldGrid — arranges Fields in a fixed-column grid (SAINT form layout). */
export function FieldGrid({ columns = 3, gap = 12, rowGap = 14, style = {}, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: gap, rowGap, ...style }}>
      {children}
    </div>
  );
}
