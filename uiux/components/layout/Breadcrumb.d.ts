import React from "react";

export interface BreadcrumbItem { label: React.ReactNode; href?: string; }

/** Hierarchical location trail. The last item renders as current (non-link). */
export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  style?: React.CSSProperties;
}

export declare function Breadcrumb(props: BreadcrumbProps): JSX.Element;
