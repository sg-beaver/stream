import React from "react";

/** Student/staff avatar — photo or auto initials from `name`. */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name; initials are derived when no `src`. */
  name?: string;
  /** Photo URL. */
  src?: string;
  /** Pixel size (square). @default 34 */
  size?: number;
  /** @default "rounded" */
  shape?: "rounded" | "circle";
}

export declare function Avatar(props: AvatarProps): JSX.Element;
