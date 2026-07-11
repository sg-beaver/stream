import React from "react";

/**
 * StatusPill — domain status indicator for STREAM records. Maps known
 * work-study statuses to a tone + label; falls back to neutral.
 */
const MAP = {
  // 모집 공고
  open:      { tone: "success", label: "모집중" },
  closing:   { tone: "warning", label: "마감임박" },
  closed:    { tone: "neutral", label: "마감" },
  draft:     { tone: "neutral", label: "작성중" },
  // 제출 / 선발 상태
  submitted: { tone: "info",    label: "제출완료" },
  screening: { tone: "warning", label: "서류검토" },
  selected:  { tone: "success", label: "선발" },
  waitlist:  { tone: "warning", label: "예비번호" },
  rejected:  { tone: "danger",  label: "미선발" },
  // 출결
  present:   { tone: "success", label: "정상출근" },
  late:      { tone: "warning", label: "지각" },
  absent:    { tone: "danger",  label: "결근" },
  excused:   { tone: "info",    label: "승인결근" },
  // 대타 승인
  pending:   { tone: "warning", label: "승인대기" },
  approved:  { tone: "success", label: "승인" },
  declined:  { tone: "danger",  label: "반려" },
  covered:   { tone: "info",    label: "대체완료" },
  // 근무표
  conflict:  { tone: "danger",  label: "근무표 충돌" },
  confirmed: { tone: "success", label: "확정" },
};

export function StatusPill({ status = "draft", label, tone, style = {}, ...rest }) {
  const cfg = MAP[status] || { tone: "neutral", label: status };
  const tones = {
    neutral: { fg: "var(--neutral-600)", bg: "var(--neutral-100)", bd: "var(--neutral-200)" },
    success: { fg: "var(--success)", bg: "var(--success-50)", bd: "var(--success-100)" },
    warning: { fg: "var(--warning)", bg: "var(--warning-50)", bd: "var(--warning-100)" },
    danger:  { fg: "var(--danger)", bg: "var(--danger-50)", bd: "var(--danger-100)" },
    info:    { fg: "var(--info)", bg: "var(--info-50)", bd: "var(--info-100)" },
  };
  const t = tones[tone || cfg.tone] || tones.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 9px",
        fontSize: "var(--fs-caption)",
        fontWeight: "var(--fw-semibold)",
        lineHeight: 1,
        borderRadius: "var(--radius-pill)",
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.bd}`,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.fg, flex: "0 0 auto" }} />
      {label || cfg.label}
    </span>
  );
}
