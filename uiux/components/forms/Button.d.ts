import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Primary institutional action control for STREAM (Sogang work-study ERP).
 * Use `primary` for the single main action per view; `secondary` for
 * supporting actions; `ghost` for low-emphasis inline actions; `danger`
 * for destructive confirmations.
 *
 * @startingPoint section="Forms" subtitle="Action buttons — primary, secondary, ghost, danger" viewport="700x160"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. @default "primary" */
  variant?: ButtonVariant;
  /** Control height. @default "md" */
  size?: ButtonSize;
  /** Stretch to full container width. @default false */
  block?: boolean;
  /** Icon node rendered before the label. */
  iconLeft?: React.ReactNode;
  /** Icon node rendered after the label. */
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

export declare function Button(props: ButtonProps): JSX.Element;
