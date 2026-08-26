import React from "react";

export interface TabItem { id: string; label: React.ReactNode; badge?: React.ReactNode; }

/** Underline tab bar for in-page view switching. */
export interface TabsProps {
  tabs: TabItem[];
  /** Active tab id. */
  active?: string;
  /** Change handler. */
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

export declare function Tabs(props: TabsProps): JSX.Element;
