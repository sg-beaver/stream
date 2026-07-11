import React from "react";

/** Styled native select. Pass <option> children. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Error styling. @default false */
  invalid?: boolean;
  children?: React.ReactNode;
}

export declare function Select(props: SelectProps): JSX.Element;
