import React from "react";

/** SAINT collapsible content block: chevron + title header over a bordered body. */
export interface SectionPanelProps {
  title: React.ReactNode;
  /** Right-aligned header actions (buttons, links). */
  right?: React.ReactNode;
  /** Start expanded. @default true */
  defaultOpen?: boolean;
  /** Allow collapse via the header. @default true */
  collapsible?: boolean;
  /** Apply default body padding. @default true */
  padded?: boolean;
  bodyStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare function SectionPanel(props: SectionPanelProps): JSX.Element;
