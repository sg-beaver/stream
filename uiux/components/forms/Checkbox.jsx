import React from "react";

/** Checkbox with label. Controlled via `checked`/`onChange` or uncontrolled. */
export function Checkbox({ label, checked, disabled = false, id, style = {}, ...rest }) {
  const auto = React.useId ? React.useId() : "cb";
  const cid = id || auto;
  return (
    <label
      htmlFor={cid}
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
        id={cid}
        type="checkbox"
        className="stream-control"
        checked={checked}
        disabled={disabled}
        style={{
          width: 16,
          height: 16,
          margin: 0,
          accentColor: "var(--sogang-red)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
