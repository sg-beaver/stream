import React from "react";

/** Modal dialog for confirmations and short forms. */
export interface DialogProps {
  /** Controls visibility. */
  open?: boolean;
  title?: React.ReactNode;
  /** Close handler (overlay click, × button). */
  onClose?: () => void;
  /** Footer action row (right-aligned). */
  footer?: React.ReactNode;
  /** Panel width in px. @default 460 */
  width?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare function Dialog(props: DialogProps): JSX.Element;
