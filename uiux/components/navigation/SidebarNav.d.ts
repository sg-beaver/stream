import React from "react";

export interface NavItem {
  id: string;
  label: React.ReactNode;
  /** Optional count chip (e.g. 미처리 요청 수). */
  badge?: React.ReactNode;
}
export interface NavSection {
  /** Optional group label (tan sub-header). */
  label?: React.ReactNode;
  items: NavItem[];
}

/**
 * SAINT left submenu: red module title + bordered box of red-bullet items.
 * @startingPoint section="Navigation" subtitle="SAINT module submenu (red-bullet list)" viewport="260x520"
 */
export interface SidebarNavProps {
  /** Red module title above the box (e.g. "STREAM"). */
  title?: React.ReactNode;
  /** Flat item list (use this OR sections). */
  items?: NavItem[];
  /** Grouped items. */
  sections?: NavSection[];
  /** Active item id. */
  active?: string;
  /** Selection handler. */
  onSelect?: (id: string) => void;
  /** Sidebar width. @default 232 */
  width?: number | string;
  /** Node under the menu box. */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function SidebarNav(props: SidebarNavProps): JSX.Element;
