import React from "react";

export interface TableColumn {
  /** Unique key; also the row-data accessor. */
  key: string;
  /** Header label. */
  header: React.ReactNode;
  /** Cell alignment. @default "left" */
  align?: "left" | "center" | "right";
  /** Header cell alignment. @default "center" */
  headerAlign?: "left" | "center" | "right";
  /** Fixed column width (CSS value). */
  width?: string | number;
  /** Render strong (emphasized) cell text. */
  strong?: boolean;
  /** Custom cell renderer: (value, row) => node. */
  render?: (value: any, row: any) => React.ReactNode;
}

/**
 * SAINT data grid (tan header, grid borders, row selection).
 * @startingPoint section="Data" subtitle="SAINT institutional table (tan header, grid, row select)" viewport="700x320"
 */
export interface TableProps {
  columns: TableColumn[];
  data: any[];
  /** Row identity field. @default "id" */
  rowKey?: string;
  /** Row click handler. */
  onRowClick?: (row: any) => void;
  /** Leading select column type. @default null */
  select?: null | "radio" | "checkbox";
  /** Selected row keys (controlled). */
  selectedKeys?: (string | number)[];
  /** Selection change handler: (keys) => void. */
  onSelect?: (keys: (string | number)[]) => void;
  /** Empty-state message. */
  empty?: React.ReactNode;
  /** Compact row padding. @default false */
  dense?: boolean;
  style?: React.CSSProperties;
}

export declare function Table(props: TableProps): JSX.Element;
