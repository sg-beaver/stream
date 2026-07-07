import React from "react";

/** Bordered SAINT action button (조회, 신고생성, 수정 …). */
export interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Small leading icon node. */
  icon?: React.ReactNode;
  /** @default "default" */
  tone?: "default" | "primary" | "ghost";
  children?: React.ReactNode;
}
export declare function ToolbarButton(props: ToolbarButtonProps): JSX.Element;

/** Horizontal action row, usually above a table. */
export interface ToolbarProps {
  /** @default "start" */
  align?: "start" | "end" | "between";
  /** Optional leading label. */
  label?: React.ReactNode;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Toolbar(props: ToolbarProps): JSX.Element;
