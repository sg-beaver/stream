import React from "react";

/** Toggle switch for binary settings (e.g. availability, notifications). */
export function Switch({ checked = false, onChange, disabled = false, label, id, style = {}, ...rest }) {
  const auto = React.useId ? React.useId() : "sw";
  const sid = id || auto;
  return (
    <label
      htmlFor={sid}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: "var(--fs-body)",
        color: "var(--text-body)",
        ...style,
      }}
    >
      <span
        style={{
          position: "relative",
          display: "inline-block",
          width: 38,
          height: 22,
          flex: "0 0 auto",
          background: checked ? "var(--sogang-red)" : "var(--neutral-300)",
          borderRadius: "var(--radius-pill)",
          transition: "background var(--dur-normal) var(--ease-standard)",
        }}
      >
        <input
          id={sid}
          type="checkbox"
          className="stream-control"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          style={{ position: "absolute", inset: 0, opacity: 0, margin: 0, cursor: disabled ? "not-allowed" : "pointer" }}
          {...rest}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 18,
            height: 18,
            background: "#fff",
            borderRadius: "50%",
            boxShadow: "var(--shadow-sm)",
            transition: "left var(--dur-normal) var(--ease-standard)",
          }}
        />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
