import React from "react";

/** KPI tile for the operations dashboard. */
export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase metric label. */
  label?: React.ReactNode;
  /** Primary value. */
  value?: React.ReactNode;
  /** Trailing unit (e.g. "hrs", "%"). */
  unit?: React.ReactNode;
  /** Delta / trend text below the value. */
  delta?: React.ReactNode;
  /** @default "neutral" */
  deltaTone?: "up" | "down" | "neutral";
  /** Icon node (top-right, Sogang red). */
  icon?: React.ReactNode;
}

export declare function StatCard(props: StatCardProps): JSX.Element;
