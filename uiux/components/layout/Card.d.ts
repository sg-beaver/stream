import React from "react";

/** Primary content container with optional header, footer, and body padding. */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Header title. */
  title?: React.ReactNode;
  /** Muted sub-title under the title. */
  subtitle?: React.ReactNode;
  /** Header action nodes (right-aligned). */
  actions?: React.ReactNode;
  /** Apply default body padding. @default true */
  padded?: boolean;
  /** Footer content (tinted bar). */
  footer?: React.ReactNode;
  headerStyle?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare function Card(props: CardProps): JSX.Element;
