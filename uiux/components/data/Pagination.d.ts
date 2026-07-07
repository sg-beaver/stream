import React from "react";

/** Page navigation for tables and lists. */
export interface PaginationProps {
  /** Current 1-based page. @default 1 */
  page?: number;
  /** Total pages. @default 1 */
  pageCount?: number;
  /** Called with the requested page number. */
  onChange?: (page: number) => void;
  style?: React.CSSProperties;
}

export declare function Pagination(props: PaginationProps): JSX.Element;
