import React from "react";

/** Square icon-only button for toolbars, table row actions, and headers. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** @default "ghost" */
  variant?: "ghost" | "outline";
  /** Accessible label (also the tooltip title). */
  label?: string;
  children?: React.ReactNode;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
