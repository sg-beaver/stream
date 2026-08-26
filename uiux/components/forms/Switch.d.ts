import React from "react";

/** Toggle switch for binary settings. Controlled via `checked` + `onChange`. */
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  checked?: boolean;
  /** Optional trailing label. */
  label?: React.ReactNode;
}

export declare function Switch(props: SwitchProps): JSX.Element;
