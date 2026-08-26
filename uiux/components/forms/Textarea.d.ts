import React from "react";

/** Multi-line text input. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Error styling. @default false */
  invalid?: boolean;
}

export declare function Textarea(props: TextareaProps): JSX.Element;
