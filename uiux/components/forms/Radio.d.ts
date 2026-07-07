import React from "react";

/** Radio button with inline label. Group options by shared `name`. */
export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Text label rendered beside the control. */
  label?: React.ReactNode;
}

export declare function Radio(props: RadioProps): JSX.Element;
