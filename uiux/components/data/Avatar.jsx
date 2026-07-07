import React from "react";

/** Avatar — student/staff initials or photo. Institutional square-rounded. */
export function Avatar({ name = "", src, size = 34, shape = "rounded", style = {}, ...rest }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
  const radius = shape === "circle" ? "50%" : "var(--radius-sm)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--sogang-red-50)",
        color: "var(--sogang-red)",
        fontSize: Math.round(size * 0.38),
        fontWeight: "var(--fw-bold)",
        letterSpacing: "0.02em",
        border: "1px solid var(--sogang-red-100)",
        ...style,
      }}
      {...rest}
    >
      {src ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials
      )}
    </span>
  );
}
