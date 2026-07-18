import React from "react";

/**
 * Lucide icon wrapper — the STREAM design system's icon primitive.
 * Requires the Lucide UMD script on the page. `name` is any Lucide icon
 * id in kebab-case (e.g. "calendar-clock", "user-check").
 */
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon id, kebab-case. @default "circle" */
  name?: string;
  /** Pixel size (square). @default 18 */
  size?: number;
  /** Stroke width. @default 1.75 */
  strokeWidth?: number;
  /** Stroke color. @default "currentColor" */
  color?: string;
}

export declare function Icon(props: IconProps): JSX.Element;
