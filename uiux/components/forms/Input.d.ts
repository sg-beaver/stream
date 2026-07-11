import React from "react";

/** Single-line text input. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Error styling. @default false */
  invalid?: boolean;
  /** Leading adornment (icon). */
  iconLeft?: React.ReactNode;
  /** Trailing adornment (icon). */
  iconRight?: React.ReactNode;
}

export declare function Input(props: InputProps): JSX.Element;
