import React from "react";

/** Radio button with label. Group by shared `name`. */
export function Radio({ label, checked, disabled = false, id, name, value, style = {}, ...rest }) {
  const auto = React.useId ? React.useId() : "rb";
  const rid = id || auto;
  return (
    <label
      htmlFor={rid}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: "var(--fs-body)",
        color: "var(--text-body)",
        ...style,
      }}
    >
      <input
        id={rid}
        type="radio"
        className="stream-control"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        style={{ width: 16, height: 16, margin: 0, accentColor: "var(--sogang-red)", cursor: disabled ? "not-allowed" : "pointer" }}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
