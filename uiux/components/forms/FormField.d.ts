import React from "react";

/** Label + control wrapper with required mark, help text and error message. */
export interface FormFieldProps {
  /** Field label. */
  label?: React.ReactNode;
  /** Associates the label with a control id. */
  htmlFor?: string;
  /** Show a red required asterisk. @default false */
  required?: boolean;
  /** Muted help text below the control. */
  help?: React.ReactNode;
  /** Error message (overrides help, red). */
  error?: React.ReactNode;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare function FormField(props: FormFieldProps): JSX.Element;
