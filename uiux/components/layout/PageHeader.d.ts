import React from "react";

/** Standard page title block: breadcrumb, H1, description, actions. */
export interface PageHeaderProps {
  title: React.ReactNode;
  /** Muted description below the title. */
  description?: React.ReactNode;
  /** Breadcrumb node rendered above the title. */
  breadcrumb?: React.ReactNode;
  /** Right-aligned action nodes. */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare function PageHeader(props: PageHeaderProps): JSX.Element;
