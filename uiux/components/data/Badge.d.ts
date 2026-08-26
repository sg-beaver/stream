import React from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

/** Small status/label chip. `soft` = tinted fill, `solid` = filled. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic color. @default "neutral" */
  tone?: BadgeTone;
  /** @default "soft" */
  variant?: "soft" | "solid";
  /** Leading status dot. @default false */
  dot?: boolean;
  children?: React.ReactNode;
}

export declare function Badge(props: BadgeProps): JSX.Element;
