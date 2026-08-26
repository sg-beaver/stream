import React from "react";

/**
 * Icon — thin wrapper around the Lucide glyph set (the system's chosen
 * icon library). Requires the Lucide UMD script to be present on the page
 * (loaded via CDN in cards / kits). Renders an <svg> by cloning the named
 * Lucide icon; falls back to an empty inline box if Lucide isn't loaded yet.
 */
export function Icon({ name = "circle", size = 18, strokeWidth = 1.75, color = "currentColor", style = {}, ...rest }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !window.lucide) return;
    // Build fresh <i data-lucide> then let lucide replace it with an <svg>.
    el.innerHTML = "";
    const i = document.createElement("i");
    i.setAttribute("data-lucide", name);
    el.appendChild(i);
    try {
      window.lucide.createIcons({
        attrs: { width: size, height: size, "stroke-width": strokeWidth, stroke: color },
        nameAttr: "data-lucide",
      });
    } catch (e) { /* noop */ }
  }, [name, size, strokeWidth, color]);

  return (
    <span
      ref={ref}
      className="stream-icon"
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flex: "0 0 auto",
        lineHeight: 0,
        ...style,
      }}
      {...rest}
    />
  );
}
