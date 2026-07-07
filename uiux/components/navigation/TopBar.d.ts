import React from "react";

export interface GlobalNavItem { id: string; label: React.ReactNode; }

/**
 * SAINT global header — white chrome with a utility strip, brand + horizontal
 * global navigation, and Sogang-red rules top and bottom.
 */
export interface TopBarProps {
  /** Sogang logo node (img). */
  logo?: React.ReactNode;
  /** Brand wordmark text (Sogang display font). @default "STREAM" */
  brandText?: string;
  /** Horizontal global-nav items (인사, 예산 … STREAM). */
  nav?: GlobalNavItem[];
  /** Active nav id. */
  activeNav?: string;
  /** Nav click handler. */
  onNav?: (id: string) => void;
  /** Right-aligned utility strip content (date, welcome, account links). */
  utility?: React.ReactNode;
  /** Reserved: current user node. */
  user?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function TopBar(props: TopBarProps): JSX.Element;
