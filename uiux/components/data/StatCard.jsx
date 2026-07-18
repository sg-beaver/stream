import React from "react";

/**
 * StatCard — KPI tile for the operations dashboard. Shows a label, big
 * value, optional delta and icon.
 */
export function StatCard({ label, value, unit, delta, deltaTone = "neutral", icon, style = {}, ...rest }) {
  const tones = { up: "var(--success)", down: "var(--danger)", neutral: "var(--text-muted)" };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "16px 18px",
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-xs)",
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: "var(--fs-caption)", fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-wide)", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
        {icon && <span style={{ color: "var(--sogang-red)", display: "inline-flex" }}>{icon}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: "28px", fontWeight: "var(--fw-bold)", color: "var(--text-strong)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>{unit}</span>}
      </div>
      {delta != null && (
        <span style={{ fontSize: "var(--fs-caption)", fontWeight: "var(--fw-medium)", color: tones[deltaTone] }}>{delta}</span>
      )}
    </div>
  );
}
