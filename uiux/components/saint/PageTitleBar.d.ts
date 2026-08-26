import React from "react";

/** SAINT page header: title in a maroon-bordered box with optional right actions. */
export interface PageTitleBarProps {
  title: React.ReactNode;
  /** Right-aligned node (help link, small actions). */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function PageTitleBar(props: PageTitleBarProps): JSX.Element;
