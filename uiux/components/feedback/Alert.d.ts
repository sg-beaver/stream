import React from "react";

/** Inline banner for page/section messages. */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default "info" */
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  /** Bold title line. */
  title?: React.ReactNode;
  /** Leading icon node. */
  icon?: React.ReactNode;
  /** Show a dismiss (×) button; called on click. */
  onDismiss?: () => void;
  children?: React.ReactNode;
}

export declare function Alert(props: AlertProps): JSX.Element;
