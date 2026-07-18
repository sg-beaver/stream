import React from "react";

/** SAINT label:value form pair. Set `readOnly` to render children as a grey display box. */
export interface FieldProps {
  label: React.ReactNode;
  /** Show a red required mark. @default false */
  required?: boolean;
  /** Label column width in px. @default 84 */
  labelWidth?: number;
  /** Render children as a read-only grey field. @default false */
  readOnly?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Field(props: FieldProps): JSX.Element;

/** Fixed-column grid for laying out Fields (SAINT form). */
export interface FieldGridProps {
  /** Column count. @default 3 */
  columns?: number;
  gap?: number;
  rowGap?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function FieldGrid(props: FieldGridProps): JSX.Element;
