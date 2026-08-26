import React from "react";

/** Placeholder for empty lists/views. */
export interface EmptyStateProps {
  /** Icon node (centered in a tile). */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** Optional primary action node. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;
