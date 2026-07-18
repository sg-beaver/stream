import React from "react";

/**
 * Domain status indicator for STREAM records. Known `status` values map to
 * a tone + label automatically; override `label`/`tone` for custom states.
 *
 * Known statuses (Korean labels): open 모집중, closing 마감임박, closed 마감,
 * draft 작성중, submitted 제출완료, screening 서류검토, selected 선발,
 * waitlist 예비번호, rejected 미선발, present 정상출근, late 지각, absent 결근,
 * excused 승인결근, pending 승인대기, approved 승인, declined 반려,
 * covered 대체완료, conflict 근무표 충돌, confirmed 확정.
 */
export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Work-study status key. @default "draft" */
  status?: string;
  /** Override the displayed label. */
  label?: string;
  /** Override the tone. */
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export declare function StatusPill(props: StatusPillProps): JSX.Element;
