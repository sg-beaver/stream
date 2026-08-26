import React from "react";

/** Checkbox with inline label. Uses Sogang red as the accent. */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Text label rendered beside the box. */
  label?: React.ReactNode;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;
