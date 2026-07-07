/* @ds-bundle: {"format":4,"namespace":"STREAMDesignSystem_b095d7","components":[{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"Pagination","sourcePath":"components/data/Pagination.jsx"},{"name":"StatCard","sourcePath":"components/data/StatCard.jsx"},{"name":"StatusPill","sourcePath":"components/data/StatusPill.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"FormField","sourcePath":"components/forms/FormField.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Icon","sourcePath":"components/foundation/Icon.jsx"},{"name":"Breadcrumb","sourcePath":"components/layout/Breadcrumb.jsx"},{"name":"Card","sourcePath":"components/layout/Card.jsx"},{"name":"PageHeader","sourcePath":"components/layout/PageHeader.jsx"},{"name":"SidebarNav","sourcePath":"components/navigation/SidebarNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"},{"name":"Field","sourcePath":"components/saint/Field.jsx"},{"name":"FieldGrid","sourcePath":"components/saint/Field.jsx"},{"name":"PageTitleBar","sourcePath":"components/saint/PageTitleBar.jsx"},{"name":"SectionPanel","sourcePath":"components/saint/SectionPanel.jsx"},{"name":"ToolbarButton","sourcePath":"components/saint/Toolbar.jsx"},{"name":"Toolbar","sourcePath":"components/saint/Toolbar.jsx"}],"sourceHashes":{"components/data/Avatar.jsx":"2c8e1bcc3303","components/data/Badge.jsx":"6168f1008433","components/data/Pagination.jsx":"d441581a7688","components/data/StatCard.jsx":"2ebb29b5a997","components/data/StatusPill.jsx":"d8b5ecdf0344","components/data/Table.jsx":"b4f0e9db0dd3","components/feedback/Alert.jsx":"312b2bf126a8","components/feedback/Dialog.jsx":"60ebb3d66d26","components/feedback/EmptyState.jsx":"4d48adcb4c3d","components/forms/Button.jsx":"c9a36a9032eb","components/forms/Checkbox.jsx":"aae3d52773b9","components/forms/FormField.jsx":"d3eff8eb2ef0","components/forms/IconButton.jsx":"f8f7d14e7f76","components/forms/Input.jsx":"c2ac988c2bdc","components/forms/Radio.jsx":"44f06c2bd19b","components/forms/Select.jsx":"2da130ece63f","components/forms/Switch.jsx":"12aa9467c7be","components/forms/Textarea.jsx":"ea82a9f17d0b","components/foundation/Icon.jsx":"49721a1317b9","components/layout/Breadcrumb.jsx":"30a0bc23dc98","components/layout/Card.jsx":"d89b5464d78f","components/layout/PageHeader.jsx":"a9ec4724256b","components/navigation/SidebarNav.jsx":"6373902ca892","components/navigation/Tabs.jsx":"4473f29f735a","components/navigation/TopBar.jsx":"98d2742fee7f","components/saint/Field.jsx":"d319b33a717f","components/saint/PageTitleBar.jsx":"5cc7b34f8d2c","components/saint/SectionPanel.jsx":"46b308f190af","components/saint/Toolbar.jsx":"e5cacee8d213","ui_kits/admin/AdminShell.jsx":"a5146c0fa2cb","ui_kits/admin/DashboardModule.jsx":"6b2e4d240e17","ui_kits/admin/PostsAdminScreen.jsx":"4c27077d6f91","ui_kits/admin/PostsModule.jsx":"029da9342e9d","ui_kits/admin/ScheduleAdminScreen.jsx":"adea5cdcbc29","ui_kits/admin/ScheduleModule.jsx":"0dab57b2afbd","ui_kits/admin/SelectionModule.jsx":"87bac42c0509","ui_kits/admin/SelectionScreen.jsx":"ac77611b652b","ui_kits/admin/StudentsModule.jsx":"8e11589a0645","ui_kits/admin/StudentsScreen.jsx":"961af6cbeaa9","ui_kits/admin/SubstituteModule.jsx":"2c16527e0d5f","ui_kits/admin/admin-data.js":"f05eabe6202a","ui_kits/student/ApplicationDetailScreen.jsx":"765c22321363","ui_kits/student/ApplicationFormScreen.jsx":"49ae0539d25a","ui_kits/student/ApplicationsScreen.jsx":"17e4fbbaba18","ui_kits/student/AttendanceScreen.jsx":"56f8541141c2","ui_kits/student/MyApplicationsScreen.jsx":"d028ef1477a2","ui_kits/student/OtherScreens.jsx":"e2c4242ca94b","ui_kits/student/PostDetailScreen.jsx":"11ba54423160","ui_kits/student/PostListScreen.jsx":"3c46ed3c826f","ui_kits/student/PostsScreen.jsx":"812e9603125e","ui_kits/student/ScheduleScreen.jsx":"e3bb7e9e3e67","ui_kits/student/Shell.jsx":"ca51f868649e","ui_kits/student/SubstitutionScreen.jsx":"bc297aaa0b11","ui_kits/student/data.js":"f12952287eec","ui_kits/student/student-data.js":"d85894e03f5b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.STREAMDesignSystem_b095d7 = window.STREAMDesignSystem_b095d7 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Avatar — student/staff initials or photo. Institutional square-rounded. */
function Avatar({
  name = "",
  src,
  size = 34,
  shape = "rounded",
  style = {},
  ...rest
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  const radius = shape === "circle" ? "50%" : "var(--radius-sm)";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      flex: "0 0 auto",
      borderRadius: radius,
      overflow: "hidden",
      background: "var(--sogang-red-50)",
      color: "var(--sogang-red)",
      fontSize: Math.round(size * 0.38),
      fontWeight: "var(--fw-bold)",
      letterSpacing: "0.02em",
      border: "1px solid var(--sogang-red-100)",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small status/label chip. Tones map to semantic colors.
 * Use `soft` (default, tinted fill) or `solid`.
 */
function Badge({
  tone = "neutral",
  variant = "soft",
  dot = false,
  style = {},
  children,
  ...rest
}) {
  const tones = {
    neutral: {
      fg: "var(--neutral-700)",
      soft: "var(--neutral-100)",
      solid: "var(--neutral-700)",
      border: "var(--neutral-200)"
    },
    brand: {
      fg: "var(--sogang-red)",
      soft: "var(--sogang-red-50)",
      solid: "var(--sogang-red)",
      border: "var(--sogang-red-100)"
    },
    success: {
      fg: "var(--success)",
      soft: "var(--success-50)",
      solid: "var(--success)",
      border: "var(--success-100)"
    },
    warning: {
      fg: "var(--warning)",
      soft: "var(--warning-50)",
      solid: "var(--warning)",
      border: "var(--warning-100)"
    },
    danger: {
      fg: "var(--danger)",
      soft: "var(--danger-50)",
      solid: "var(--danger)",
      border: "var(--danger-100)"
    },
    info: {
      fg: "var(--info)",
      soft: "var(--info-50)",
      solid: "var(--info)",
      border: "var(--info-100)"
    }
  };
  const t = tones[tone] || tones.neutral;
  const solid = variant === "solid";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      height: 21,
      padding: "0 8px",
      fontSize: "var(--fs-micro)",
      fontWeight: "var(--fw-semibold)",
      letterSpacing: "var(--ls-wide)",
      lineHeight: 1,
      borderRadius: "var(--radius-sm)",
      color: solid ? "#fff" : t.fg,
      background: solid ? t.solid : t.soft,
      border: `1px solid ${solid ? "transparent" : t.border}`,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: solid ? "#fff" : t.fg
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/Pagination.jsx
try { (() => {
/** Pagination — page navigation for tables/lists. */
function Pagination({
  page = 1,
  pageCount = 1,
  onChange,
  style = {}
}) {
  const go = p => {
    if (p >= 1 && p <= pageCount && p !== page && onChange) onChange(p);
  };
  const pages = [];
  const add = p => pages.push(p);
  if (pageCount <= 7) {
    for (let i = 1; i <= pageCount; i++) add(i);
  } else {
    add(1);
    if (page > 3) add("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) add(i);
    if (page < pageCount - 2) add("…");
    add(pageCount);
  }
  const btn = active => ({
    minWidth: 32,
    height: 32,
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "var(--fs-sm)",
    fontWeight: active ? "var(--fw-semibold)" : "var(--fw-regular)",
    fontVariantNumeric: "tabular-nums",
    color: active ? "#fff" : "var(--text-body)",
    background: active ? "var(--sogang-red)" : "var(--surface-card)",
    border: `1px solid ${active ? "var(--sogang-red)" : "var(--border-default)"}`,
    borderRadius: "var(--radius-sm)",
    cursor: "pointer"
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "stream-page-btn",
    style: btn(false),
    disabled: page <= 1,
    onClick: () => go(page - 1),
    "aria-label": "Previous"
  }, "\u2039"), pages.map((p, i) => p === "…" ? /*#__PURE__*/React.createElement("span", {
    key: `e${i}`,
    style: {
      minWidth: 20,
      textAlign: "center",
      color: "var(--text-subtle)"
    }
  }, "\u2026") : /*#__PURE__*/React.createElement("button", {
    key: p,
    className: "stream-page-btn",
    style: btn(p === page),
    onClick: () => go(p)
  }, p)), /*#__PURE__*/React.createElement("button", {
    className: "stream-page-btn",
    style: btn(false),
    disabled: page >= pageCount,
    onClick: () => go(page + 1),
    "aria-label": "Next"
  }, "\u203A"));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/data/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatCard — KPI tile for the operations dashboard. Shows a label, big
 * value, optional delta and icon.
 */
function StatCard({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  icon,
  style = {},
  ...rest
}) {
  const tones = {
    up: "var(--success)",
    down: "var(--danger)",
    neutral: "var(--text-muted)"
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: "16px 18px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-xs)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-caption)",
      fontWeight: "var(--fw-semibold)",
      letterSpacing: "var(--ls-wide)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--sogang-red)",
      display: "inline-flex"
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "28px",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-strong)",
      lineHeight: 1,
      fontVariantNumeric: "tabular-nums"
    }
  }, value), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-sm)",
      color: "var(--text-muted)",
      fontWeight: "var(--fw-medium)"
    }
  }, unit)), delta != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-caption)",
      fontWeight: "var(--fw-medium)",
      color: tones[deltaTone]
    }
  }, delta));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/data/StatusPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusPill — domain status indicator for STREAM records. Maps known
 * work-study statuses to a tone + label; falls back to neutral.
 */
const MAP = {
  // 모집 공고
  open: {
    tone: "success",
    label: "모집중"
  },
  closing: {
    tone: "warning",
    label: "마감임박"
  },
  closed: {
    tone: "neutral",
    label: "마감"
  },
  draft: {
    tone: "neutral",
    label: "작성중"
  },
  // 제출 / 선발 상태
  submitted: {
    tone: "info",
    label: "제출완료"
  },
  screening: {
    tone: "warning",
    label: "서류검토"
  },
  selected: {
    tone: "success",
    label: "선발"
  },
  waitlist: {
    tone: "warning",
    label: "예비번호"
  },
  rejected: {
    tone: "danger",
    label: "미선발"
  },
  // 출결
  present: {
    tone: "success",
    label: "정상출근"
  },
  late: {
    tone: "warning",
    label: "지각"
  },
  absent: {
    tone: "danger",
    label: "결근"
  },
  excused: {
    tone: "info",
    label: "승인결근"
  },
  // 대타 승인
  pending: {
    tone: "warning",
    label: "승인대기"
  },
  approved: {
    tone: "success",
    label: "승인"
  },
  declined: {
    tone: "danger",
    label: "반려"
  },
  covered: {
    tone: "info",
    label: "대체완료"
  },
  // 근무표
  conflict: {
    tone: "danger",
    label: "근무표 충돌"
  },
  confirmed: {
    tone: "success",
    label: "확정"
  }
};
function StatusPill({
  status = "draft",
  label,
  tone,
  style = {},
  ...rest
}) {
  const cfg = MAP[status] || {
    tone: "neutral",
    label: status
  };
  const tones = {
    neutral: {
      fg: "var(--neutral-600)",
      bg: "var(--neutral-100)",
      bd: "var(--neutral-200)"
    },
    success: {
      fg: "var(--success)",
      bg: "var(--success-50)",
      bd: "var(--success-100)"
    },
    warning: {
      fg: "var(--warning)",
      bg: "var(--warning-50)",
      bd: "var(--warning-100)"
    },
    danger: {
      fg: "var(--danger)",
      bg: "var(--danger-50)",
      bd: "var(--danger-100)"
    },
    info: {
      fg: "var(--info)",
      bg: "var(--info-50)",
      bd: "var(--info-100)"
    }
  };
  const t = tones[tone || cfg.tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
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
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: t.fg,
      flex: "0 0 auto"
    }
  }), label || cfg.label);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
/**
 * Table — SAINT data grid: beige (tan) header, full grid borders, tabular
 * numerals, hover + pale-yellow selected row. Column-config driven.
 * Supports single/multi row selection via a leading radio/checkbox column.
 *
 * @startingPoint section="Data" subtitle="SAINT institutional table (tan header, grid, row select)" viewport="700x320"
 */
function Table({
  columns = [],
  data = [],
  rowKey = "id",
  onRowClick,
  select = null,
  // null | "radio" | "checkbox"
  selectedKeys = [],
  onSelect,
  empty = "조회된 내역이 없습니다.",
  dense = false,
  style = {}
}) {
  const pad = dense ? "6px 10px" : "9px 12px";
  const th = {
    padding: pad,
    fontSize: "var(--fs-sm)",
    fontWeight: "var(--fw-bold)",
    color: "var(--neutral-800)",
    background: "var(--saint-tan)",
    borderRight: "1px solid var(--saint-grid)",
    borderBottom: "1px solid var(--saint-tan-strong)",
    borderTop: "2px solid var(--saint-tan-strong)",
    textAlign: "center",
    whiteSpace: "nowrap"
  };
  const td = {
    padding: pad,
    fontSize: "var(--fs-sm)",
    color: "var(--neutral-800)",
    borderRight: "1px solid var(--saint-grid)",
    borderBottom: "1px solid var(--saint-grid)",
    verticalAlign: "middle"
  };
  const isSel = k => selectedKeys.includes(k);
  const toggle = k => {
    if (!onSelect) return;
    if (select === "radio") onSelect([k]);else onSelect(isSel(k) ? selectedKeys.filter(x => x !== k) : [...selectedKeys, k]);
  };
  const allKeys = data.map((r, i) => r[rowKey] ?? i);
  const allSel = allKeys.length > 0 && allKeys.every(k => isSel(k));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      overflowX: "auto",
      border: "1px solid var(--saint-grid)",
      borderRadius: "var(--radius-xs)",
      ...style
    },
    className: "stream-scroll"
  }, /*#__PURE__*/React.createElement("table", {
    className: "stream-table",
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontVariantNumeric: "tabular-nums"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, select && /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      width: 40
    }
  }, select === "checkbox" ? /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: allSel,
    onChange: () => onSelect && onSelect(allSel ? [] : allKeys),
    style: {
      accentColor: "var(--sogang-red)",
      cursor: "pointer"
    }
  }) : null), columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      ...th,
      textAlign: c.headerAlign || "center",
      width: c.width
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, data.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length + (select ? 1 : 0),
    style: {
      ...td,
      textAlign: "center",
      color: "var(--text-muted)",
      padding: "26px 12px",
      borderRight: "none"
    }
  }, empty)) : data.map((row, i) => {
    const k = row[rowKey] ?? i;
    const selected = isSel(k);
    return /*#__PURE__*/React.createElement("tr", {
      key: k,
      "data-selected": selected,
      onClick: () => {
        if (select) toggle(k);
        if (onRowClick) onRowClick(row);
      },
      style: {
        cursor: onRowClick || select ? "pointer" : "default"
      }
    }, select && /*#__PURE__*/React.createElement("td", {
      style: {
        ...td,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: select === "radio" ? "radio" : "checkbox",
      checked: selected,
      onChange: () => toggle(k),
      onClick: e => e.stopPropagation(),
      style: {
        accentColor: "var(--sogang-red)",
        cursor: "pointer"
      }
    })), columns.map((c, ci) => /*#__PURE__*/React.createElement("td", {
      key: c.key,
      style: {
        ...td,
        textAlign: c.align || "left",
        borderRight: ci === columns.length - 1 ? "none" : td.borderRight,
        color: c.strong ? "var(--neutral-900)" : td.color,
        fontWeight: c.strong ? "var(--fw-semibold)" : "var(--fw-regular)"
      }
    }, c.render ? c.render(row[c.key], row) : row[c.key])));
  }))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Alert — inline banner for page/section messages. Tone maps to semantic
 * colors with a leading rule and optional title + dismiss.
 */
function Alert({
  tone = "info",
  title,
  icon,
  onDismiss,
  style = {},
  children,
  ...rest
}) {
  const tones = {
    info: {
      fg: "var(--info)",
      bg: "var(--info-50)",
      bd: "var(--info-100)"
    },
    success: {
      fg: "var(--success)",
      bg: "var(--success-50)",
      bd: "var(--success-100)"
    },
    warning: {
      fg: "var(--warning)",
      bg: "var(--warning-50)",
      bd: "var(--warning-100)"
    },
    danger: {
      fg: "var(--danger)",
      bg: "var(--danger-50)",
      bd: "var(--danger-100)"
    },
    neutral: {
      fg: "var(--neutral-700)",
      bg: "var(--neutral-50)",
      bd: "var(--neutral-200)"
    }
  };
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: "flex",
      gap: 12,
      padding: "12px 14px",
      background: t.bg,
      border: `1px solid ${t.bd}`,
      borderLeft: `3px solid ${t.fg}`,
      borderRadius: "var(--radius-sm)",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.fg,
      display: "inline-flex",
      flex: "0 0 auto",
      marginTop: 1
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--fs-sm)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-strong)",
      marginBottom: children ? 3 : 0
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--fs-sm)",
      color: "var(--text-body)",
      lineHeight: 1.55
    }
  }, children)), onDismiss && /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "Dismiss",
    className: "stream-iconbtn",
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: "var(--text-muted)",
      width: 24,
      height: 24,
      borderRadius: "var(--radius-xs)",
      flex: "0 0 auto",
      fontSize: 16,
      lineHeight: 1
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
/**
 * Dialog — modal for confirmations and short forms. Renders an overlay +
 * centered panel when `open`. Header (title), body (children), footer slot.
 */
function Dialog({
  open,
  title,
  onClose,
  footer,
  width = 460,
  style = {},
  children
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "rgba(22, 24, 28, 0.44)",
      backdropFilter: "blur(1px)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: "100%",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--surface-card)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-lg)",
      overflow: "hidden",
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "16px 20px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--fs-h3)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-strong)"
    }
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    className: "stream-iconbtn",
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: "var(--text-muted)",
      width: 30,
      height: 30,
      borderRadius: "var(--radius-sm)",
      fontSize: 20,
      lineHeight: 1
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "stream-scroll",
    style: {
      padding: "18px 20px",
      overflowY: "auto",
      fontSize: "var(--fs-body)",
      color: "var(--text-body)",
      lineHeight: 1.6
    }
  }, children), footer && /*#__PURE__*/React.createElement("footer", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
      padding: "14px 20px",
      borderTop: "1px solid var(--border-subtle)",
      background: "var(--neutral-25)"
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/**
 * EmptyState — placeholder for empty lists/views: icon, title, message,
 * and an optional primary action.
 */
function EmptyState({
  icon,
  title,
  message,
  action,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      padding: "44px 24px",
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 52,
      height: 52,
      borderRadius: "var(--radius-lg)",
      background: "var(--neutral-50)",
      border: "1px solid var(--border-subtle)",
      color: "var(--text-muted)",
      marginBottom: 14
    }
  }, icon), title && /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--fs-title)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-strong)",
      marginBottom: 6
    }
  }, title), message && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-sm)",
      color: "var(--text-muted)",
      maxWidth: 340,
      lineHeight: 1.55,
      marginBottom: action ? 16 : 0
    }
  }, message), action);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — primary institutional action control.
 * Variants: primary (Sogang red), secondary (neutral outline),
 * ghost (text), danger. Sizes: sm, md, lg.
 */
function Button({
  variant = "primary",
  size = "md",
  block = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = "button",
  style = {},
  children,
  ...rest
}) {
  const sizes = {
    sm: {
      height: 30,
      padding: "0 12px",
      fontSize: "var(--fs-sm)",
      gap: 6
    },
    md: {
      height: 38,
      padding: "0 16px",
      fontSize: "var(--fs-body)",
      gap: 8
    },
    lg: {
      height: 44,
      padding: "0 22px",
      fontSize: "var(--fs-title)",
      gap: 8
    }
  };
  const variants = {
    primary: {
      background: "var(--action-primary)",
      color: "var(--text-on-brand)",
      border: "1px solid var(--action-primary)"
    },
    secondary: {
      background: "var(--surface-card)",
      color: "var(--text-strong)",
      border: "1px solid var(--border-default)"
    },
    ghost: {
      background: "transparent",
      color: "var(--text-body)",
      border: "1px solid transparent"
    },
    danger: {
      background: "var(--danger)",
      color: "#fff",
      border: "1px solid var(--danger)"
    }
  };
  const s = sizes[size] || sizes.md;
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    className: "stream-btn",
    "data-variant": variant,
    style: {
      display: block ? "flex" : "inline-flex",
      width: block ? "100%" : "auto",
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      height: s.height,
      padding: s.padding,
      fontFamily: "var(--font-sans)",
      fontSize: s.fontSize,
      fontWeight: "var(--fw-semibold)",
      lineHeight: 1,
      borderRadius: "var(--radius-sm)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
      whiteSpace: "nowrap",
      ...v,
      ...style
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Checkbox with label. Controlled via `checked`/`onChange` or uncontrolled. */
function Checkbox({
  label,
  checked,
  disabled = false,
  id,
  style = {},
  ...rest
}) {
  const auto = React.useId ? React.useId() : "cb";
  const cid = id || auto;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: cid,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontSize: "var(--fs-body)",
      color: "var(--text-body)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: cid,
    type: "checkbox",
    className: "stream-control",
    checked: checked,
    disabled: disabled,
    style: {
      width: 16,
      height: 16,
      margin: 0,
      accentColor: "var(--sogang-red)",
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, rest)), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/FormField.jsx
try { (() => {
/**
 * FormField — label + control wrapper with optional required mark,
 * help text, and error message. Wrap any input primitive.
 */
function FormField({
  label,
  htmlFor,
  required = false,
  help,
  error,
  style = {},
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontSize: "var(--fs-sm)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-strong)"
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--danger)",
      marginLeft: 3
    }
  }, "*")), children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-caption)",
      color: "var(--danger)"
    }
  }, error) : help ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-caption)",
      color: "var(--text-muted)"
    }
  }, help) : null);
}
Object.assign(__ds_scope, { FormField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FormField.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square, icon-only action for toolbars and table rows.
 * Pass a Lucide <Icon /> (or any node) as children.
 */
function IconButton({
  size = "md",
  variant = "ghost",
  disabled = false,
  label,
  style = {},
  children,
  ...rest
}) {
  const dims = {
    sm: 28,
    md: 34,
    lg: 40
  };
  const d = dims[size] || dims.md;
  const variants = {
    ghost: {
      background: "transparent",
      border: "1px solid transparent",
      color: "var(--text-muted)"
    },
    outline: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-default)",
      color: "var(--text-body)"
    }
  };
  const v = variants[variant] || variants.ghost;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: "stream-iconbtn",
    disabled: disabled,
    "aria-label": label,
    title: label,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: d,
      height: d,
      borderRadius: "var(--radius-sm)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "background var(--dur-fast) var(--ease-standard)",
      ...v,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text input. Supports invalid state, sizes, and optional leading/trailing adornment. */
function Input({
  size = "md",
  invalid = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      height: 32,
      fontSize: "var(--fs-sm)",
      pad: 10
    },
    md: {
      height: 38,
      fontSize: "var(--fs-body)",
      pad: 12
    },
    lg: {
      height: 44,
      fontSize: "var(--fs-title)",
      pad: 14
    }
  };
  const s = sizes[size] || sizes.md;
  const field = /*#__PURE__*/React.createElement("input", _extends({
    className: "stream-input",
    disabled: disabled,
    "aria-invalid": invalid || undefined,
    style: {
      width: "100%",
      height: s.height,
      padding: `0 ${s.pad}px`,
      paddingLeft: iconLeft ? s.height : s.pad,
      paddingRight: iconRight ? s.height : s.pad,
      fontFamily: "var(--font-sans)",
      fontSize: s.fontSize,
      color: "var(--text-strong)",
      background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
      border: `1px solid ${invalid ? "var(--danger)" : "var(--border-default)"}`,
      borderRadius: "var(--radius-sm)",
      outline: "none",
      transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
      ...(iconLeft || iconRight ? {} : style),
      ...(iconLeft || iconRight ? {} : {})
    }
  }, rest));
  if (!iconLeft && !iconRight) return field;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "block",
      ...style
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 0,
      top: 0,
      height: s.height,
      width: s.height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-muted)",
      pointerEvents: "none"
    }
  }, iconLeft), field, iconRight && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 0,
      top: 0,
      height: s.height,
      width: s.height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-muted)"
    }
  }, iconRight));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Radio button with label. Group by shared `name`. */
function Radio({
  label,
  checked,
  disabled = false,
  id,
  name,
  value,
  style = {},
  ...rest
}) {
  const auto = React.useId ? React.useId() : "rb";
  const rid = id || auto;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: rid,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontSize: "var(--fs-body)",
      color: "var(--text-body)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: rid,
    type: "radio",
    className: "stream-control",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    style: {
      width: 16,
      height: 16,
      margin: 0,
      accentColor: "var(--sogang-red)",
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, rest)), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select styled to match STREAM inputs, with a chevron affordance. */
function Select({
  size = "md",
  invalid = false,
  disabled = false,
  style = {},
  children,
  ...rest
}) {
  const sizes = {
    sm: {
      height: 32,
      fontSize: "var(--fs-sm)"
    },
    md: {
      height: 38,
      fontSize: "var(--fs-body)"
    },
    lg: {
      height: 44,
      fontSize: "var(--fs-title)"
    }
  };
  const s = sizes[size] || sizes.md;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "block",
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: "stream-select",
    disabled: disabled,
    "aria-invalid": invalid || undefined,
    style: {
      width: "100%",
      height: s.height,
      padding: "0 34px 0 12px",
      fontFamily: "var(--font-sans)",
      fontSize: s.fontSize,
      color: "var(--text-strong)",
      background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
      border: `1px solid ${invalid ? "var(--danger)" : "var(--border-default)"}`,
      borderRadius: "var(--radius-sm)",
      outline: "none",
      appearance: "none",
      WebkitAppearance: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)"
    }
  }, rest), children), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      width: 0,
      height: 0,
      borderLeft: "4px solid transparent",
      borderRight: "4px solid transparent",
      borderTop: "5px solid var(--text-muted)",
      pointerEvents: "none"
    }
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Toggle switch for binary settings (e.g. availability, notifications). */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  id,
  style = {},
  ...rest
}) {
  const auto = React.useId ? React.useId() : "sw";
  const sid = id || auto;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: sid,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontSize: "var(--fs-body)",
      color: "var(--text-body)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-block",
      width: 38,
      height: 22,
      flex: "0 0 auto",
      background: checked ? "var(--sogang-red)" : "var(--neutral-300)",
      borderRadius: "var(--radius-pill)",
      transition: "background var(--dur-normal) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: sid,
    type: "checkbox",
    className: "stream-control",
    role: "switch",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      inset: 0,
      opacity: 0,
      margin: 0,
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      top: 2,
      left: checked ? 18 : 2,
      width: 18,
      height: 18,
      background: "#fff",
      borderRadius: "50%",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--dur-normal) var(--ease-standard)"
    }
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Multi-line text input. */
function Textarea({
  invalid = false,
  disabled = false,
  rows = 4,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: "stream-textarea",
    disabled: disabled,
    rows: rows,
    "aria-invalid": invalid || undefined,
    style: {
      width: "100%",
      padding: "10px 12px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-body)",
      lineHeight: "var(--lh-normal)",
      color: "var(--text-strong)",
      background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
      border: `1px solid ${invalid ? "var(--danger)" : "var(--border-default)"}`,
      borderRadius: "var(--radius-sm)",
      outline: "none",
      resize: "vertical",
      transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/foundation/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon — thin wrapper around the Lucide glyph set (the system's chosen
 * icon library). Requires the Lucide UMD script to be present on the page
 * (loaded via CDN in cards / kits). Renders an <svg> by cloning the named
 * Lucide icon; falls back to an empty inline box if Lucide isn't loaded yet.
 */
function Icon({
  name = "circle",
  size = 18,
  strokeWidth = 1.75,
  color = "currentColor",
  style = {},
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !window.lucide) return;
    // Build fresh <i data-lucide> then let lucide replace it with an <svg>.
    el.innerHTML = "";
    const i = document.createElement("i");
    i.setAttribute("data-lucide", name);
    el.appendChild(i);
    try {
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          "stroke-width": strokeWidth,
          stroke: color
        },
        nameAttr: "data-lucide"
      });
    } catch (e) {/* noop */}
  }, [name, size, strokeWidth, color]);
  return /*#__PURE__*/React.createElement("span", _extends({
    ref: ref,
    className: "stream-icon",
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      flex: "0 0 auto",
      lineHeight: 0,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/foundation/Icon.jsx", error: String((e && e.message) || e) }); }

// components/layout/Breadcrumb.jsx
try { (() => {
/** Breadcrumb — hierarchical location trail. `items`: [{label, href}]. */
function Breadcrumb({
  items = [],
  style = {}
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    style: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      fontSize: "var(--fs-caption)",
      ...style
    }
  }, items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    }, last ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-body)",
        fontWeight: "var(--fw-semibold)"
      }
    }, it.label) : /*#__PURE__*/React.createElement("a", {
      href: it.href || "#",
      style: {
        color: "var(--text-muted)",
        textDecoration: "none"
      }
    }, it.label), !last && /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        color: "var(--text-subtle)"
      }
    }, "/"));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/layout/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the primary content container. Optional header (title + actions)
 * and padded body. Institutional: 1px border, soft shadow, modest radius.
 */
function Card({
  title,
  subtitle,
  actions,
  padded = true,
  footer,
  style = {},
  headerStyle = {},
  bodyStyle = {},
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-sm)",
      overflow: "hidden",
      ...style
    }
  }, rest), (title || actions) && /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "14px 18px",
      borderBottom: "1px solid var(--border-subtle)",
      ...headerStyle
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--fs-title)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-strong)",
      lineHeight: 1.3
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-caption)",
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flex: "0 0 auto"
    }
  }, actions)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: padded ? "18px" : 0,
      ...bodyStyle
    }
  }, children), footer && /*#__PURE__*/React.createElement("footer", {
    style: {
      padding: "12px 18px",
      borderTop: "1px solid var(--border-subtle)",
      background: "var(--neutral-25)"
    }
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Card.jsx", error: String((e && e.message) || e) }); }

// components/layout/PageHeader.jsx
try { (() => {
/**
 * PageHeader — standard view title block: breadcrumb slot, H1 title,
 * optional description and right-aligned actions.
 */
function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  style = {},
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      ...style
    }
  }, breadcrumb, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "var(--fs-h1)",
      fontWeight: "var(--fw-extrabold)",
      color: "var(--text-strong)",
      letterSpacing: "var(--ls-tight)",
      lineHeight: 1.2
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-body)",
      color: "var(--text-muted)",
      marginTop: 6,
      maxWidth: 620
    }
  }, description)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flex: "0 0 auto"
    }
  }, actions)), children);
}
Object.assign(__ds_scope, { PageHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/PageHeader.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNav.jsx
try { (() => {
/**
 * SidebarNav — SAINT left menu. A red module title over a bordered box of
 * menu items, each with a small red square bullet; the active item is red.
 * Accepts either flat `items` or grouped `sections` (title optional).
 */
function SidebarNav({
  title,
  items,
  sections,
  active,
  onSelect,
  width = 232,
  footer,
  style = {}
}) {
  const groups = sections || (items ? [{
    items
  }] : []);
  const Item = ({
    it
  }) => {
    const isActive = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "stream-navitem",
      "data-active": isActive,
      onClick: () => onSelect && onSelect(it.id),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 12px",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
        fontWeight: isActive ? "var(--fw-bold)" : "var(--fw-medium)",
        color: isActive ? "var(--sogang-red)" : "var(--neutral-800)",
        textAlign: "left"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        width: 7,
        height: 7,
        flex: "0 0 auto",
        background: isActive ? "var(--sogang-red)" : "var(--sogang-red)",
        opacity: isActive ? 1 : 0.85
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, it.label), it.badge != null && /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular",
      style: {
        fontSize: "var(--fs-micro)",
        fontWeight: "var(--fw-bold)",
        color: "#fff",
        background: "var(--sogang-red)",
        borderRadius: "var(--radius-pill)",
        padding: "1px 6px",
        minWidth: 16,
        textAlign: "center"
      }
    }, it.badge));
  };
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width,
      flex: `0 0 ${typeof width === "number" ? width + "px" : width}`,
      padding: "18px 14px",
      background: "var(--surface-page)",
      borderRight: "1px solid var(--border-subtle)",
      ...style
    }
  }, title && /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--fs-h3)",
      fontWeight: "var(--fw-extrabold)",
      color: "var(--sogang-red)",
      padding: "0 4px 14px"
    }
  }, title), /*#__PURE__*/React.createElement("nav", {
    style: {
      border: "1px solid var(--saint-panel-border)",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-card)",
      overflow: "hidden"
    }
  }, groups.map((g, gi) => /*#__PURE__*/React.createElement("div", {
    key: gi
  }, g.label && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      fontSize: "var(--fs-caption)",
      fontWeight: "var(--fw-bold)",
      color: "var(--neutral-600)",
      background: "var(--saint-tan-soft)",
      borderBottom: "1px solid var(--saint-panel-border)"
    }
  }, g.label), g.items.map(it => /*#__PURE__*/React.createElement(Item, {
    key: it.id,
    it: it
  }))))), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 4px 0"
    }
  }, footer));
}
Object.assign(__ds_scope, { SidebarNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Tabs — underline tab bar for switching views within a page.
 * `tabs`: [{ id, label, badge }]. Controlled via `active` + `onChange`.
 */
function Tabs({
  tabs = [],
  active,
  onChange,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      borderBottom: "1px solid var(--border-default)",
      ...style
    }
  }, tabs.map(t => {
    const isActive = t.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      role: "tab",
      "aria-selected": isActive,
      className: "stream-tab",
      onClick: () => onChange && onChange(t.id),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "10px 14px",
        marginBottom: -1,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
        fontWeight: isActive ? "var(--fw-semibold)" : "var(--fw-medium)",
        color: isActive ? "var(--text-brand)" : "var(--text-muted)",
        borderBottom: `2px solid ${isActive ? "var(--sogang-red)" : "transparent"}`,
        transition: "color var(--dur-fast) var(--ease-standard)"
      }
    }, t.label, t.badge != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--fs-micro)",
        fontWeight: "var(--fw-bold)",
        background: isActive ? "var(--sogang-red-50)" : "var(--neutral-100)",
        color: isActive ? "var(--sogang-red)" : "var(--text-muted)",
        borderRadius: "var(--radius-pill)",
        padding: "1px 7px",
        fontVariantNumeric: "tabular-nums"
      }
    }, t.badge));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
/**
 * TopBar — SAINT global header. White, institutional: a thin utility strip
 * (date · welcome · account links) over the brand + horizontal global-nav row,
 * closed by a Sogang-red rule. Matches the live SAINT ERP portal chrome.
 */
function TopBar({
  logo,
  brandText = "STREAM",
  nav = [],
  activeNav,
  onNav,
  utility,
  user,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      background: "var(--surface-header)",
      borderTop: "3px solid var(--sogang-red)",
      borderBottom: "2px solid var(--sogang-red)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 14,
      height: 30,
      padding: "0 22px",
      fontSize: "var(--fs-caption)",
      color: "var(--text-muted)"
    }
  }, utility), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 28,
      padding: "0 22px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flex: "0 0 auto"
    }
  }, logo, brandText && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 24,
      letterSpacing: "0.04em",
      color: "var(--sogang-red)",
      lineHeight: 1
    }
  }, brandText)), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      flexWrap: "wrap"
    }
  }, nav.map(n => {
    const isActive = n.id === activeNav;
    return /*#__PURE__*/React.createElement("button", {
      key: n.id,
      type: "button",
      onClick: () => onNav && onNav(n.id),
      style: {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: 17,
        fontWeight: isActive ? "var(--fw-extrabold)" : "var(--fw-bold)",
        color: isActive ? "var(--sogang-red)" : "var(--neutral-800)",
        padding: "4px 14px",
        whiteSpace: "nowrap"
      }
    }, n.label);
  }))));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// components/saint/Field.jsx
try { (() => {
/**
 * Field — a SAINT label:value form pair. Label sits to the left; children is
 * any control or, for read-only display, a plain value styled via `readOnly`.
 */
function Field({
  label,
  required = false,
  labelWidth = 84,
  readOnly = false,
  children,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      ...style
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      flex: `0 0 ${labelWidth}px`,
      textAlign: "right",
      fontSize: "var(--fs-sm)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--neutral-700)",
      whiteSpace: "nowrap"
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--sogang-red)",
      marginLeft: 2
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, readOnly ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 34,
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      fontSize: "var(--fs-sm)",
      color: "var(--neutral-800)",
      background: "var(--saint-readonly)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-sm)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, children) : children));
}

/** FieldGrid — arranges Fields in a fixed-column grid (SAINT form layout). */
function FieldGrid({
  columns = 3,
  gap = 12,
  rowGap = 14,
  style = {},
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      columnGap: gap,
      rowGap,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Field, FieldGrid });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/saint/Field.jsx", error: String((e && e.message) || e) }); }

// components/saint/PageTitleBar.jsx
try { (() => {
/**
 * PageTitleBar — the SAINT page header: the screen title inside a maroon-
 * bordered box, with optional right-aligned actions (e.g. a 도움말 link).
 */
function PageTitleBar({
  title,
  right,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "13px 20px",
      border: "1.5px solid var(--saint-maroon)",
      borderRadius: "var(--radius-md)",
      background: "var(--surface-card)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "var(--fs-h2)",
      fontWeight: "var(--fw-extrabold)",
      color: "var(--neutral-900)",
      letterSpacing: "var(--ls-tight)"
    }
  }, title), right && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      flex: "0 0 auto"
    }
  }, right));
}
Object.assign(__ds_scope, { PageTitleBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/saint/PageTitleBar.jsx", error: String((e && e.message) || e) }); }

// components/saint/SectionPanel.jsx
try { (() => {
/**
 * SectionPanel — the SAINT collapsible content block: a header row with a
 * chevron + title (optional right actions), and a bordered body. Grouping
 * primitive for forms, tables, and search areas inside a screen.
 */
function SectionPanel({
  title,
  right,
  defaultOpen = true,
  collapsible = true,
  padded = true,
  bodyStyle = {},
  style = {},
  children
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return /*#__PURE__*/React.createElement("section", {
    style: {
      border: "1px solid var(--saint-panel-border)",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-card)",
      overflow: "hidden",
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    onClick: collapsible ? () => setOpen(o => !o) : undefined,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 14px",
      background: "var(--saint-tan-soft)",
      borderBottom: open ? "1px solid var(--saint-panel-border)" : "none",
      cursor: collapsible ? "pointer" : "default"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0
    }
  }, collapsible && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: "var(--saint-maroon)",
      fontSize: 11,
      transform: open ? "rotate(0deg)" : "rotate(-90deg)",
      transition: "transform var(--dur-fast) var(--ease-standard)"
    }
  }, "\u25BC"), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--fs-title)",
      fontWeight: "var(--fw-bold)",
      color: "var(--neutral-900)"
    }
  }, title)), right && /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flex: "0 0 auto"
    }
  }, right)), open && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: padded ? "16px 18px" : 0,
      ...bodyStyle
    }
  }, children));
}
Object.assign(__ds_scope, { SectionPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/saint/SectionPanel.jsx", error: String((e && e.message) || e) }); }

// components/saint/Toolbar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * ToolbarButton — the bordered SAINT action button (e.g. 조회, 신고생성, 수정),
 * a compact white/grey button with an optional small icon. `tone="primary"`
 * fills it Sogang red for the main confirm action (조회, 저장).
 */
function ToolbarButton({
  icon,
  tone = "default",
  disabled = false,
  style = {},
  children,
  ...rest
}) {
  const tones = {
    default: {
      background: "linear-gradient(var(--neutral-0), var(--neutral-50))",
      color: "var(--neutral-800)",
      border: "1px solid var(--border-default)"
    },
    primary: {
      background: "var(--sogang-red)",
      color: "#fff",
      border: "1px solid var(--sogang-red)"
    },
    ghost: {
      background: "transparent",
      color: "var(--neutral-700)",
      border: "1px solid transparent"
    }
  };
  const t = tones[tone] || tones.default;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: "stream-toolbtn",
    "data-tone": tone,
    disabled: disabled,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 30,
      padding: "0 11px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-sm)",
      fontWeight: "var(--fw-semibold)",
      lineHeight: 1,
      borderRadius: "var(--radius-sm)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      whiteSpace: "nowrap",
      ...t,
      ...style
    }
  }, rest), icon, children);
}

/** Toolbar — a horizontal action row, usually above a table. `align` end/between. */
function Toolbar({
  align = "start",
  label,
  style = {},
  children
}) {
  const justify = align === "end" ? "flex-end" : align === "between" ? "space-between" : "flex-start";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: justify,
      gap: 8,
      flexWrap: "wrap",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-sm)",
      color: "var(--neutral-600)",
      fontWeight: "var(--fw-semibold)",
      marginRight: 4
    }
  }, label), children);
}
Object.assign(__ds_scope, { ToolbarButton, Toolbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/saint/Toolbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/AdminShell.jsx
try { (() => {
// STREAM 관리자 콘솔 shell + shared helpers (plain script, window exports)

function AdminIcon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.75,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          stroke: color,
          'stroke-width': strokeWidth
        },
        nameAttr: 'data-lucide'
      });
    }
  }, [name, size, color, strokeWidth]);
  return React.createElement('span', {
    ref,
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      ...style
    }
  });
}
const A_TONES = {
  '모집중': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  '모집완료': {
    bg: '#E8F0FB',
    fg: '#2563C9'
  },
  '마감임박': {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  '검토중': {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  '선발': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  '보류': {
    bg: '#FBF1DC',
    fg: '#B8860B'
  },
  '탈락': {
    bg: '#EEF0F2',
    fg: '#6B7280'
  },
  '미처리': {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  '승인': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  '반려': {
    bg: '#EEF0F2',
    fg: '#6B7280'
  },
  '정상': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  }
};
function ABadge({
  status
}) {
  const t = A_TONES[status] || {
    bg: '#EEF0F2',
    fg: '#6B7280'
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      background: t.bg,
      color: t.fg,
      padding: '4px 11px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap'
    }
  }, status);
}
const A_CIRCLE = {
  neutral: {
    bg: '#EEF1F4',
    fg: '#5B6570'
  },
  green: {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  orange: {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  blue: {
    bg: '#E8F0FB',
    fg: '#2563C9'
  },
  purple: {
    bg: '#EEEAFB',
    fg: '#6D4FCB'
  },
  gold: {
    bg: '#FBF1DC',
    fg: '#B8860B'
  },
  red: {
    bg: '#FCEAEA',
    fg: '#C0322B'
  }
};
const A_VAL = {
  neutral: '#1F2937',
  green: '#1F8A4C',
  orange: '#D9791F',
  blue: '#2563C9',
  purple: '#6D4FCB',
  gold: '#B8860B',
  red: '#C0322B'
};
function AStatCard({
  stat
}) {
  const c = A_CIRCLE[stat.tone] || A_CIRCLE.neutral;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 1px 2px rgba(16,24,40,.04)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      borderRadius: '50%',
      background: c.bg,
      color: c.fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: stat.icon,
    size: 21,
    color: c.fg
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600
    }
  }, stat.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      lineHeight: 1.1,
      color: A_VAL[stat.tone] || '#1F2937'
    }
  }, stat.value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, stat.sub)));
}
function APanel({
  title,
  right,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22,
      ...style
    }
  }, (title || right) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 16,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, title), right), children);
}
function ATimeGrid({
  redSlots = [],
  checkSlots = [],
  redLabel = '수업시간',
  legend = true
}) {
  const rows = window.adminTimeRows,
    days = window.adminDayCols;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      border: '1px solid #E6E8EB',
      background: '#F6F0E6',
      padding: '8px 0',
      fontSize: 12,
      fontWeight: 700,
      color: '#5B4B33',
      width: 64
    }
  }, "\uC2DC\uAC04"), days.map(d => /*#__PURE__*/React.createElement("th", {
    key: d,
    style: {
      border: '1px solid #E6E8EB',
      background: '#F6F0E6',
      padding: '8px 0',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33'
    }
  }, d)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      border: '1px solid #E6E8EB',
      background: '#FAFAFA',
      textAlign: 'center',
      fontSize: 12,
      color: '#6B7280',
      height: 28
    }
  }, t), days.map(d => {
    const key = d + '-' + t,
      isRed = redSlots.includes(key),
      isCk = checkSlots.includes(key);
    return /*#__PURE__*/React.createElement("td", {
      key: key,
      style: {
        border: '1px solid #E6E8EB',
        height: 28,
        textAlign: 'center',
        background: isRed ? '#B01116' : '#fff',
        color: '#fff',
        fontSize: 11,
        fontWeight: 600
      }
    }, isRed ? redLabel : isCk ? /*#__PURE__*/React.createElement(AdminIcon, {
      name: "check",
      size: 13,
      color: "#B01116"
    }) : '');
  }))))), legend && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      marginTop: 10,
      fontSize: 12,
      color: '#6B7280'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 13,
      height: 13,
      background: '#B01116',
      borderRadius: 3
    }
  }), " \uBC30\uC815\uB41C \uADFC\uBB34 \uC2DC\uAC04"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "check",
    size: 13,
    color: "#B01116"
  }), " \uADFC\uBB34 \uAC00\uB2A5 \uC2DC\uAC04")));
}
function AButton({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  icon
}) {
  const h = size === 'sm' ? 34 : size === 'lg' ? 48 : 42;
  const pad = size === 'sm' ? '0 14px' : size === 'lg' ? '0 32px' : '0 18px';
  const fs = size === 'sm' ? 13 : 14;
  const styles = {
    primary: {
      background: '#B01116',
      color: '#fff',
      border: 'none'
    },
    outline: {
      background: '#fff',
      color: '#3A4048',
      border: '1px solid #DADEE3'
    },
    danger: {
      background: '#fff',
      color: '#C0322B',
      border: '1px solid #E7B7B4'
    },
    ghost: {
      background: 'transparent',
      color: '#B01116',
      border: '1px solid #EBB9B8'
    },
    dark: {
      background: '#26292E',
      color: '#fff',
      border: 'none'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      height: h,
      padding: pad,
      borderRadius: 8,
      fontSize: fs,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      ...styles
    }
  }, icon && /*#__PURE__*/React.createElement(AdminIcon, {
    name: icon,
    size: fs + 2,
    color: styles.color
  }), " ", children);
}
function PageTitle({
  title,
  desc,
  right
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, title), desc && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, desc)), right);
}
function AdminShell({
  active,
  onNavigate,
  children
}) {
  const u = window.adminUser;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      background: '#F4F5F7',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      background: '#fff',
      borderBottom: '1px solid #E6E8EB',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      gap: 28,
      position: 'sticky',
      top: 0,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/sogang-logo.png",
    alt: "\uC11C\uAC15\uB300\uD559\uAD50",
    style: {
      height: 34
    }
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 30,
      flex: 1,
      justifyContent: 'center'
    }
  }, window.adminSaintNav.map(n => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer'
    }
  }, n)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: '#B01116',
      cursor: 'pointer',
      paddingBottom: 4,
      borderBottom: '3px solid #B01116'
    }
  }, "STREAM")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "bell",
    size: 20,
    color: "#5B6570"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: '#EEF1F4',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "user",
    size: 16,
    color: "#5B6570"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#3A4048',
      fontWeight: 600
    }
  }, u.name, " (", u.role, ")"), /*#__PURE__*/React.createElement(AdminIcon, {
    name: "chevron-down",
    size: 16,
    color: "#9AA1A9"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 240,
      background: '#fff',
      borderRight: '1px solid #E6E8EB',
      padding: '28px 16px',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 12px 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: '#B01116',
      letterSpacing: '.04em',
      fontFamily: 'var(--font-brand)'
    }
  }, "STREAM"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#9AA1A9',
      marginTop: 4
    }
  }, "\uAD50\uB0B4 \uADFC\uB85C \uC6B4\uC601 \uAD00\uB9AC (\uAD00\uB9AC\uC790)")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      marginTop: 22
    }
  }, window.adminMenu.map(m => {
    const on = active === m.id;
    return /*#__PURE__*/React.createElement("button", {
      key: m.id,
      onClick: () => onNavigate && onNavigate(m.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'left',
        width: '100%',
        background: on ? '#FDECEC' : 'transparent',
        color: on ? '#B01116' : '#4B5563',
        fontWeight: on ? 700 : 500,
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement(AdminIcon, {
      name: m.icon,
      size: 18,
      color: on ? '#B01116' : '#8A929B'
    }), " ", m.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#F8F9FB',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      marginBottom: 6
    }
  }, "\uB2F4\uB2F9 \uBD80\uC11C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#3A4048'
    }
  }, u.dept), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#6B7280',
      marginTop: 2
    }
  }, u.name, " \xB7 ", u.role)))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: '28px 32px 48px'
    }
  }, children)));
}
Object.assign(window, {
  AdminIcon,
  ABadge,
  AStatCard,
  APanel,
  ATimeGrid,
  AButton,
  PageTitle,
  AdminShell
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/AdminShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/DashboardModule.jsx
try { (() => {
// 운영 대시보드 (충원율/지원자수/미처리 요청/근무표 충돌 + 2 minimal charts)
function DashboardModule() {
  const {
    AdminIcon,
    AStatCard,
    ABadge,
    APanel
  } = window;
  const maxTrend = Math.max(...window.subTrend.map(t => t.count));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uC6B4\uC601 \uB300\uC2DC\uBCF4\uB4DC"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, "2026-1\uD559\uAE30 \uAD50\uB0B4 \uADFC\uB85C \uC6B4\uC601 \uD604\uD669 \uC694\uC57D\uC785\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginBottom: 20
    }
  }, window.dashStats.map(s => /*#__PURE__*/React.createElement(AStatCard, {
    key: s.key,
    stat: s
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.3fr 1fr',
      gap: 18,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(APanel, {
    title: "\uBD80\uC11C\uBCC4 \uCDA9\uC6D0\uC728"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, window.deptFill.map(d => {
    const pct = Math.round(d.filled / d.total * 100);
    const color = pct >= 100 ? '#1F8A4C' : pct >= 50 ? '#2563C9' : pct > 0 ? '#D9791F' : '#C0322B';
    return /*#__PURE__*/React.createElement("div", {
      key: d.dept
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: '#3A4048'
      }
    }, d.dept), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: '#6B7280'
      }
    }, d.filled, "/", d.total, "\uBA85 ", /*#__PURE__*/React.createElement("b", {
      style: {
        color
      }
    }, "(", pct, "%)"))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 10,
        background: '#EEF0F2',
        borderRadius: 5,
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: '100%',
        width: pct + '%',
        background: color,
        borderRadius: 5
      }
    })));
  }))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uB300\uD0C0 \uC694\uCCAD \uCD94\uC774"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-around',
      height: 180,
      padding: '0 12px'
    }
  }, window.subTrend.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.month,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#B01116'
    }
  }, t.count), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: t.count / maxTrend * 130,
      background: 'linear-gradient(180deg,#C8383D,#B01116)',
      borderRadius: '6px 6px 0 0'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#6B7280'
    }
  }, t.month)))))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uCD5C\uADFC \uCC98\uB9AC \uD544\uC694 \uD56D\uBAA9"
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6'
    }
  }, ['구분', '내용', '부서', '상태'].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      padding: '12px 16px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: i === 3 ? 'center' : 'left'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, [['대타 승인', '안희진 · 05.28 10:00-13:00 대타 요청', '학생지원팀', '미처리'], ['근무표 충돌', '입학처 논술 보조 · 화 14:00 중복 배정', '입학처', '검토중'], ['선발 마감', '국제교류팀 교환학생 지원 보조 · 05.27 마감', '국제교류팀', '모집중']].map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      fontWeight: 600,
      color: '#1F2937'
    }
  }, r[0]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r[1]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      color: '#6B7280'
    }
  }, r[2]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '13px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(ABadge, {
    status: r[3]
  }))))))));
}
window.DashboardModule = DashboardModule;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/DashboardModule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/PostsAdminScreen.jsx
try { (() => {
// Admin · Recruitment Posts (manage)
function PostsAdminScreen({
  ns
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Table,
    StatusPill,
    Button,
    IconButton,
    Icon,
    Input,
    Select
  } = ns;
  const D = window.STREAM_DATA;
  const columns = [{
    key: "title",
    header: "Position",
    strong: true
  }, {
    key: "dept",
    header: "Department"
  }, {
    key: "type",
    header: "Type",
    render: v => /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-muted)"
      }
    }, v)
  }, {
    key: "applied",
    header: "Applicants",
    align: "center",
    render: (v, r) => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v, " / ", r.slots)
  }, {
    key: "closes",
    header: "Closes",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "status",
    header: "Status",
    render: v => /*#__PURE__*/React.createElement(StatusPill, {
      status: v === "closing" ? "warning" : "open",
      label: v === "closing" ? "Closing soon" : "Open",
      tone: v === "closing" ? "warning" : "success"
    })
  }, {
    key: "id",
    header: "",
    align: "right",
    render: () => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 4,
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      label: "Review applicants"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "users",
      size: 16
    })), /*#__PURE__*/React.createElement(IconButton, {
      label: "Edit"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "pencil",
      size: 16
    })), /*#__PURE__*/React.createElement(IconButton, {
      label: "More"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "more-horizontal",
      size: 16
    })))
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Recruitment Posts"
      }]
    }),
    title: "Recruitment Posts",
    description: "Create and manage work-study postings for your departments.",
    actions: /*#__PURE__*/React.createElement(Button, {
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16
      })
    }, "New post")
  }), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      padding: "14px 16px",
      borderBottom: "1px solid var(--border-subtle)",
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 200
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 15
    }),
    placeholder: "Search postings"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 170
    }
  }, /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    defaultValue: "all"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All departments"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 140
    }
  }, /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    defaultValue: "open"
  }, /*#__PURE__*/React.createElement("option", {
    value: "open"
  }, "Open"), /*#__PURE__*/React.createElement("option", null, "Closed"), /*#__PURE__*/React.createElement("option", null, "Draft")))), /*#__PURE__*/React.createElement(Table, {
    columns: columns,
    data: D.posts,
    rowKey: "id"
  })));
}
window.PostsAdminScreen = PostsAdminScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/PostsAdminScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/PostsModule.jsx
try { (() => {
// 교내 근로 모집 공고 (목록 / 상세 / 등록·수정)
function PostsModule() {
  const {
    AdminIcon,
    ABadge,
    AStatCard,
    APanel,
    AButton,
    PageTitle,
    ATimeGrid
  } = window;
  const [view, setView] = React.useState('list'); // list | detail | edit
  const [sel, setSel] = React.useState(window.adminPosts[0]);
  if (view === 'edit') return /*#__PURE__*/React.createElement(PostEdit, {
    onBack: () => setView('list')
  });
  if (view === 'detail') return /*#__PURE__*/React.createElement(PostDetailAdmin, {
    post: sel,
    onBack: () => setView('list'),
    onEdit: () => setView('edit')
  });
  const th = (t, align) => /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: align || 'left',
      whiteSpace: 'nowrap'
    }
  }, t);
  const td = (c, align) => /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      fontSize: 13,
      color: '#3A4048',
      textAlign: align || 'left'
    }
  }, c);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageTitle, {
    title: "\uAD50\uB0B4 \uADFC\uB85C \uBAA8\uC9D1 \uACF5\uACE0",
    desc: "\uBAA8\uC9D1 \uACF5\uACE0\uB97C \uB4F1\uB85D\uD558\uACE0 \uC9C0\uC6D0 \uC811\uC218 \uD604\uD669\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    right: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(AButton, {
      variant: "outline",
      icon: "copy"
    }, "\uC774\uC804 \uACF5\uACE0 \uBD88\uB7EC\uC624\uAE30"), /*#__PURE__*/React.createElement(AButton, {
      variant: "primary",
      icon: "plus",
      onClick: () => setView('edit')
    }, "\uC2E0\uADDC \uACF5\uACE0 \uB4F1\uB85D"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginBottom: 20
    }
  }, window.adminPostStats.map(s => /*#__PURE__*/React.createElement(AStatCard, {
    key: s.key,
    stat: s
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      maxWidth: 420
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 14,
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "search",
    size: 17,
    color: "#9AA1A9"
  })), /*#__PURE__*/React.createElement("input", {
    placeholder: "\uACF5\uACE0\uBA85, \uBD80\uC11C\uBA85\uC73C\uB85C \uAC80\uC0C9",
    style: {
      width: '100%',
      height: 42,
      padding: '0 14px 0 42px',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      font: 'inherit',
      boxSizing: 'border-box'
    }
  })), ['부서 전체', '모집상태 전체', '학기 2026-1'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      height: 42,
      padding: '0 14px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, f, " ", /*#__PURE__*/React.createElement(AdminIcon, {
    name: "chevron-down",
    size: 15,
    color: "#9AA1A9"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6',
      borderBottom: '1px solid #E6E8EB'
    }
  }, th('상태', 'center'), th('공고명 / 부서'), th('모집인원', 'center'), th('지원인원', 'center'), th('주당 근무'), th('마감일', 'center'), th('관리', 'center'))), /*#__PURE__*/React.createElement("tbody", null, window.adminPosts.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.id,
    style: {
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(ABadge, {
    status: p.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      marginTop: 2
    }
  }, p.dept, " \xB7 \uB4F1\uB85D ", p.reg)), td(p.headcount + '명', 'center'), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center',
      fontSize: 14,
      fontWeight: 700,
      color: '#B01116'
    }
  }, p.applicants), td(p.weekly), td(p.deadline, 'center'), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSel(p);
      setView('detail');
    },
    style: {
      height: 32,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC0C1\uC138"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSel(p);
      setView('edit');
    },
    style: {
      height: 32,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC218\uC815")))))))));
}
function PostDetailAdmin({
  post,
  onBack,
  onEdit
}) {
  const {
    AdminIcon,
    ABadge,
    APanel,
    AButton,
    ATimeGrid
  } = window;
  const cell = (icon, label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: '#F1F3F5',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: icon,
    size: 19,
    color: "#6B7280"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: '#1F2937',
      fontWeight: 700
    }
  }, value)));
  const bullet = t => /*#__PURE__*/React.createElement("li", {
    key: t,
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 14,
      color: '#3A4048',
      lineHeight: 1.6,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#B01116'
    }
  }, "\u2022"), " ", t);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'none',
      border: 'none',
      fontSize: 14,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "chevron-left",
    size: 18,
    color: "#6B7280"
  }), " \uBAA9\uB85D\uC73C\uB85C"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AButton, {
    variant: "outline",
    icon: "pencil",
    onClick: onEdit
  }, "\uC218\uC815"), /*#__PURE__*/React.createElement(AButton, {
    variant: "outline",
    icon: "users"
  }, "\uC9C0\uC6D0\uC790 \uBCF4\uAE30 (", post.applicants, ")"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(ABadge, {
    status: post.status
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, post.dept, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC',
      margin: '0 6px'
    }
  }, "|"), " ", post.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '22px 26px',
      display: 'flex',
      gap: 8,
      marginBottom: 18
    }
  }, cell('users', '모집인원', post.headcount + '명'), cell('user-check', '지원인원', post.applicants + '명'), cell('timer', '주당 근무시간', post.weekly), cell('clock', '지원 마감일', post.deadline)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(APanel, {
    title: "\uC5C5\uBB34 \uB0B4\uC6A9"
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, ['민원 응대 및 부서 행정 업무 보조', '문서 정리, 자료 입력, 안내 자료 관리', '부서 내 단순 행정 업무 지원'].map(bullet))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uC9C0\uC6D0 \uC790\uACA9 \uBC0F \uC6B0\uB300 \uC870\uAC74"
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, ['학부 재학생 (휴학생 불가)', '엑셀 활용 가능자 우대', '문서 작성 및 자료 정리 경험자 우대'].map(bullet)))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uADFC\uBB34 \uC870\uAC74"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: '#3A4048',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "clock",
    size: 16,
    color: "#8A929B"
  }), " \uADFC\uBB34\uC694\uC77C/\uC2DC\uAC04"), /*#__PURE__*/React.createElement(ATimeGrid, {
    redSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00'],
    redLabel: "",
    legend: false
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "map-pin",
    size: 16,
    color: "#8A929B"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      fontWeight: 600,
      width: 60
    }
  }, "\uADFC\uBB34\uC7A5\uC18C"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#1F2937',
      fontWeight: 600
    }
  }, post.dept, " \uC0AC\uBB34\uC2E4 (\uBCF8\uAD00\uBE4C\uB529)")))));
}
function PostEdit({
  onBack
}) {
  const {
    AdminIcon,
    APanel,
    AButton,
    PageTitle,
    ATimeGrid
  } = window;
  const field = (label, ph, req) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600
    }
  }, label, " ", req && /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#B01116'
    }
  }, "*")), /*#__PURE__*/React.createElement("input", {
    placeholder: ph,
    style: {
      height: 42,
      padding: '0 14px',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      font: 'inherit',
      boxSizing: 'border-box'
    }
  }));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'none',
      border: 'none',
      fontSize: 14,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "chevron-left",
    size: 18,
    color: "#6B7280"
  }), " \uBAA9\uB85D\uC73C\uB85C"), /*#__PURE__*/React.createElement(PageTitle, {
    title: "\uBAA8\uC9D1 \uACF5\uACE0 \uB4F1\uB85D",
    desc: "\uC0C8 \uAD50\uB0B4 \uADFC\uB85C \uACF5\uACE0\uB97C \uC791\uC131\uD569\uB2C8\uB2E4. \uC774\uC804 \uACF5\uACE0\uB97C \uBD88\uB7EC\uC640 \uBE60\uB974\uAC8C \uCC44\uC6B8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    right: /*#__PURE__*/React.createElement(AButton, {
      variant: "outline",
      icon: "copy"
    }, "\uC774\uC804 \uACF5\uACE0 \uBD88\uB7EC\uC624\uAE30")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      maxWidth: 900
    }
  }, /*#__PURE__*/React.createElement(APanel, {
    title: "\uAE30\uBCF8 \uC815\uBCF4"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, field('공고명', '예) 2026-1학기 학생지원팀 행정 보조', true), field('담당 부서', '부서를 선택하세요', true), field('모집 인원', '예) 2', true), field('주당 최대 근무시간', '예) 15', true), field('모집 시작일', 'YYYY.MM.DD', true), field('지원 마감일', 'YYYY.MM.DD', true))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uC5C5\uBB34 \uB0B4\uC6A9 \uBC0F \uC790\uACA9"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\uC5C5\uBB34 \uB0B4\uC6A9 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#B01116'
    }
  }, "*")), /*#__PURE__*/React.createElement("textarea", {
    placeholder: "\uB2F4\uB2F9 \uC5C5\uBB34\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uC791\uC131\uD558\uC138\uC694.",
    style: {
      width: '100%',
      height: 90,
      padding: 12,
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      resize: 'none',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\uC9C0\uC6D0 \uC790\uACA9 \uBC0F \uC6B0\uB300 \uC870\uAC74"), /*#__PURE__*/React.createElement("textarea", {
    placeholder: "\uC9C0\uC6D0 \uC790\uACA9, \uC6B0\uB300 \uC5ED\uB7C9\uC744 \uC791\uC131\uD558\uC138\uC694.",
    style: {
      width: '100%',
      height: 80,
      padding: 12,
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      resize: 'none',
      boxSizing: 'border-box'
    }
  })))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uADFC\uBB34 \uC694\uC77C / \uC2DC\uAC04"
  }, /*#__PURE__*/React.createElement(ATimeGrid, {
    redSlots: ['월-10:00', '월-11:00', '수-10:00', '수-11:00'],
    redLabel: "",
    legend: false
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(AButton, {
    variant: "outline",
    onClick: onBack
  }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement(AButton, {
    variant: "ghost"
  }, "\uC784\uC2DC\uC800\uC7A5"), /*#__PURE__*/React.createElement(AButton, {
    variant: "primary",
    icon: "check"
  }, "\uACF5\uACE0 \uB4F1\uB85D"))));
}
window.PostsModule = PostsModule;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/PostsModule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/ScheduleAdminScreen.jsx
try { (() => {
// Admin · Work Schedule (assignment grid)
function ScheduleAdminScreen({
  ns
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Button,
    Icon,
    Avatar,
    StatusPill
  } = ns;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const slots = ["09:00–13:00", "13:00–17:00"];

  // assignment map: `${day}-${slot}` -> assignment
  const grid = {
    "Mon-09:00–13:00": {
      who: "Choi Yuna",
      place: "Reference Desk"
    },
    "Mon-13:00–17:00": {
      who: "Kim Minjun",
      place: "Circulation"
    },
    "Tue-09:00–13:00": {
      who: "Choi Yuna",
      place: "Reference Desk"
    },
    "Tue-13:00–17:00": {
      who: "Kim Minjun",
      place: "Circulation",
      swap: true
    },
    "Wed-09:00–13:00": {
      who: "Han Jiwoo",
      place: "Reading Room"
    },
    "Thu-09:00–13:00": {
      who: "Choi Yuna",
      place: "Reference Desk"
    },
    "Thu-13:00–17:00": {
      who: "Seo Minseo",
      place: "Circulation"
    },
    "Fri-13:00–17:00": {
      who: "Kim Minjun",
      place: "Reading Room"
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Work Schedule"
      }]
    }),
    title: "Work Schedule",
    description: "Central Library \xB7 assign and adjust student shifts for the week.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "chevron-left",
        size: 15
      })
    }, "Prev"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "wand-2",
        size: 15
      })
    }, "Auto-fill"), /*#__PURE__*/React.createElement(Button, {
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 15
      })
    }, "Add shift"))
  }), /*#__PURE__*/React.createElement(Card, {
    title: "Week of Sep 8 \u2013 Sep 12",
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "110px repeat(5,1fr)",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--neutral-25)",
      borderRight: "1px solid var(--border-subtle)"
    }
  }), days.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      padding: "10px 12px",
      textAlign: "center",
      background: "var(--neutral-25)",
      borderRight: i < 4 ? "1px solid var(--border-subtle)" : "none",
      borderBottom: "1px solid var(--border-subtle)",
      fontSize: "var(--fs-caption)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-strong)"
    }
  }, d)), slots.map(slot => /*#__PURE__*/React.createElement(React.Fragment, {
    key: slot
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px",
      borderRight: "1px solid var(--border-subtle)",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--neutral-25)",
      fontSize: "var(--fs-micro)",
      color: "var(--text-muted)",
      fontWeight: "var(--fw-semibold)"
    },
    className: "stream-tabular"
  }, slot), days.map((d, i) => {
    const a = grid[`${d}-${slot}`];
    return /*#__PURE__*/React.createElement("div", {
      key: d + slot,
      style: {
        borderRight: i < 4 ? "1px solid var(--border-subtle)" : "none",
        borderBottom: "1px solid var(--border-subtle)",
        padding: 8,
        minHeight: 74
      }
    }, a ? /*#__PURE__*/React.createElement("div", {
      style: {
        border: `1px solid ${a.swap ? "var(--warning-100)" : "var(--sogang-red-100)"}`,
        background: a.swap ? "var(--warning-50)" : "var(--sogang-red-50)",
        borderRadius: "var(--radius-sm)",
        padding: "7px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        height: "100%"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: a.who,
      size: 20
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--fs-caption)",
        fontWeight: "var(--fw-semibold)",
        color: "var(--text-strong)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, a.who)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--fs-micro)",
        color: "var(--text-muted)"
      }
    }, a.place), a.swap && /*#__PURE__*/React.createElement(StatusPill, {
      status: "pending",
      label: "Swap",
      tone: "warning"
    })) : /*#__PURE__*/React.createElement("button", {
      style: {
        width: "100%",
        height: "100%",
        border: "1px dashed var(--border-default)",
        background: "transparent",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-subtle)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18
      }
    }, "+"));
  }))))));
}
window.ScheduleAdminScreen = ScheduleAdminScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/ScheduleAdminScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/ScheduleModule.jsx
try { (() => {
// 근로 시간표 (가능시간 수합 → 제약 기반 생성 → 주간 그리드 → 시나리오 비교 → 확정)
function ScheduleModule() {
  const {
    AdminIcon,
    AButton,
    APanel,
    ATimeGrid
  } = window;
  const [stage, setStage] = React.useState(0); // 0 수합, 1 생성, 2 그리드/비교, 3 확정
  const steps = ['가능 시간 수합', '제약 기반 생성', '주간 그리드 · 비교', '최종 확정'];
  const Stepper = () => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '18px 28px',
      marginBottom: 20
    }
  }, steps.map((s, i) => {
    const done = i < stage,
      active = i === stage;
    return /*#__PURE__*/React.createElement("div", {
      key: s,
      style: {
        flex: i < 3 ? 1 : '0 0 auto',
        display: 'flex',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: done ? '#1F8A4C' : active ? '#B01116' : '#fff',
        border: '2px solid ' + (done ? '#1F8A4C' : active ? '#B01116' : '#D5D8DC'),
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0
      }
    }, done ? /*#__PURE__*/React.createElement(AdminIcon, {
      name: "check",
      size: 15,
      color: "#fff",
      strokeWidth: 3
    }) : i + 1), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 10,
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        color: done || active ? '#1F2937' : '#9AA1A9',
        whiteSpace: 'nowrap'
      }
    }, s), i < 3 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 2,
        background: done ? '#1F8A4C' : '#E6E8EB',
        margin: '0 16px'
      }
    }));
  }));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uADFC\uB85C \uC2DC\uAC04\uD45C"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uD559\uC0DD \uAC00\uB2A5 \uC2DC\uAC04\uC744 \uC218\uD569\uD558\uACE0 \uC81C\uC57D \uC870\uAC74 \uAE30\uBC18\uC73C\uB85C \uADFC\uBB34\uD45C\uB97C \uC0DD\uC131\xB7\uD655\uC815\uD569\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, stage > 0 && /*#__PURE__*/React.createElement(AButton, {
    variant: "outline",
    icon: "chevron-left",
    onClick: () => setStage(stage - 1)
  }, "\uC774\uC804 \uB2E8\uACC4"), stage < 3 && /*#__PURE__*/React.createElement(AButton, {
    variant: "primary",
    onClick: () => setStage(stage + 1),
    icon: "chevron-right"
  }, "\uB2E4\uC74C \uB2E8\uACC4"))), /*#__PURE__*/React.createElement(Stepper, null), stage === 0 && /*#__PURE__*/React.createElement(APanel, {
    title: "\uAC00\uB2A5 \uC2DC\uAC04 \uC218\uD569 \uD604\uD669",
    right: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: '#6B7280'
      }
    }, "\uC81C\uCD9C ", /*#__PURE__*/React.createElement("b", {
      style: {
        color: '#1F8A4C'
      }
    }, "2"), " / \uBBF8\uC81C\uCD9C ", /*#__PURE__*/React.createElement("b", {
      style: {
        color: '#D9791F'
      }
    }, "1"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 14
    }
  }, [{
    n: '안희진',
    ok: true,
    h: 8
  }, {
    n: '박민수',
    ok: true,
    h: 10
  }, {
    n: '이영희',
    ok: false,
    h: 0
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    style: {
      border: '1px solid ' + (s.ok ? '#CDE9D5' : '#F5D9C2'),
      background: s.ok ? '#F1F9F3' : '#FDF4EC',
      borderRadius: 10,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, s.n), /*#__PURE__*/React.createElement(AdminIcon, {
    name: s.ok ? 'circle-check' : 'clock',
    size: 18,
    color: s.ok ? '#1F8A4C' : '#D9791F'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: s.ok ? '#1F8A4C' : '#D9791F',
      fontWeight: 600
    }
  }, s.ok ? '제출 완료' : '미제출'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: '#1F2937',
      marginTop: 8
    }
  }, s.h, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#9AA1A9'
    }
  }, " \uAC00\uB2A5\uC2DC\uAC04")))))), stage === 1 && /*#__PURE__*/React.createElement(APanel, {
    title: "\uC81C\uC57D \uC870\uAC74 \uC124\uC815"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: 640
    }
  }, [['중복 근무 제한', '동일 학생이 같은 시간대 중복 배정되지 않도록 합니다.', true], ['최대 연속 근무시간 제한', '연속 근무는 4시간을 넘지 않도록 합니다.', true], ['부서별 인원 선호 반영', '부서가 요청한 선호 인원을 우선 배정합니다.', false], ['수업시간 자동 회피', 'SAINT 수강 정보를 기반으로 수업시간을 제외합니다.', true]].map(([t, d, on]) => /*#__PURE__*/React.createElement("label", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 16px',
      border: '1px solid #E6E8EB',
      borderRadius: 10,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: on,
    style: {
      width: 18,
      height: 18,
      accentColor: '#B01116'
    }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, d)))))), stage === 2 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(APanel, {
    title: "\uC2DC\uB098\uB9AC\uC624 \uBE44\uAD50"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14
    }
  }, [{
    n: '시나리오 A',
    tag: '충원 우선',
    fill: '94%',
    conf: '0건',
    note: '빈 슬롯 최소화. 일부 학생 연속 근무 발생.',
    best: true
  }, {
    n: '시나리오 B',
    tag: '균형 배분',
    fill: '88%',
    conf: '1건',
    note: '학생별 근무시간 균등. 1개 슬롯 미충원.',
    best: false
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    style: {
      border: '1.5px solid ' + (s.best ? '#B01116' : '#E6E8EB'),
      borderRadius: 10,
      padding: 18,
      position: 'relative'
    }
  }, s.best && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -10,
      left: 16,
      background: '#B01116',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 10px',
      borderRadius: 5
    }
  }, "\uCD94\uCC9C"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, s.n), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#6B7280',
      background: '#F1F3F5',
      padding: '3px 10px',
      borderRadius: 5
    }
  }, s.tag)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, "\uCDA9\uC6D0\uC728"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: '#1F8A4C'
    }
  }, s.fill)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, "\uCDA9\uB3CC"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: s.conf === '0건' ? '#1F8A4C' : '#D9791F'
    }
  }, s.conf))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      lineHeight: 1.5,
      marginBottom: 14
    }
  }, s.note), /*#__PURE__*/React.createElement(AButton, {
    variant: s.best ? 'primary' : 'outline',
    size: "sm"
  }, "\uC774 \uC2DC\uB098\uB9AC\uC624 \uC120\uD0DD"))))), /*#__PURE__*/React.createElement(APanel, {
    title: "\uC8FC\uAC04 \uADFC\uBB34 \uC2DC\uAC04\uD45C (\uC2DC\uB098\uB9AC\uC624 A)"
  }, /*#__PURE__*/React.createElement(ATimeGrid, {
    redSlots: ['월-10:00', '월-11:00', '화-10:00', '수-10:00', '수-11:00', '목-14:00', '금-10:00', '금-11:00'],
    redLabel: "\uBC30\uC815",
    legend: false
  }))), stage === 3 && /*#__PURE__*/React.createElement(APanel, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '30px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 72,
      height: 72,
      borderRadius: '50%',
      background: '#E7F4EA',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "calendar-check",
    size: 34,
    color: "#1F8A4C"
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 8px',
      fontSize: 22,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uADFC\uBB34 \uC2DC\uAC04\uD45C\uB97C \uD655\uC815\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 20px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uC2DC\uB098\uB9AC\uC624 A \xB7 \uCDA9\uC6D0\uC728 94% \xB7 \uCDA9\uB3CC 0\uAC74 \xB7 \uD655\uC815 \uC2DC \uD559\uC0DD\uC5D0\uAC8C \uC54C\uB9BC\uC774 \uC804\uC1A1\uB429\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(AButton, {
    variant: "outline",
    onClick: () => setStage(2)
  }, "\uB2E4\uC2DC \uAC80\uD1A0"), /*#__PURE__*/React.createElement(AButton, {
    variant: "primary",
    icon: "check"
  }, "\uC2DC\uAC04\uD45C \uD655\uC815")))));
}
window.ScheduleModule = ScheduleModule;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/ScheduleModule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/SelectionModule.jsx
try { (() => {
// 학생 선발 (split: 지원자 목록 | 상세 + 적합도 분석 rationale)
function SelectionModule() {
  const {
    AdminIcon,
    ABadge,
    AButton
  } = window;
  const [selId, setSelId] = React.useState(window.applicants[0].id);
  const [decisions, setDecisions] = React.useState({});
  const a = window.applicants.find(x => x.id === selId);
  const decide = (id, d) => setDecisions(prev => ({
    ...prev,
    [id]: d
  }));
  const curDecision = decisions[selId];
  const fitColor = f => f >= 85 ? '#1F8A4C' : f >= 70 ? '#D9791F' : '#B8860B';
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uD559\uC0DD \uC120\uBC1C"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uD559\uC0DD\uC9C0\uC6D0\uD300 \xB7 \uD589\uC815 \uC5C5\uBB34 \uBCF4\uC870 (\uC9C0\uC6D0 ", window.applicants.length, "\uBA85) \xB7 \uC801\uD569\uB3C4 \uBD84\uC11D\uC740 \uCC38\uACE0\uC6A9 \uCD94\uCC9C\uC774\uBA70, \uCD5C\uC885 \uACB0\uC815\uC740 \uB2F4\uB2F9\uC790\uAC00 \uD569\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '340px 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      borderBottom: '1px solid #EEF0F2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, "\uC9C0\uC6D0\uC790 \uBAA9\uB85D"), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      height: 32,
      padding: '0 10px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 6,
      fontSize: 12,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC801\uD569\uB3C4\uC21C ", /*#__PURE__*/React.createElement(AdminIcon, {
    name: "chevron-down",
    size: 14,
    color: "#9AA1A9"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 620,
      overflowY: 'auto'
    }
  }, window.applicants.map(x => {
    const on = x.id === selId;
    const d = decisions[x.id];
    return /*#__PURE__*/React.createElement("button", {
      key: x.id,
      onClick: () => setSelId(x.id),
      style: {
        width: '100%',
        textAlign: 'left',
        display: 'block',
        padding: '14px 16px',
        border: 'none',
        borderLeft: '3px solid ' + (on ? '#B01116' : 'transparent'),
        borderBottom: '1px solid #F1F3F5',
        background: on ? '#FDF6F6' : '#fff',
        cursor: 'pointer',
        font: 'inherit'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: '#1F2937'
      }
    }, x.name), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, d && /*#__PURE__*/React.createElement(ABadge, {
      status: d
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 800,
        color: fitColor(x.fit)
      }
    }, x.fit))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: '#9AA1A9'
      }
    }, x.sid, " \xB7 ", x.major, " ", x.grade), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 8,
        height: 5,
        background: '#EEF0F2',
        borderRadius: 3,
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: '100%',
        width: x.fit + '%',
        background: fitColor(x.fit),
        borderRadius: 3
      }
    })));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 20,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, a.name), curDecision && /*#__PURE__*/React.createElement(ABadge, {
    status: curDecision
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      marginTop: 4
    }
  }, a.sid, " \xB7 ", a.major, " ", a.grade, " \xB7 \uC9C0\uC6D0\uC77C ", a.applyDate)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      fontWeight: 600
    }
  }, "\uD559\uC810(GPA)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, a.gpa))), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid #E6E8EB',
      borderRadius: 10,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 18px',
      background: '#F8F9FB',
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "sparkles",
    size: 17,
    color: "#6D4FCB"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#3A4048'
    }
  }, "\uC801\uD569\uB3C4 \uBD84\uC11D"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4,
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, "\uCC38\uACE0\uC6A9 \uCD94\uCC9C \xB7 \uCD5C\uC885 \uACB0\uC815\uC740 \uB2F4\uB2F9\uC790"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#6B7280'
    }
  }, "\uC801\uD569\uB3C4"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: fitColor(a.fit)
    }
  }, a.fit, "\uC810"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: fitColor(a.fit),
      background: fitColor(a.fit) + '18',
      padding: '2px 8px',
      borderRadius: 5
    }
  }, a.fitLabel))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#1F8A4C',
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "check-circle-2",
    size: 15,
    color: "#1F8A4C"
  }), " \uC870\uAC74 \uC77C\uCE58"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '0 0 18px',
      padding: 0,
      listStyle: 'none'
    }
  }, a.matches.map(m => /*#__PURE__*/React.createElement("li", {
    key: m,
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 13,
      color: '#3A4048',
      lineHeight: 1.6,
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "check",
    size: 14,
    color: "#1F8A4C",
    style: {
      marginTop: 2,
      flexShrink: 0
    }
  }), " ", m))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#D9791F',
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "triangle-alert",
    size: 15,
    color: "#D9791F"
  }), " \uD655\uC778 \uD544\uC694"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, a.warnings.map(w => /*#__PURE__*/React.createElement("li", {
    key: w,
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 13,
      color: '#3A4048',
      lineHeight: 1.6,
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "dot",
    size: 14,
    color: "#D9791F",
    style: {
      marginTop: 2,
      flexShrink: 0
    }
  }), " ", w))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: 12,
      background: '#F3F0FC',
      borderRadius: 8,
      marginTop: 16,
      fontSize: 13,
      color: '#5B4B9E',
      lineHeight: 1.6
    }
  }, /*#__PURE__*/React.createElement(AdminIcon, {
    name: "info",
    size: 15,
    color: "#6D4FCB",
    style: {
      marginTop: 1,
      flexShrink: 0
    }
  }), "\uC774 \uC810\uC218\uB294 \uD559\uC810\xB7\uADFC\uBB34 \uAC00\uB2A5 \uC2DC\uAC04\xB7\uC6B0\uB300 \uC5ED\uB7C9\uC744 \uCC38\uACE0\uD574 \uACC4\uC0B0\uD55C \uCD94\uCC9C\uAC12\uC785\uB2C8\uB2E4. \uC120\uBC1C \uC5EC\uBD80\uB294 \uB2F4\uB2F9\uC790\uAC00 \uCD5C\uC885 \uD310\uB2E8\uD558\uC138\uC694."))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#3A4048',
      marginBottom: 8
    }
  }, "\uAD00\uB9AC\uC790 \uBA54\uBAA8"), /*#__PURE__*/React.createElement("textarea", {
    defaultValue: a.note,
    placeholder: "\uAC80\uD1A0 \uC758\uACAC\uC744 \uB0A8\uAE30\uC138\uC694.",
    style: {
      width: '100%',
      height: 64,
      padding: 12,
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      resize: 'none',
      boxSizing: 'border-box'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '16px 22px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#4B5563'
    }
  }, "\uCD5C\uC885 \uC120\uBC1C \uACB0\uC815 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#1F2937'
    }
  }, "\u2014 \uB2F4\uB2F9\uC790\uAC00 \uC9C1\uC811 \uC120\uD0DD")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => decide(selId, '선발'),
    style: {
      height: 44,
      padding: '0 26px',
      background: curDecision === '선발' ? '#1F8A4C' : '#B01116',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC120\uBC1C"), /*#__PURE__*/React.createElement("button", {
    onClick: () => decide(selId, '보류'),
    style: {
      height: 44,
      padding: '0 26px',
      background: curDecision === '보류' ? '#B8860B' : '#fff',
      color: curDecision === '보류' ? '#fff' : '#B8860B',
      border: '1px solid #E4C97A',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uBCF4\uB958"), /*#__PURE__*/React.createElement("button", {
    onClick: () => decide(selId, '탈락'),
    style: {
      height: 44,
      padding: '0 26px',
      background: curDecision === '탈락' ? '#6B7280' : '#fff',
      color: curDecision === '탈락' ? '#fff' : '#6B7280',
      border: '1px solid #D5D8DC',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uD0C8\uB77D"))))));
}
window.SelectionModule = SelectionModule;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/SelectionModule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/SelectionScreen.jsx
try { (() => {
// Admin · Student Selection (review applicants for a post)
function SelectionScreen({
  ns
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Table,
    StatusPill,
    Button,
    Icon,
    Avatar,
    Checkbox,
    Badge,
    Tabs
  } = ns;
  const D = window.STREAM_DATA;
  const [tab, setTab] = React.useState("all");
  const [sel, setSel] = React.useState({});
  const [rows, setRows] = React.useState(D.applicants);
  const shown = tab === "all" ? rows : rows.filter(r => r.status === tab);
  const selectedIds = Object.keys(sel).filter(k => sel[k]);
  const toggle = id => setSel(s => ({
    ...s,
    [id]: !s[id]
  }));
  const setStatus = (id, status) => setRows(rs => rs.map(r => r.id === id ? {
    ...r,
    status
  } : r));
  const columns = [{
    key: "_sel",
    header: /*#__PURE__*/React.createElement(Checkbox, null),
    width: 40,
    render: (_, r) => /*#__PURE__*/React.createElement(Checkbox, {
      checked: !!sel[r.id],
      onChange: () => toggle(r.id)
    })
  }, {
    key: "name",
    header: "Applicant",
    strong: true,
    render: v => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 9
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: v,
      size: 28
    }), " ", v)
  }, {
    key: "sid",
    header: "Student ID",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "major",
    header: "Major"
  }, {
    key: "year",
    header: "Yr",
    align: "center"
  }, {
    key: "gpa",
    header: "GPA",
    align: "center",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "score",
    header: "Match",
    align: "center",
    render: v => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 42,
        height: 6,
        borderRadius: 999,
        background: "var(--neutral-100)",
        overflow: "hidden",
        display: "inline-block"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        height: "100%",
        width: v + "%",
        background: v >= 85 ? "var(--success)" : v >= 75 ? "var(--warning)" : "var(--neutral-400)",
        borderRadius: 999
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular",
      style: {
        fontSize: "var(--fs-caption)",
        color: "var(--text-muted)"
      }
    }, v))
  }, {
    key: "status",
    header: "Decision",
    render: v => /*#__PURE__*/React.createElement(StatusPill, {
      status: v
    })
  }, {
    key: "id",
    header: "",
    align: "right",
    render: (_, r) => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 6,
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary",
      onClick: () => setStatus(r.id, "selected")
    }, "Select"), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "ghost",
      onClick: () => setStatus(r.id, "rejected")
    }, "Reject"))
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Recruitment",
        href: "#"
      }, {
        label: "Central Library — Selection"
      }]
    }),
    title: "Student Selection",
    description: "Central Library \u2014 Reference Desk Assistant \xB7 4 openings \xB7 18 applicants."
  }), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 16px 0",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    active: tab,
    onChange: setTab,
    tabs: [{
      id: "all",
      label: "All",
      badge: rows.length
    }, {
      id: "submitted",
      label: "New"
    }, {
      id: "screening",
      label: "Screening"
    }, {
      id: "selected",
      label: "Selected"
    }, {
      id: "waitlist",
      label: "Waitlist"
    }]
  })), selectedIds.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 16px",
      background: "var(--sogang-red-50)",
      borderBottom: "1px solid var(--sogang-red-100)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-sm)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--sogang-red)"
    }
  }, selectedIds.length, " selected"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => {
      selectedIds.forEach(id => setStatus(id, "selected"));
      setSel({});
    }
  }, "Select all"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => {
      selectedIds.forEach(id => setStatus(id, "waitlist"));
      setSel({});
    }
  }, "Waitlist"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => setSel({})
  }, "Clear")), /*#__PURE__*/React.createElement(Table, {
    columns: columns,
    data: shown,
    rowKey: "id",
    empty: "No applicants in this stage"
  })));
}
window.SelectionScreen = SelectionScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/SelectionScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/StudentsModule.jsx
try { (() => {
// 학생 관리 (선발 학생 목록 + 상세: 근무현황/배정시간/대타이력/관리자 메모)
function StudentsModule() {
  const {
    AdminIcon,
    ABadge,
    ATimeGrid
  } = window;
  const [selId, setSelId] = React.useState(window.workers[0].id);
  const w = window.workers.find(x => x.id === selId);
  const th = (t, a) => /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: a || 'left',
      whiteSpace: 'nowrap'
    }
  }, t);
  const stat = (label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: '#F8F9FB',
      border: '1px solid #EEF0F2',
      borderRadius: 10,
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      fontWeight: 600,
      marginBottom: 4
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uD559\uC0DD \uAD00\uB9AC"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uC120\uBC1C\uB41C \uADFC\uB85C \uD559\uC0DD\uC758 \uADFC\uBB34 \uD604\uD669\uACFC \uBC30\uC815 \uC2DC\uAC04, \uB300\uD0C0 \uC774\uB825\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.4fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      borderBottom: '1px solid #EEF0F2',
      fontSize: 14,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, "\uC120\uBC1C \uD559\uC0DD (", window.workers.length, "\uBA85)"), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6'
    }
  }, th('이름'), th('부서'), th('배정', 'center'), th('출결', 'center'))), /*#__PURE__*/React.createElement("tbody", null, window.workers.map(x => {
    const on = x.id === selId;
    return /*#__PURE__*/React.createElement("tr", {
      key: x.id,
      onClick: () => setSelId(x.id),
      style: {
        borderBottom: '1px solid #F1F3F5',
        background: on ? '#FDF6F6' : '#fff',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '13px 16px',
        borderLeft: '3px solid ' + (on ? '#B01116' : 'transparent')
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: '#1F2937'
      }
    }, x.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: '#9AA1A9'
      }
    }, x.sid)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '13px 16px',
        fontSize: 13,
        color: '#4B5563'
      }
    }, x.dept), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '13px 16px',
        fontSize: 13,
        color: '#4B5563',
        textAlign: 'center'
      }
    }, "\uC8FC ", x.assigned, "h"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '13px 16px',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement(ABadge, {
      status: x.attendance === '정상' ? '정상' : '검토중'
    })));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 20,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, w.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      marginTop: 4
    }
  }, w.sid, " \xB7 ", w.major, " \xB7 ", w.dept, " \xB7 ", w.role)), /*#__PURE__*/React.createElement(ABadge, {
    status: w.attendance === '정상' ? '정상' : '검토중'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 20
    }
  }, stat('주당 배정시간', w.assigned + '시간'), stat('누적 근무시간', w.worked + '시간'), stat('시급', '₩' + w.rate), stat('급여 지급', w.pay)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#3A4048',
      marginBottom: 12
    }
  }, "\uBC30\uC815 \uADFC\uBB34 \uC2DC\uAC04"), /*#__PURE__*/React.createElement(ATimeGrid, {
    redSlots: ['월-10:00', '월-11:00', '수-10:00', '수-11:00', '금-10:00'],
    redLabel: "\uADFC\uBB34",
    legend: false
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "\uB300\uD0C0 \uC774\uB825 (", w.subs, "\uAC74)"), w.subs > 0 ? /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6'
    }
  }, th('날짜'), th('시간'), th('사유'), th('상태', 'center'))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      borderBottom: '1px solid #F1F3F5'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, "2026.05.28"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, "10:00-13:00"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, "\uC218\uAC15\uC2E0\uCCAD"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(ABadge, {
    status: "\uBBF8\uCC98\uB9AC"
  }))))) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      padding: '8px 0'
    }
  }, "\uB300\uD0C0 \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 12px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "\uAD00\uB9AC\uC790 \uBA54\uBAA8"), /*#__PURE__*/React.createElement("textarea", {
    defaultValue: "\uC131\uC2E4\uD558\uACE0 \uC815\uC2DC \uCD9C\uADFC \uC591\uD638. \uBB38\uC11C \uC815\uB9AC \uC815\uD655\uB3C4 \uB192\uC74C.",
    style: {
      width: '100%',
      height: 72,
      padding: 12,
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      resize: 'none',
      boxSizing: 'border-box'
    }
  })))));
}
window.StudentsModule = StudentsModule;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/StudentsModule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/StudentsScreen.jsx
try { (() => {
// Admin · Student Management (active workers)
function StudentsScreen({
  ns
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Table,
    StatusPill,
    Button,
    IconButton,
    Icon,
    Avatar,
    Input,
    Select,
    StatCard
  } = ns;
  const D = window.STREAM_DATA;
  const columns = [{
    key: "name",
    header: "Student",
    strong: true,
    render: v => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 9
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: v,
      size: 28
    }), " ", v)
  }, {
    key: "sid",
    header: "Student ID",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "dept",
    header: "Department"
  }, {
    key: "role",
    header: "Role"
  }, {
    key: "hours",
    header: "Term hours",
    align: "right",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v.toFixed(1))
  }, {
    key: "attendance",
    header: "Attendance",
    align: "center",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "status",
    header: "Today",
    render: v => /*#__PURE__*/React.createElement(StatusPill, {
      status: v
    })
  }, {
    key: "id",
    header: "",
    align: "right",
    render: () => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 4,
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      label: "View profile"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "user",
      size: 16
    })), /*#__PURE__*/React.createElement(IconButton, {
      label: "Message"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "mail",
      size: 16
    })))
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Student Management"
      }]
    }),
    title: "Student Management",
    description: "Active work-study students across your departments this term.",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "download",
        size: 15
      })
    }, "Export roster")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Active students",
    value: D.workers.length,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "users",
      size: 18
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Avg attendance",
    value: "94.8",
    unit: "%",
    deltaTone: "up",
    delta: "+1.2 pts",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "check-circle-2",
      size: 18
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Total term hours",
    value: "199",
    unit: "hrs",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "clock",
      size: 18
    })
  })), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      padding: "14px 16px",
      borderBottom: "1px solid var(--border-subtle)",
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 200
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 15
    }),
    placeholder: "Search students"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 170
    }
  }, /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    defaultValue: "all"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All departments"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 150
    }
  }, /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    defaultValue: "all"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All status"), /*#__PURE__*/React.createElement("option", null, "Present"), /*#__PURE__*/React.createElement("option", null, "Absent")))), /*#__PURE__*/React.createElement(Table, {
    columns: columns,
    data: D.workers,
    rowKey: "id"
  })));
}
window.StudentsScreen = StudentsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/StudentsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/SubstituteModule.jsx
try { (() => {
// 대타 요청 (요청 목록 → 후보 검색 → 승인/반려 → 근무표 반영)
function SubstituteModule() {
  const {
    AdminIcon,
    ABadge,
    AStatCard,
    AButton,
    APanel
  } = window;
  const [stage, setStage] = React.useState('list'); // list | search | done
  const [sel, setSel] = React.useState(null);
  const [picked, setPicked] = React.useState(null);
  const th = (t, a) => /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: a || 'left',
      whiteSpace: 'nowrap'
    }
  }, t);
  if (stage === 'search' && sel) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
      onClick: () => setStage('list'),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        fontSize: 14,
        color: '#4B5563',
        cursor: 'pointer',
        font: 'inherit',
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement(AdminIcon, {
      name: "chevron-left",
      size: 18,
      color: "#6B7280"
    }), " \uC694\uCCAD \uBAA9\uB85D\uC73C\uB85C"), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: '0 0 6px',
        fontSize: 24,
        fontWeight: 800,
        color: '#1F2937'
      }
    }, "\uB300\uD0C0 \uD6C4\uBCF4 \uAC80\uC0C9"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 20px',
        fontSize: 14,
        color: '#6B7280'
      }
    }, "\uC694\uCCAD \uC870\uAC74\uC5D0 \uB9DE\uB294 \uB300\uD0C0 \uD6C4\uBCF4\uB97C \uD655\uC778\uD558\uACE0 \uBC30\uC815\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: 18,
        alignItems: 'start'
      }
    }, /*#__PURE__*/React.createElement(APanel, {
      title: "\uC694\uCCAD \uC815\uBCF4"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 14
      }
    }, [['요청자', sel.requester + ' (' + sel.dept + ')'], ['근무일', sel.date], ['시간', sel.time], ['사유', sel.reason], ['요청일', sel.reqDate]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        display: 'flex',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 56,
        color: '#9AA1A9',
        fontWeight: 600
      }
    }, k), /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#1F2937',
        fontWeight: 600
      }
    }, v))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        padding: 12,
        background: '#F8F9FB',
        borderRadius: 8,
        marginTop: 4,
        fontSize: 12,
        color: '#6B7280',
        lineHeight: 1.5
      }
    }, /*#__PURE__*/React.createElement(AdminIcon, {
      name: "info",
      size: 14,
      color: "#9AA1A9",
      style: {
        marginTop: 1,
        flexShrink: 0
      }
    }), " \uD574\uB2F9 \uC2DC\uAC04\uC5D0 \uC774\uBBF8 \uADFC\uBB34 \uC911\uC778 \uD559\uC0DD\uC740 \uD6C4\uBCF4\uC5D0\uC11C \uC790\uB3D9 \uC81C\uC678\uB429\uB2C8\uB2E4."))), /*#__PURE__*/React.createElement(APanel, {
      title: "\uC801\uD569 \uD6C4\uBCF4"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, window.subCandidates.map(c => {
      const on = picked === c.name;
      return /*#__PURE__*/React.createElement("div", {
        key: c.name,
        style: {
          border: '1px solid ' + (on ? '#B01116' : '#E6E8EB'),
          background: on ? '#FDF6F6' : '#fff',
          borderRadius: 10,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#EEF1F4',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement(AdminIcon, {
        name: "user",
        size: 19,
        color: "#5B6570"
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 15,
          fontWeight: 700,
          color: '#1F2937'
        }
      }, c.name), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          color: '#9AA1A9'
        }
      }, c.dept), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: c.fit === '높음' ? '#1F8A4C' : '#D9791F',
          background: (c.fit === '높음' ? '#1F8A4C' : '#D9791F') + '18',
          padding: '2px 8px',
          borderRadius: 5
        }
      }, "\uC801\uD569\uB3C4 ", c.fit)), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: '#6B7280',
          marginTop: 4
        }
      }, c.reason)), /*#__PURE__*/React.createElement(AButton, {
        variant: on ? 'primary' : 'outline',
        size: "sm",
        onClick: () => setPicked(c.name)
      }, on ? '선택됨' : '선택'));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 18,
        paddingTop: 18,
        borderTop: '1px solid #EEF0F2'
      }
    }, /*#__PURE__*/React.createElement(AButton, {
      variant: "danger",
      icon: "x"
    }, "\uC694\uCCAD \uBC18\uB824"), /*#__PURE__*/React.createElement(AButton, {
      variant: "primary",
      icon: "check",
      onClick: () => picked && setStage('done')
    }, "\uB300\uD0C0 \uC2B9\uC778 \xB7 \uADFC\uBB34\uD45C \uBC18\uC601")))));
  }
  if (stage === 'done') {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: '0 0 20px',
        fontSize: 24,
        fontWeight: 800,
        color: '#1F2937'
      }
    }, "\uB300\uD0C0 \uC2B9\uC778 \uC644\uB8CC"), /*#__PURE__*/React.createElement(APanel, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '30px 0'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: '#E7F4EA',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement(AdminIcon, {
      name: "check",
      size: 34,
      color: "#1F8A4C",
      strokeWidth: 2.5
    })), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: '0 0 8px',
        fontSize: 22,
        fontWeight: 800,
        color: '#1F2937'
      }
    }, "\uB300\uD0C0 \uC2E0\uCCAD\uC774 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 20px',
        fontSize: 14,
        color: '#6B7280'
      }
    }, sel.requester, " \u2192 ", picked, " \xB7 ", sel.date, " ", sel.time, /*#__PURE__*/React.createElement("br", null), "\uADFC\uBB34 \uC2DC\uAC04\uD45C\uAC00 \uC5C5\uB370\uC774\uD2B8\uB418\uACE0 \uC591\uCE21\uC5D0 \uC54C\uB9BC\uC774 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement(AButton, {
      variant: "primary",
      onClick: () => {
        setStage('list');
        setPicked(null);
      }
    }, "\uC694\uCCAD \uBAA9\uB85D\uC73C\uB85C"))));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uB300\uD0C0 \uC694\uCCAD"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uD559\uC0DD \uB300\uD0C0 \uC694\uCCAD\uC744 \uAC80\uD1A0\uD558\uACE0 \uD6C4\uBCF4 \uBC30\uC815 \uD6C4 \uC2B9\uC778\xB7\uBC18\uB824\uD569\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginBottom: 20
    }
  }, window.subStats.map(s => /*#__PURE__*/React.createElement(AStatCard, {
    key: s.key,
    stat: s
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6',
      borderBottom: '1px solid #E6E8EB'
    }
  }, th('요청자 / 부서'), th('근무일', 'center'), th('시간', 'center'), th('사유'), th('요청일', 'center'), th('상태', 'center'), th('처리', 'center'))), /*#__PURE__*/React.createElement("tbody", null, window.subRequests.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    style: {
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, r.requester), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, r.dept)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.date), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.time), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.reason), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center',
      fontSize: 13,
      color: '#9AA1A9'
    }
  }, r.reqDate), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(ABadge, {
    status: r.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 16px',
      textAlign: 'center'
    }
  }, r.status === '미처리' ? /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSel(r);
      setPicked(null);
      setStage('search');
    },
    style: {
      height: 32,
      padding: '0 14px',
      background: '#B01116',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uD6C4\uBCF4 \uAC80\uC0C9") : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, r.approver, " \uCC98\uB9AC"))))))));
}
window.SubstituteModule = SubstituteModule;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/SubstituteModule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/admin-data.js
try { (() => {
// STREAM 관리자 콘솔 — mock data (plain script, window exports)

const adminSaintNav = ['인사', '예산', '자산', '구매', '시설', 'BI/평가'];
const adminMenu = [{
  id: 'posts',
  label: '교내 근로 모집 공고',
  icon: 'megaphone'
}, {
  id: 'selection',
  label: '학생 선발',
  icon: 'user-check'
}, {
  id: 'students',
  label: '학생 관리',
  icon: 'users'
}, {
  id: 'schedule',
  label: '근로 시간표',
  icon: 'calendar-days'
}, {
  id: 'substitute',
  label: '대타 요청',
  icon: 'repeat'
}, {
  id: 'dashboard',
  label: '운영 대시보드',
  icon: 'layout-dashboard'
}];
const adminUser = {
  name: '김서강',
  role: '근로 담당',
  dept: '학생지원팀'
};

// ---- 모집 공고 ----
const adminPostStats = [{
  key: 'total',
  label: '전체 공고',
  value: '12건',
  sub: '이번 학기 등록',
  icon: 'files',
  tone: 'neutral'
}, {
  key: 'open',
  label: '모집중',
  value: '7건',
  sub: '현재 지원 접수중',
  icon: 'megaphone',
  tone: 'green'
}, {
  key: 'soon',
  label: '마감임박',
  value: '3건',
  sub: '3일 이내 마감',
  icon: 'clock',
  tone: 'orange'
}, {
  key: 'closed',
  label: '모집완료',
  value: '2건',
  sub: '선발 진행 예정',
  icon: 'circle-check',
  tone: 'blue'
}];
const adminPosts = [{
  id: 'P001',
  status: '모집중',
  dept: '학생지원팀',
  title: '행정 업무 보조',
  headcount: 2,
  applicants: 12,
  weekly: '최대 15시간',
  deadline: '2026.05.25',
  reg: '2026.05.02'
}, {
  id: 'P002',
  status: '모집중',
  dept: '로욜라도서관',
  title: '참고서비스 제공',
  headcount: 1,
  applicants: 8,
  weekly: '최대 15시간',
  deadline: '2026.05.25',
  reg: '2026.05.01'
}, {
  id: 'P003',
  status: '마감임박',
  dept: '입학처',
  title: '논술 보조',
  headcount: 2,
  applicants: 4,
  weekly: '최대 15시간',
  deadline: '2026.05.23',
  reg: '2026.04.28'
}, {
  id: 'P004',
  status: '모집완료',
  dept: '종합봉사실',
  title: '증명서·학생증 발급 보조',
  headcount: 2,
  applicants: 15,
  weekly: '최대 10시간',
  deadline: '2026.05.20',
  reg: '2026.04.20'
}, {
  id: 'P005',
  status: '모집중',
  dept: '국제교류팀',
  title: '교환학생 지원 보조',
  headcount: 1,
  applicants: 3,
  weekly: '최대 12시간',
  deadline: '2026.05.27',
  reg: '2026.05.03'
}];

// ---- 학생 선발 ----
const applicants = [{
  id: 'S1',
  name: '안희진',
  sid: '202312345',
  major: '경영학과',
  grade: '3학년',
  gpa: 3.82,
  fit: 92,
  fitLabel: '높음',
  status: '검토중',
  applyDate: '2026.05.20',
  matches: ['학점 기준 충족 (3.5 이상)', '월·수 오전 근무 가능 — 공고 요구 시간대와 일치', '엑셀 활용 가능 (우대 역량 보유)'],
  warnings: ['교내 근로 경험 없음 — 초기 적응 지원 권장'],
  note: '지원 동기 구체적이며 근무 가능 시간이 공고와 잘 맞음.'
}, {
  id: 'S2',
  name: '박민수',
  sid: '202209999',
  major: '물리학과',
  grade: '4학년',
  gpa: 2.95,
  fit: 64,
  fitLabel: '보통',
  status: '검토중',
  applyDate: '2026.05.19',
  matches: ['근로장학 2회 이수 — 행정 업무 경험 보유', '장기 근무 가능'],
  warnings: ['학점 3.0 미만 — 학사 경고 이력 확인 필요', '공고 요구 시간대(오전)와 일부 불일치'],
  note: '경험은 풍부하나 가능 시간대 조정 필요.'
}, {
  id: 'S3',
  name: '이영희',
  sid: '202105678',
  major: '영문학과',
  grade: '2학년',
  gpa: 3.51,
  fit: 78,
  fitLabel: '높음',
  status: '보류',
  applyDate: '2026.05.18',
  matches: ['학점 기준 충족', '영어 가능 — 국제 업무 우대'],
  warnings: ['타 부서 근로 중복 지원 — 중복 배정 불가 확인 필요'],
  note: '중복 지원 건 확인 후 재검토.'
}, {
  id: 'S4',
  name: '최준호',
  sid: '202411223',
  major: '컴퓨터공학',
  grade: '1학년',
  gpa: 4.10,
  fit: 71,
  fitLabel: '보통',
  status: '검토중',
  applyDate: '2026.05.21',
  matches: ['학점 최상위권', '전산 활용 능숙 (우대)'],
  warnings: ['1학년 — 첫 근로, 근무 지속성 확인 필요'],
  note: ''
}];

// ---- 학생 관리 ----
const workers = [{
  id: 'W1',
  name: '안희진',
  sid: '202312345',
  major: '경영학과',
  dept: '학생지원팀',
  role: '행정 업무 보조',
  assigned: 8,
  worked: 24,
  rate: '10,850',
  pay: '1월 지급 완료',
  attendance: '정상',
  subs: 1
}, {
  id: 'W2',
  name: '정하늘',
  sid: '202208765',
  major: '사회학과',
  dept: '로욜라도서관',
  role: '자료실 근로',
  assigned: 10,
  worked: 30,
  rate: '10,850',
  pay: '1월 지급 완료',
  attendance: '정상',
  subs: 0
}, {
  id: 'W3',
  name: '김도윤',
  sid: '202311111',
  major: '화학과',
  dept: '입학처',
  role: '논술 보조',
  assigned: 6,
  worked: 12,
  rate: '11,000',
  pay: '지급 예정',
  attendance: '지각 1회',
  subs: 2
}];

// ---- 대타 요청 ----
const subStats = [{
  key: 'pending',
  label: '미처리 요청',
  value: '3건',
  sub: '승인 대기',
  icon: 'clock',
  tone: 'orange'
}, {
  key: 'approved',
  label: '승인 완료',
  value: '8건',
  sub: '이번 학기',
  icon: 'circle-check',
  tone: 'green'
}, {
  key: 'rejected',
  label: '반려',
  value: '1건',
  sub: '이번 학기',
  icon: 'circle-x',
  tone: 'neutral'
}, {
  key: 'conflict',
  label: '근무표 충돌',
  value: '1건',
  sub: '확인 필요',
  icon: 'triangle-alert',
  tone: 'red'
}];
const subRequests = [{
  id: 'R1',
  requester: '안희진',
  dept: '학생지원팀',
  date: '2026.05.28',
  time: '10:00-13:00',
  reason: '수강신청',
  status: '미처리',
  reqDate: '2026.05.22'
}, {
  id: 'R2',
  requester: '김도윤',
  dept: '입학처',
  date: '2026.05.29',
  time: '09:00-12:00',
  reason: '병원 방문',
  status: '미처리',
  reqDate: '2026.05.21'
}, {
  id: 'R3',
  requester: '정하늘',
  dept: '로욜라도서관',
  date: '2026.05.26',
  time: '14:00-17:00',
  reason: '가족 행사',
  status: '승인',
  approver: '김서강',
  reqDate: '2026.05.19'
}];
const subCandidates = [{
  name: '박민수',
  dept: '학생지원팀',
  fit: '높음',
  reason: '해당 시간 미근무 · 가능 시간 내 포함 · 동일 부서 경험'
}, {
  name: '최준호',
  dept: '학생지원팀',
  fit: '보통',
  reason: '해당 시간 미근무 · 당일 14:00 근무 예정(연속 근무 가능)'
}];

// ---- 운영 대시보드 ----
const dashStats = [{
  key: 'rate',
  label: '충원율',
  value: '69%',
  sub: '11 / 16명 배정',
  icon: 'trending-up',
  tone: 'green'
}, {
  key: 'appl',
  label: '지원자 수',
  value: '39명',
  sub: '이번 학기 누적',
  icon: 'users',
  tone: 'blue'
}, {
  key: 'pending',
  label: '미처리 요청',
  value: '3건',
  sub: '대타 승인 대기',
  icon: 'clock',
  tone: 'orange'
}, {
  key: 'conflict',
  label: '근무표 충돌',
  value: '1건',
  sub: '조정 필요',
  icon: 'triangle-alert',
  tone: 'red'
}];
const deptFill = [{
  dept: '도서관',
  filled: 5,
  total: 5
}, {
  dept: '학생식당',
  filled: 6,
  total: 8
}, {
  dept: '학생지원팀',
  filled: 2,
  total: 2
}, {
  dept: '입학처',
  filled: 1,
  total: 2
}, {
  dept: '시설관리팀',
  filled: 0,
  total: 3
}];
const subTrend = [{
  month: '3월',
  count: 2
}, {
  month: '4월',
  count: 4
}, {
  month: '5월',
  count: 3
}];
const adminTimeRows = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const adminDayCols = ['월', '화', '수', '목', '금'];
Object.assign(window, {
  adminSaintNav,
  adminMenu,
  adminUser,
  adminPostStats,
  adminPosts,
  applicants,
  workers,
  subStats,
  subRequests,
  subCandidates,
  dashStats,
  deptFill,
  subTrend,
  adminTimeRows,
  adminDayCols
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/admin-data.js", error: String((e && e.message) || e) }); }

// ui_kits/student/ApplicationDetailScreen.jsx
try { (() => {
// 지원 상세 (application detail)
function ApplicationDetailScreen({
  onBack
}) {
  const {
    Icon,
    StatusBadge,
    TimeGrid
  } = window;
  const d = window.appDetail;
  const steps = [{
    label: '제출완료',
    sub: '2026.05.20 15:30'
  }, {
    label: '검토중',
    sub: '담당자가 검토 중입니다'
  }, {
    label: '면접',
    sub: '면접이 진행될 예정입니다'
  }, {
    label: '결과',
    sub: '최종 결과를 확인하세요'
  }];
  const infoRow = (label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      fontSize: 14,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 64,
      color: '#6B7280',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#1F2937',
      fontWeight: 500,
      flex: 1
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uC9C0\uC6D0 \uC0C1\uC138"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: '#9AA1A9'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 15,
    color: "#B9BFC6"
  }), " \uD648", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 13,
    color: "#C9CED4"
  }), " \uB0B4 \uC9C0\uC6D0 \uD604\uD669", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 13,
    color: "#C9CED4"
  }), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3A4048',
      fontWeight: 600
    }
  }, "\uC9C0\uC6D0 \uC0C1\uC138"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '22px 26px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: '#E7F4EA',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "briefcase",
    size: 26,
    color: "#1F8A4C"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 19,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, d.team, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC',
      margin: '0 4px'
    }
  }, "|"), " ", d.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      marginTop: 4
    }
  }, d.team)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      marginRight: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600
    }
  }, "\uD604\uC7AC \uC0C1\uD0DC"), " ", /*#__PURE__*/React.createElement(StatusBadge, {
    status: d.status
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280'
    }
  }, "\uC9C0\uC6D0\uC77C ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3A4048',
      fontWeight: 600
    }
  }, d.date))), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 42,
      padding: '0 18px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uACF5\uACE0 \uC815\uBCF4 \uBCF4\uAE30 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15,
    color: "#9AA1A9"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '28px 40px',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, steps.map((s, i) => {
    const done = i < d.step,
      active = i === d.step;
    let bg = '#fff',
      bd = '#D5D8DC';
    if (done) {
      bg = '#1F8A4C';
      bd = '#1F8A4C';
    } else if (active) {
      bg = '#fff';
      bd = '#1F8A4C';
    }
    return /*#__PURE__*/React.createElement("div", {
      key: s.label,
      style: {
        flex: 1,
        position: 'relative',
        textAlign: 'center'
      }
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: '50%',
        top: 15,
        width: '100%',
        height: 2,
        background: i <= d.step ? '#1F8A4C' : '#E6E8EB'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        zIndex: 1,
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: bg,
        border: '2px solid ' + bd,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto'
      }
    }, done ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 17,
      color: "#fff",
      strokeWidth: 3
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: active ? '#1F8A4C' : '#D5D8DC'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 700,
        color: done || active ? '#1F2937' : '#9AA1A9',
        marginTop: 10
      }
    }, s.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: '#9AA1A9',
        marginTop: 4
      }
    }, s.sub));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.1fr',
      gap: 18,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 18px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "1. \uC9C0\uC6D0\uC790 \uC815\uBCF4"), infoRow('이름', window.currentUser.name), infoRow('학번', window.currentUser.studentId), infoRow('학과(부)', window.currentUser.major), infoRow('연락처', window.currentUser.phone), infoRow('이메일', window.currentUser.email)), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 18px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "3. \uC81C\uCD9C \uB0B4\uC6A9"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600,
      marginBottom: 8
    }
  }, "\uC9C0\uC6D0 \uB3D9\uAE30"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: '#3A4048',
      lineHeight: 1.7
    }
  }, d.motivation)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600,
      marginBottom: 8
    }
  }, "\uAD00\uB828 \uACBD\uD5D8 \uBC0F \uC5ED\uB7C9"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: '#3A4048',
      lineHeight: 1.7
    }
  }, d.experience)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 18px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "2. \uADFC\uBB34 \uAC00\uB2A5 \uC2DC\uAC04"), /*#__PURE__*/React.createElement(TimeGrid, {
    redSlots: d.classSlots,
    checkSlots: d.availSlots,
    redLabel: "\uC218\uC5C5\uC2DC\uAC04"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 16px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "4. \uCCA8\uBD80 \uC11C\uB958"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 16px',
      border: '1px solid #EDEFF1',
      borderRadius: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 20,
    color: "#B01116"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      color: '#1F2937',
      fontWeight: 600
    }
  }, d.attachment.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9AA1A9'
    }
  }, d.attachment.date), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      width: 70,
      textAlign: 'right'
    }
  }, d.attachment.size), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 18,
    color: "#6B7280"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      height: 48,
      padding: '0 24px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 600,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uB0B4 \uC9C0\uC6D0 \uD604\uD669\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 48,
      padding: '0 40px',
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uACF5\uACE0 \uB2E4\uC2DC \uBCF4\uAE30")));
}
window.ApplicationDetailScreen = ApplicationDetailScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/ApplicationDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/ApplicationFormScreen.jsx
try { (() => {
// 지원서 작성 (application form) — includes submit modal + 지원 완료
function ApplicationFormScreen({
  onBack,
  onDone,
  onGoStatus
}) {
  const {
    Icon,
    TimeGrid
  } = window;
  const [showModal, setShowModal] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const job = window.formJob,
    u = window.currentUser;
  if (submitted) return /*#__PURE__*/React.createElement(SubmitComplete, {
    onGoStatus: onGoStatus,
    onBack: onBack
  });
  const lockedField = (label, value, locked) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    defaultValue: value,
    readOnly: locked,
    style: {
      width: '100%',
      height: 40,
      padding: '0 14px',
      border: '1px solid ' + (locked ? '#E6E8EB' : '#DADEE3'),
      borderRadius: 8,
      fontSize: 14,
      font: 'inherit',
      boxSizing: 'border-box',
      background: locked ? '#F6F7F9' : '#fff',
      color: locked ? '#6B7280' : '#1F2937'
    }
  }), locked && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 14,
    color: "#B9BFC6"
  }))));
  const checkChip = label => /*#__PURE__*/React.createElement("label", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 12px',
      border: '1px solid #E6E8EB',
      borderRadius: 8,
      fontSize: 13,
      color: '#3A4048',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      width: 15,
      height: 15,
      accentColor: '#B01116'
    }
  }), " ", label);
  const summaryItem = (icon, label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: '#9AA1A9',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 13,
    color: "#B9BFC6"
  }), " ", label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uC9C0\uC6D0\uC11C \uC791\uC131"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uD604\uC7AC \uBAA8\uC9D1 \uC911\uC778 \uACF5\uACE0\uB97C \uC120\uD0DD\uD558\uACE0 \uC9C0\uC6D0\uC11C\uB97C \uC791\uC131\uD574 \uC8FC\uC138\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 300px',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "\uC9C0\uC6D0 \uACF5\uACE0 \uC120\uD0DD"), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 46,
      padding: '0 14px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      color: '#1F2937',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, job.team, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC'
    }
  }, "|"), " ", job.title, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 16,
    color: "#9AA1A9"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      borderRadius: '50%',
      background: '#E7F4EA',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "briefcase",
    size: 20,
    color: "#1F8A4C"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, job.team, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC'
    }
  }, "|"), " ", job.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 14
    }
  }, summaryItem('calendar', '근무기간', job.period), summaryItem('clock', '근무시간', job.hours), summaryItem('users', '모집인원', job.headcount), summaryItem('timer', '주당 근무시간', job.weeklyMax), summaryItem('calendar-x', '마감일', job.deadline)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 16px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "1. \uC9C0\uC6D0\uC790 \uC815\uBCF4"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginBottom: 14
    }
  }, lockedField('이름', u.name, true), lockedField('학번', u.studentId, true)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, lockedField('학과(부)', u.major, true)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginBottom: 12
    }
  }, lockedField('연락처', u.phone, false), lockedField('이메일', u.email, false)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: '#9AA1A9',
      lineHeight: 1.6
    }
  }, "\uC774\uB984, \uD559\uBC88, \uD559\uACFC\uB294 SAINT \uD559\uC0DD\uC815\uBCF4\uC640 \uC790\uB3D9 \uC5F0\uB3D9\uB418\uC5B4 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC5F0\uB77D\uCC98\uC640 \uC774\uBA54\uC77C\uB9CC \uC218\uC815 \uAC00\uB2A5\uD569\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 16px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "2. \uC790\uAE30\uC18C\uAC1C\uC11C \uBC0F \uC9C0\uC6D0 \uB3D9\uAE30"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\uC9C0\uC6D0 \uB3D9\uAE30 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#B01116'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    placeholder: "\uD559\uC0DD \uC11C\uBE44\uC2A4\uB97C \uC9C0\uC6D0\uD558\uACE0 \uD589\uC815 \uC5C5\uBB34\uB97C \uBCF4\uC870\uD558\uACE0\uC790 \uD558\uB294 \uB3D9\uAE30\uB97C \uC791\uC131\uD574 \uC8FC\uC138\uC694.",
    style: {
      width: '100%',
      height: 76,
      padding: 12,
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      resize: 'none',
      boxSizing: 'border-box'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 12,
      bottom: 8,
      fontSize: 11,
      color: '#B9BFC6'
    }
  }, "0 / 500\uC790"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\uAD00\uB828 \uACBD\uD5D8 \uBC0F \uC5ED\uB7C9 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#B01116'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    placeholder: "\uBBFC\uC6D0 \uC751\uB300, \uBB38\uC11C \uC815\uB9AC, \uC790\uB8CC \uC785\uB825, \uC11C\uBE44\uC2A4 \uB9C8\uC778\uB4DC, \uC5D1\uC140 \uD65C\uC6A9, \uBB38\uC11C \uC791\uC131 \uACBD\uD5D8 \uB4F1 \uAD00\uB828 \uACBD\uD5D8\uACFC \uC5ED\uB7C9\uC744 \uC791\uC131\uD574 \uC8FC\uC138\uC694.",
    style: {
      width: '100%',
      height: 90,
      padding: 12,
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      resize: 'none',
      boxSizing: 'border-box'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 12,
      bottom: 8,
      fontSize: 11,
      color: '#B9BFC6'
    }
  }, "0 / 1,000\uC790"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.15fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 16px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "3. \uACF5\uACE0\uBCC4 \uD655\uC778 \uC0AC\uD56D"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#4B5563',
      marginBottom: 10
    }
  }, "\uD544\uC218 \uC870\uAC74"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 18
    }
  }, window.formRequired.map(checkChip)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: '#4B5563',
      marginBottom: 10
    }
  }, "\uC6B0\uB300 \uC5ED\uB7C9"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8
    }
  }, window.formPreferred.map(checkChip))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 16px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "4. \uADFC\uBB34 \uAC00\uB2A5 \uC2DC\uAC04"), /*#__PURE__*/React.createElement(TimeGrid, {
    redSlots: window.formClassSlots,
    checkSlots: window.formCheckedSlots,
    redLabel: "\uC218\uC5C5\uC2DC\uAC04"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      height: 46,
      padding: '0 20px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC774\uC804 (\uACF5\uACE0 \uC0C1\uC138\uB85C)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      height: 46,
      padding: '0 22px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC784\uC2DC\uC800\uC7A5"), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 46,
      padding: '0 22px',
      background: '#fff',
      border: '1.5px solid #B01116',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      color: '#B01116',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uBBF8\uB9AC\uBCF4\uAE30"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowModal(true),
    style: {
      height: 46,
      padding: '0 30px',
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC81C\uCD9C\uD558\uAE30")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      position: 'sticky',
      top: 84
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px',
      fontSize: 15,
      fontWeight: 700
    }
  }, "\uACF5\uACE0\uBCC4 \uC8FC\uC694 \uC870\uAC74"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#4B5563',
      marginBottom: 10
    }
  }, "\uD544\uC218 \uC870\uAC74"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginBottom: 16
    }
  }, window.formRequired.map(r => /*#__PURE__*/React.createElement("div", {
    key: r,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: '#3A4048'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle-2",
    size: 15,
    color: "#B01116"
  }), " ", r))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#4B5563',
      marginBottom: 10
    }
  }, "\uC6B0\uB300 \uC5ED\uB7C9"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, window.formPreferred.map(r => /*#__PURE__*/React.createElement("div", {
    key: r,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: '#3A4048'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle-2",
    size: 15,
    color: "#B01116"
  }), " ", r)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px',
      fontSize: 15,
      fontWeight: 700
    }
  }, "AI \uC791\uC131 \uB3C4\uC6C0"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, [['sparkles', '지원 동기 예시 생성'], ['file-text', '관련 경험 예시 생성'], ['pen-line', '역량 키워드 정리'], ['wand-2', '맞춤 문장 다듬기']].map(([ic, label]) => /*#__PURE__*/React.createElement("button", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 42,
      padding: '0 14px',
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 8,
      fontSize: 13,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 16,
    color: "#8A929B"
  }), " ", label)), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      marginTop: 6,
      background: '#F3F0FC',
      border: '1px solid #DED5F5',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      color: '#6D4FCB',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 16,
    color: "#6D4FCB"
  }), " AI \uC791\uC131 \uB3C4\uC6C0 \uC5F4\uAE30"))))), showModal && /*#__PURE__*/React.createElement(SubmitModal, {
    job: job,
    onCancel: () => setShowModal(false),
    onConfirm: () => {
      setShowModal(false);
      setSubmitted(true);
    }
  }));
}
function SubmitModal({
  job,
  onCancel,
  onConfirm
}) {
  const {
    Icon
  } = window;
  const row = (label, value, ok) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      fontSize: 14,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 110,
      color: '#6B7280',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: ok ? '#1F8A4C' : '#1F2937',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, ok && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 15,
    color: "#1F8A4C"
  }), value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(20,24,28,.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 480,
      background: '#fff',
      borderRadius: 16,
      padding: 32,
      position: 'relative',
      boxShadow: '0 20px 48px rgba(0,0,0,.2)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCancel,
    style: {
      position: 'absolute',
      top: 20,
      right: 20,
      background: 'none',
      border: 'none',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 20,
    color: "#9AA1A9"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 60,
      height: 60,
      borderRadius: '50%',
      background: '#FDECEC',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clipboard-check",
    size: 28,
    color: "#B01116"
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 8px',
      fontSize: 20,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uC9C0\uC6D0\uC11C\uB97C \uC81C\uCD9C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280',
      lineHeight: 1.6
    }
  }, "\uC81C\uCD9C \uD6C4\uC5D0\uB294 \uC218\uC815\uD560 \uC218 \uC5C6\uC73C\uBA70,", /*#__PURE__*/React.createElement("br", null), "\uAD00\uB9AC\uC790 \uAC80\uD1A0\uAC00 \uC2DC\uC791\uB429\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid #EDEFF1',
      paddingTop: 18,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#3A4048',
      marginBottom: 14
    }
  }, "\uC9C0\uC6D0 \uC815\uBCF4 \uC694\uC57D"), row('공고명', job.title), row('부서', job.team), row('지원 동기', '작성 완료', true), row('관련 경험 및 역량', '작성 완료', true), row('근무 가능 시간', '월·수 오전 (09:30~12:30)')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: 14,
      background: '#FDF2F2',
      borderRadius: 8,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-circle",
    size: 16,
    color: "#B01116",
    style: {
      marginTop: 2,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#B01116',
      lineHeight: 1.6
    }
  }, "\uC81C\uCD9C \uD6C4\uC5D0\uB294 \uB0B4\uC6A9\uC744 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", /*#__PURE__*/React.createElement("br", null), "\uC785\uB825\uD55C \uB0B4\uC6A9\uC774 \uC815\uD655\uD55C\uC9C0 \uB2E4\uC2DC \uD55C\uBC88 \uD655\uC778\uD574 \uC8FC\uC138\uC694.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCancel,
    style: {
      flex: 1,
      height: 48,
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 600,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement("button", {
    onClick: onConfirm,
    style: {
      flex: 1,
      height: 48,
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uCD5C\uC885 \uC81C\uCD9C"))));
}
function SubmitComplete({
  onGoStatus,
  onBack
}) {
  const {
    Icon
  } = window;
  const row = (label, value, badge) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      fontSize: 15,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 90,
      color: '#6B7280',
      fontWeight: 600,
      textAlign: 'right'
    }
  }, label), badge ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      padding: '3px 10px',
      background: '#E7F4EA',
      color: '#1F8A4C',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 700
    }
  }, value) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#1F2937',
      fontWeight: 600
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uC9C0\uC6D0 \uC644\uB8CC"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uC9C0\uC6D0\uC11C\uAC00 \uC815\uC0C1\uC801\uC73C\uB85C \uC81C\uCD9C\uB418\uC5C8\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '44px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      marginBottom: 30
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 88,
      height: 88,
      borderRadius: '50%',
      border: '4px solid #1F8A4C',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 44,
    color: "#1F8A4C",
    strokeWidth: 2.5
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 10px',
      fontSize: 24,
      fontWeight: 800,
      color: '#1F8A4C'
    }
  }, "\uC9C0\uC6D0\uC11C\uAC00 \uC81C\uCD9C\uB418\uC5C8\uC2B5\uB2C8\uB2E4!"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uC18C\uC911\uD55C \uC9C0\uC6D0 \uAC10\uC0AC\uD569\uB2C8\uB2E4. \uC120\uBC1C \uC9C4\uD589 \uC0C1\uD0DC\uB294 '\uB0B4 \uC9C0\uC6D0 \uD604\uD669'\uC5D0\uC11C \uD655\uC778\uD558\uC2E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 460,
      margin: '0 auto',
      background: '#FAFBFC',
      border: '1px solid #EDEFF1',
      borderRadius: 10,
      padding: '24px 28px',
      marginBottom: 24
    }
  }, row('공고명', '학생지원팀 행정 보조 근로'), row('부서', '학생지원팀'), row('접수 상태', '지원 완료', true), row('접수 일시', '2026.05.20 (화) 15:30'), row('지원자', '안희진 (학번 202312345)')), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 520,
      margin: '0 auto 28px',
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 16,
    color: "#B9BFC6",
    style: {
      marginTop: 2,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none',
      fontSize: 13,
      color: '#6B7280',
      lineHeight: 1.9
    }
  }, /*#__PURE__*/React.createElement("li", null, "\u2022 \uC81C\uCD9C\uD558\uC2E0 \uC9C0\uC6D0\uC11C\uB294 \uB2F4\uB2F9\uC790\uAC00 \uAC80\uD1A0 \uD6C4 \uC120\uBC1C \uC808\uCC28\uAC00 \uC9C4\uD589\uB429\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("li", null, "\u2022 \uC120\uBC1C \uACB0\uACFC\uB294 \uC54C\uB9BC \uBC0F '\uB0B4 \uC9C0\uC6D0 \uD604\uD669'\uC5D0\uC11C \uD655\uC778\uD558\uC2E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("li", null, "\u2022 \uD544\uC694 \uC2DC \uCD94\uAC00 \uC11C\uB958 \uC81C\uCD9C\uC744 \uC694\uCCAD\uB4DC\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4."))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onGoStatus,
    style: {
      height: 48,
      padding: '0 30px',
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uB0B4 \uC9C0\uC6D0 \uD604\uD669 \uBCF4\uAE30"), /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      height: 48,
      padding: '0 30px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 600,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uB2E4\uB978 \uACF5\uACE0 \uBCF4\uAE30"))));
}
window.ApplicationFormScreen = ApplicationFormScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/ApplicationFormScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/ApplicationsScreen.jsx
try { (() => {
// Student · My Applications  (+ application form dialog)
function ApplicationsScreen({
  ns,
  applyPost,
  onCloseDialog
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Table,
    StatusPill,
    Button,
    Icon,
    Dialog,
    FormField,
    Input,
    Select,
    Textarea,
    Checkbox,
    Alert
  } = ns;
  const D = window.STREAM_DATA;
  const columns = [{
    key: "post",
    header: "Position",
    strong: true
  }, {
    key: "dept",
    header: "Department"
  }, {
    key: "submitted",
    header: "Submitted",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "status",
    header: "Status",
    render: v => /*#__PURE__*/React.createElement(StatusPill, {
      status: v
    })
  }, {
    key: "id",
    header: "",
    align: "right",
    render: () => /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconRight: /*#__PURE__*/React.createElement(Icon, {
        name: "chevron-right",
        size: 15
      })
    }, "View")
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "My Applications"
      }]
    }),
    title: "My Applications",
    description: "Track the status of every position you have applied to this term."
  }), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement(Table, {
    columns: columns,
    data: D.applications,
    rowKey: "id"
  })), /*#__PURE__*/React.createElement(Dialog, {
    open: !!applyPost,
    title: "Apply \u2014 work-study position",
    onClose: onCloseDialog,
    width: 520,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onCloseDialog
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      onClick: onCloseDialog,
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "send",
        size: 15
      })
    }, "Submit application"))
  }, applyPost && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Alert, {
    tone: "info",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "info",
      size: 17
    })
  }, "You are applying to ", /*#__PURE__*/React.createElement("b", null, applyPost.title), " \xB7 ", applyPost.dept, "."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Name"
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: D.student.name,
    disabled: true
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Student ID"
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: D.student.sid,
    disabled: true
  }))), /*#__PURE__*/React.createElement(FormField, {
    label: "Preferred shift",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: ""
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "Select a shift\u2026"), /*#__PURE__*/React.createElement("option", null, "Morning (09:00\u201313:00)"), /*#__PURE__*/React.createElement("option", null, "Afternoon (13:00\u201317:00)"), /*#__PURE__*/React.createElement("option", null, "Flexible"))), /*#__PURE__*/React.createElement(FormField, {
    label: "Weekly availability",
    required: true,
    help: "Select all days you can work."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      flexWrap: "wrap",
      paddingTop: 2
    }
  }, ["Mon", "Tue", "Wed", "Thu", "Fri"].map(d => /*#__PURE__*/React.createElement(Checkbox, {
    key: d,
    label: d,
    defaultChecked: ["Mon", "Wed"].includes(d)
  })))), /*#__PURE__*/React.createElement(FormField, {
    label: "Statement of interest",
    required: true,
    help: "Why are you a good fit? (max 300 chars)"
  }, /*#__PURE__*/React.createElement(Textarea, {
    rows: 3,
    placeholder: "I have prior experience supporting library patrons\u2026"
  })), /*#__PURE__*/React.createElement(Checkbox, {
    label: "I confirm the information above is accurate and agree to the work-study terms."
  }))));
}
window.ApplicationsScreen = ApplicationsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/ApplicationsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/AttendanceScreen.jsx
try { (() => {
// Student · Attendance History
function AttendanceScreen({
  ns
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Table,
    StatusPill,
    Icon,
    StatCard,
    Tabs
  } = ns;
  const D = window.STREAM_DATA;
  const [tab, setTab] = React.useState("all");
  const rows = tab === "all" ? D.attendance : D.attendance.filter(r => r.status === tab);
  const columns = [{
    key: "date",
    header: "Date",
    strong: true
  }, {
    key: "shift",
    header: "Scheduled",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "place",
    header: "Location"
  }, {
    key: "checkIn",
    header: "Check-in",
    align: "center",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "checkOut",
    header: "Check-out",
    align: "center",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "hours",
    header: "Hours",
    align: "right",
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v.toFixed(1))
  }, {
    key: "status",
    header: "Status",
    render: v => /*#__PURE__*/React.createElement(StatusPill, {
      status: v
    })
  }];
  const totalHrs = D.attendance.reduce((a, r) => a + r.hours, 0);
  const present = D.attendance.filter(r => r.status === "present").length;
  const rate = Math.round(present / D.attendance.length * 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Attendance History"
      }]
    }),
    title: "Attendance History",
    description: "Your check-in records and logged hours for the term."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Logged hours (term)",
    value: totalHrs.toFixed(1),
    unit: "hrs",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "clock",
      size: 18
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "On-time rate",
    value: rate,
    unit: "%",
    deltaTone: "up",
    delta: "Good standing",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "check-circle-2",
      size: 18
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Absences",
    value: "1",
    delta: "1 excused",
    deltaTone: "neutral",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "calendar-x",
      size: 18
    })
  })), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 14px 0"
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    active: tab,
    onChange: setTab,
    tabs: [{
      id: "all",
      label: "All"
    }, {
      id: "present",
      label: "Present"
    }, {
      id: "late",
      label: "Late"
    }, {
      id: "absent",
      label: "Absent"
    }]
  })), /*#__PURE__*/React.createElement(Table, {
    columns: columns,
    data: rows,
    rowKey: "date",
    empty: "No records for this filter"
  })));
}
window.AttendanceScreen = AttendanceScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/AttendanceScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/MyApplicationsScreen.jsx
try { (() => {
// 내 지원 현황 (my applications)
function MyApplicationsScreen({
  onOpenDetail
}) {
  const {
    Icon,
    StatCard,
    StatusBadge
  } = window;
  const [chip, setChip] = React.useState('전체');
  const chips = ['전체', '지원 완료', '검토 중', '면접 진행', '최종 합격', '불합격'];
  const steps = ['제출완료', '검토중', '면접', '결과'];
  const Stepper = ({
    step,
    result
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 0
    }
  }, steps.map((s, i) => {
    const done = i < step || (result === 'fail' ? true : i <= step && step === 0 ? i === 0 : i < step);
    const isDone = i <= step;
    const isFailResult = i === 3 && result === 'fail';
    const active = i === step && !isFailResult;
    let bg = '#fff',
      bd = '#D5D8DC',
      ic = null,
      icColor = '#C9CED4';
    if (i < step) {
      bg = '#1F8A4C';
      bd = '#1F8A4C';
      ic = 'check';
      icColor = '#fff';
    } else if (i === step) {
      if (result === 'fail' && i === 3) {
        bg = '#9AA1A9';
        bd = '#9AA1A9';
        ic = 'x';
        icColor = '#fff';
      } else if (i === 3) {
        bg = '#1F8A4C';
        bd = '#1F8A4C';
        ic = 'check';
        icColor = '#fff';
      } else if (i === 2) {
        bg = '#6D4FCB';
        bd = '#6D4FCB';
        ic = 'dot';
        icColor = '#fff';
      } else if (i === 1) {
        bg = '#D9791F';
        bd = '#D9791F';
        ic = 'dot';
        icColor = '#fff';
      } else {
        bg = '#1F8A4C';
        bd = '#1F8A4C';
        ic = 'check';
        icColor = '#fff';
      }
    }
    return /*#__PURE__*/React.createElement("div", {
      key: s,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: i < 3 ? 1 : '0 0 auto',
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        justifyContent: 'center',
        position: 'relative'
      }
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: '50%',
        width: '100%',
        height: 2,
        background: i <= step ? '#1F8A4C' : '#E6E8EB',
        top: 9
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: bg,
        border: '2px solid ' + bd,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1
      }
    }, ic === 'dot' ? /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#fff'
      }
    }) : ic && /*#__PURE__*/React.createElement(Icon, {
      name: ic,
      size: 12,
      color: icColor,
      strokeWidth: 3
    }))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 6
      }
    }, s));
  }));
  const th = (t, w) => /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '13px 16px',
      fontSize: 13,
      fontWeight: 700,
      color: '#4B5563',
      textAlign: 'center',
      width: w
    }
  }, t);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uB0B4 \uC9C0\uC6D0 \uD604\uD669"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uB0B4\uAC00 \uC9C0\uC6D0\uD55C \uACF5\uACE0\uC758 \uC9C4\uD589 \uC0C1\uD0DC\uB97C \uD55C\uB208\uC5D0 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 20
    }
  }, window.myAppStats.map(s => /*#__PURE__*/React.createElement(StatCard, {
    key: s.key,
    stat: s
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 18,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      height: 40,
      padding: '0 14px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC804\uCCB4 \uC0C1\uD0DC ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 15,
    color: "#9AA1A9"
  })), chips.map(c => {
    const on = chip === c;
    return /*#__PURE__*/React.createElement("button", {
      key: c,
      onClick: () => setChip(c),
      style: {
        height: 40,
        padding: '0 18px',
        background: on ? '#fff' : '#fff',
        border: '1px solid ' + (on ? '#B01116' : '#E6E8EB'),
        borderRadius: 8,
        fontSize: 13,
        fontWeight: on ? 700 : 500,
        color: on ? '#B01116' : '#4B5563',
        cursor: 'pointer',
        font: 'inherit'
      }
    }, c);
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      marginLeft: 'auto',
      width: 280
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 14,
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16,
    color: "#9AA1A9"
  })), /*#__PURE__*/React.createElement("input", {
    placeholder: "\uACF5\uACE0\uBA85, \uBD80\uC11C\uBA85\uC73C\uB85C \uAC80\uC0C9",
    style: {
      width: '100%',
      height: 40,
      padding: '0 40px 0 14px',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      height: 40,
      padding: '0 16px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      color: '#6B7280',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "rotate-ccw",
    size: 14,
    color: "#9AA1A9"
  }), " \uCD08\uAE30\uD654")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: '#4B5563',
      marginBottom: 12
    }
  }, "\uCD1D ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#1F2937'
    }
  }, "8\uAC1C"), "\uC758 \uC9C0\uC6D0 \uB0B4\uC5ED"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6',
      borderBottom: '1px solid #E6E8EB'
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '13px 20px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: 'left'
    }
  }, "\uACF5\uACE0\uBA85 / \uBD80\uC11C"), th('지원 기간'), th('지원일'), th('현재 상태', 110), th('진행 단계', 260), th('관리', 170))), /*#__PURE__*/React.createElement("tbody", null, window.myApplications.map(a => /*#__PURE__*/React.createElement("tr", {
    key: a.id,
    style: {
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: '50%',
      background: a.step === 2 ? '#EEEAFB' : '#E7F4EA',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.step === 2 ? 'users' : 'briefcase',
    size: 18,
    color: a.step === 2 ? '#6D4FCB' : '#1F8A4C'
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, a.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      marginTop: 2
    }
  }, a.dept, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC'
    }
  }, "|"), " ", a.cat)))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px',
      textAlign: 'center',
      fontSize: 13,
      color: '#4B5563'
    }
  }, a.period), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px',
      textAlign: 'center',
      fontSize: 13,
      color: '#4B5563'
    }
  }, a.date), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: a.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px'
    }
  }, /*#__PURE__*/React.createElement(Stepper, {
    step: a.step,
    result: a.result
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onOpenDetail && onOpenDetail(a),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 34,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC9C0\uC6D0 \uC0C1\uC138 \uBCF4\uAE30 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14,
    color: "#9AA1A9"
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 34,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uACF5\uACE0 \uB2E4\uC2DC \uBCF4\uAE30 ", /*#__PURE__*/React.createElement(Icon, {
    name: "external-link",
    size: 13,
    color: "#9AA1A9"
  }))))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 22,
      position: 'relative'
    }
  }, ['chevrons-left', 'chevron-left'].map(i => /*#__PURE__*/React.createElement("button", {
    key: i,
    style: {
      width: 34,
      height: 34,
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 6,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: i,
    size: 15,
    color: "#9AA1A9"
  }))), [1, 2, 3].map(n => /*#__PURE__*/React.createElement("button", {
    key: n,
    style: {
      width: 34,
      height: 34,
      background: n === 1 ? '#B01116' : '#fff',
      color: n === 1 ? '#fff' : '#4B5563',
      border: '1px solid ' + (n === 1 ? '#B01116' : '#E6E8EB'),
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, n)), ['chevron-right', 'chevrons-right'].map(i => /*#__PURE__*/React.createElement("button", {
    key: i,
    style: {
      width: 34,
      height: 34,
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 6,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: i,
    size: 15,
    color: "#9AA1A9"
  }))), /*#__PURE__*/React.createElement("button", {
    style: {
      position: 'absolute',
      right: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      height: 34,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 6,
      fontSize: 12,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "10\uAC1C\uC529 \uBCF4\uAE30 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 14,
    color: "#9AA1A9"
  }))));
}
window.MyApplicationsScreen = MyApplicationsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/MyApplicationsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/OtherScreens.jsx
try { (() => {
// Simpler screens for 근무 시간표 / 대타 요청 / 출결 내역 (not in this sprint's hi-fi spec)
function ScheduleScreen() {
  const {
    Icon,
    TimeGrid
  } = window;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uADFC\uBB34 \uC2DC\uAC04\uD45C"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uC774\uBC88 \uD559\uAE30 \uD655\uC815\uB41C \uADFC\uBB34 \uC77C\uC815\uC785\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: '#FDECEC',
      border: '1px solid #F7D9D8',
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar-check",
    size: 18,
    color: "#B01116"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#B01116',
      fontWeight: 600
    }
  }, "\uC774\uBC88 \uC8FC \uCD1D \uADFC\uBB34\uC2DC\uAC04 6\uC2DC\uAC04 \xB7 \uD559\uC0DD\uC9C0\uC6D0\uD300 \uD589\uC815 \uBCF4\uC870")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement(TimeGrid, {
    redSlots: ['월-10:00', '월-11:00', '수-10:00', '수-11:00', '금-10:00'],
    redLabel: "\uADFC\uBB34",
    legend: false
  })));
}
function SubstituteScreen() {
  const {
    Icon,
    StatusBadge
  } = window;
  const rows = [{
    date: '2026.03.05',
    time: '08:30-10:30',
    reason: '수강신청',
    rep: '박민수',
    status: '지원 완료'
  }, {
    date: '2026.03.12',
    time: '10:00-13:00',
    reason: '병원 방문',
    rep: '대기 중',
    status: '검토 중'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uB300\uD0C0 \uC694\uCCAD"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uADFC\uBB34\uAC00 \uC5B4\uB824\uC6B4 \uC77C\uC815\uC5D0 \uB300\uD574 \uB300\uD0C0\uB97C \uC694\uCCAD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 22,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px',
      fontSize: 16,
      fontWeight: 700
    }
  }, "\uC2E0\uADDC \uB300\uD0C0 \uC694\uCCAD"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 2fr auto',
      gap: 12,
      alignItems: 'end'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\uADFC\uBB34 \uC77C\uC815"), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 42,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC6D4 10:00-13:00 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 15,
    color: "#9AA1A9"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\uC0AC\uC720"), /*#__PURE__*/React.createElement("input", {
    placeholder: "\uB300\uD0C0 \uC0AC\uC720\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694",
    style: {
      width: '100%',
      height: 42,
      padding: '0 12px',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      font: 'inherit',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 42,
      padding: '0 22px',
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC694\uCCAD \uC81C\uCD9C"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6',
      borderBottom: '1px solid #E6E8EB'
    }
  }, ['요청일', '시간', '사유', '대타자', '상태'].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      padding: '13px 18px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: i > 3 ? 'center' : 'left'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.date), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.time), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.reason), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.rep), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: r.status
  }))))))));
}
function AttendanceScreen() {
  const {
    StatusBadge
  } = window;
  const rows = [{
    date: '2026.02.26',
    day: '월',
    time: '10:00-13:00',
    inn: '09:58',
    out: '13:02',
    status: '모집중',
    label: '정상'
  }, {
    date: '2026.02.27',
    day: '화',
    time: '10:00-13:00',
    inn: '10:07',
    out: '13:00',
    status: '마감임박',
    label: '지각'
  }, {
    date: '2026.02.28',
    day: '수',
    time: '10:00-13:00',
    inn: '09:55',
    out: '13:05',
    status: '모집중',
    label: '정상'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 6px',
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uCD9C\uACB0 \uB0B4\uC5ED"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\uADFC\uBB34 \uCD9C\uD1F4\uADFC \uAE30\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F6F0E6',
      borderBottom: '1px solid #E6E8EB'
    }
  }, ['날짜', '요일', '근무시간', '입장', '퇴장', '상태'].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      padding: '13px 18px',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33',
      textAlign: i < 2 ? 'left' : 'center'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderBottom: '1px solid #EEF0F2'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.date), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.day), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'center',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.time), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'center',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.inn), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'center',
      fontSize: 13,
      color: '#3A4048'
    }
  }, r.out), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      padding: '4px 11px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      background: r.label === '정상' ? '#E7F4EA' : '#FDEEE0',
      color: r.label === '정상' ? '#1F8A4C' : '#D9791F'
    }
  }, r.label))))))));
}
Object.assign(window, {
  ScheduleScreen,
  SubstituteScreen,
  AttendanceScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/OtherScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/PostDetailScreen.jsx
try { (() => {
// 공고 상세 (post detail)
function PostDetailScreen({
  onBack,
  onApply
}) {
  const {
    Icon,
    StatusBadge,
    TimeGrid,
    Panel
  } = window;
  const d = window.postDetail;
  const summaryCell = (icon, label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: '#F1F3F5',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 20,
    color: "#6B7280"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: '#1F2937',
      fontWeight: 700
    }
  }, value)));
  const bullet = text => /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 14,
      color: '#3A4048',
      lineHeight: 1.6,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#B01116',
      marginTop: 1
    }
  }, "\u2022"), " ", text);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'none',
      border: 'none',
      fontSize: 14,
      color: '#4B5563',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 18,
    color: "#6B7280"
  }), " \uBAA9\uB85D\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: '#9AA1A9'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 15,
    color: "#B9BFC6"
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 13,
    color: "#C9CED4"
  }), " \uACF5\uACE0 \uCC3E\uAE30", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 13,
    color: "#C9CED4"
  }), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3A4048',
      fontWeight: 600
    }
  }, "\uACF5\uACE0 \uC0C1\uC138"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: d.status,
    size: "lg"
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 26,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, d.team, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC',
      margin: '0 6px'
    }
  }, "|"), " ", d.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: '#6B7280',
      marginBottom: 20
    }
  }, d.team), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '22px 26px',
      display: 'flex',
      gap: 8,
      marginBottom: 18
    }
  }, summaryCell('users', '모집인원', d.headcount), summaryCell('timer', '주당 근무시간', d.weeklyMax), summaryCell('calendar', '근무기간', d.period), summaryCell('clock', '지원 마감일', d.deadline)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "\uC5C5\uBB34 \uB0B4\uC6A9"
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, d.duties.map(bullet))), /*#__PURE__*/React.createElement(Panel, {
    title: "\uC9C0\uC6D0 \uC790\uACA9 \uBC0F \uC6B0\uB300 \uC870\uAC74"
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, d.qualifications.map(bullet)))), /*#__PURE__*/React.createElement(Panel, {
    title: "\uADFC\uBB34 \uC870\uAC74"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 14,
      fontWeight: 600,
      color: '#3A4048',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 16,
    color: "#8A929B"
  }), " \uADFC\uBB34\uC694\uC77C/\uC2DC\uAC04"), /*#__PURE__*/React.createElement(TimeGrid, {
    redSlots: d.workSlots,
    redLabel: "",
    legend: false
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 16,
    color: "#8A929B"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      fontWeight: 600,
      width: 70
    }
  }, "\uADFC\uBB34\uC7A5\uC18C"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#1F2937',
      fontWeight: 600,
      flex: 1
    }
  }, d.location), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 220,
      height: 84,
      borderRadius: 8,
      background: 'linear-gradient(135deg,#E9EDF0,#DDE3E8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#98A0A8',
      fontSize: 12,
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map",
    size: 22,
    color: "#AEB6BE"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      color: '#B01116',
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 14,
    color: "#B01116"
  }), " \uBCF8\uAD00\uBE4C\uB529"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "mail",
    size: 16,
    color: "#8A929B"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9AA1A9',
      fontWeight: 600,
      width: 70
    }
  }, "\uBB38\uC758\uCC98"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#1F2937'
    }
  }, d.contactEmail, /*#__PURE__*/React.createElement("br", null), d.contactPhone)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 13,
      color: '#9AA1A9',
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 15,
    color: "#B9BFC6",
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("div", null, "\uC774\uBBF8 \uC9C0\uC6D0\uD55C \uACF5\uACE0\uB294 \"\uC9C0\uC6D0\uD604\uD669 \uBCF4\uAE30\" \uBC84\uD2BC\uC73C\uB85C \uBCC0\uACBD\uB429\uB2C8\uB2E4.", /*#__PURE__*/React.createElement("br", null), "\uBAA8\uC9D1\uC774 \uB9C8\uAC10\uB41C \uACF5\uACE0\uB294 \"\uC9C0\uC6D0 \uB9C8\uAC10\"\uC73C\uB85C \uD45C\uC2DC\uB418\uC5B4 \uC9C0\uC6D0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("button", {
    onClick: onApply,
    style: {
      height: 48,
      padding: '0 40px',
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 16,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC9C0\uC6D0\uD558\uAE30")));
}
window.PostDetailScreen = PostDetailScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/PostDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/PostListScreen.jsx
try { (() => {
// 교내 근로 모집 공고 (post list)
function PostListScreen({
  onOpenDetail,
  onApply
}) {
  const {
    Icon,
    StatCard,
    StatusBadge
  } = window;
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('전체 기한');
  const cats = [{
    label: '도서관',
    icon: 'book-open'
  }, {
    label: '학과별 사무실',
    icon: 'map-pin'
  }, {
    label: '교내 부서',
    icon: 'building-2'
  }, {
    label: '전체 기한',
    icon: 'layout-grid'
  }];
  const filters = [{
    label: '부서',
    value: '전체'
  }, {
    label: '모집상태',
    value: '전체'
  }, {
    label: '요일',
    value: '전체'
  }, {
    label: '시간대',
    value: '전체'
  }, {
    label: '정렬',
    value: '마감임박순'
  }];
  const infoItem = (icon, label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: '#9AA1A9',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 14,
    color: "#B9BFC6"
  }), " ", label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#3A4048',
      fontWeight: 600
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      border: '2px solid #B01116',
      borderRadius: 12,
      padding: '16px 22px',
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 800,
      color: '#1F2937'
    }
  }, "\uAD50\uB0B4 \uADFC\uB85C \uBAA8\uC9D1 \uACF5\uACE0")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginBottom: 20
    }
  }, window.postStats.map(s => /*#__PURE__*/React.createElement(StatCard, {
    key: s.key,
    stat: s
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 20,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      maxWidth: 620
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 14,
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 18,
    color: "#9AA1A9"
  })), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\uBD80\uC11C\uBA85, \uC5C5\uBB34\uBA85, \uD0A4\uC6CC\uB4DC\uB85C \uAC80\uC0C9\uD558\uC138\uC694",
    style: {
      width: '100%',
      height: 44,
      padding: '0 14px 0 42px',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      font: 'inherit',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 44,
      padding: '0 26px',
      background: '#26292E',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uAC80\uC0C9")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 22,
      flexWrap: 'wrap',
      marginBottom: 16
    }
  }, filters.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600
    }
  }, f.label), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      height: 38,
      padding: '0 12px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 13,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, f.value, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 15,
    color: "#9AA1A9"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: '#4B5563',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    style: {
      width: 16,
      height: 16,
      accentColor: '#B01116'
    }
  }), "\uB0B4 \uC2DC\uAC04\uD45C\uC640 \uB9DE\uB294 \uACF5\uACE0\uB9CC \uBCF4\uAE30 ", /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 14,
    color: "#B9BFC6"
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'none',
      border: 'none',
      fontSize: 13,
      color: '#6B7280',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "rotate-ccw",
    size: 14,
    color: "#9AA1A9"
  }), " \uD544\uD130 \uCD08\uAE30\uD654"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 20
    }
  }, cats.map(c => {
    const on = cat === c.label;
    return /*#__PURE__*/React.createElement("button", {
      key: c.label,
      onClick: () => setCat(c.label),
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
        background: on ? '#FDECEC' : '#fff',
        border: '1px solid ' + (on ? '#EBB9B8' : '#E6E8EB'),
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        color: on ? '#B01116' : '#4B5563',
        cursor: 'pointer',
        font: 'inherit'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: c.icon,
      size: 16,
      color: on ? '#B01116' : '#8A929B'
    }), " ", c.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, window.posts.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '20px 24px',
      boxShadow: '0 1px 2px rgba(16,24,40,.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 2
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: p.status
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: '#1F2937',
      marginBottom: 16
    }
  }, p.dept, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#D5D8DC',
      margin: '0 8px'
    }
  }, "|"), " ", p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 18
    }
  }, infoItem('calendar', '근무기간', p.period), infoItem('clock', '근무시간', p.hours), infoItem('users', '모집인원', p.headcount), infoItem('timer', '주당 근무시간', p.weeklyMax), infoItem('award', '우대조건', p.preferred))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
      width: 220,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, p.applied ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#6B7280'
    }
  }, "\uC9C0\uC6D0\uC77C ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3A4048',
      fontWeight: 600
    }
  }, p.appliedDate)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: '#D9791F'
    }
  }, "\uB9C8\uAC10\uAE4C\uC9C0 ", p.dday), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#9AA1A9',
      marginTop: 2
    }
  }, "\uB9C8\uAC10\uC77C ", p.deadline))), /*#__PURE__*/React.createElement(Icon, {
    name: "heart",
    size: 20,
    color: "#C9CED4"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onOpenDetail && onOpenDetail(p),
    style: {
      height: 40,
      padding: '0 18px',
      background: '#fff',
      border: '1px solid #DADEE3',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC0C1\uC138\uBCF4\uAE30"), p.applied ? /*#__PURE__*/React.createElement("button", {
    style: {
      height: 40,
      padding: '0 18px',
      background: '#E8F0FB',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      color: '#2563C9',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC9C0\uC6D0\uD604\uD669 \uBCF4\uAE30") : /*#__PURE__*/React.createElement("button", {
    onClick: () => onApply && onApply(p),
    style: {
      height: 40,
      padding: '0 22px',
      background: '#B01116',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 700,
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, "\uC9C0\uC6D0\uD558\uAE30"))))))));
}
window.PostListScreen = PostListScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/PostListScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/PostsScreen.jsx
try { (() => {
// Student · Recruitment Posts — browse & apply
function PostsScreen({
  ns,
  onApply
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Button,
    Input,
    Select,
    Badge,
    StatusPill,
    Icon
  } = ns;
  const D = window.STREAM_DATA;
  const [q, setQ] = React.useState("");
  const posts = D.posts.filter(p => p.title.toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Recruitment Posts"
      }]
    }),
    title: "Recruitment Posts",
    description: "On-campus work-study positions open for the Fall 2025 term."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 220
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: q,
    onChange: e => setQ(e.target.value),
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 15
    }),
    placeholder: "Search positions or departments"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 190
    }
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: "all"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All departments"), /*#__PURE__*/React.createElement("option", null, "Central Library"), /*#__PURE__*/React.createElement("option", null, "IT Helpdesk"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 150
    }
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: "all"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All types"), /*#__PURE__*/React.createElement("option", null, "Semester"), /*#__PURE__*/React.createElement("option", null, "Short-term")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      gap: 16
    }
  }, posts.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.id,
    bodyStyle: {
      padding: 18
    },
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: p.status === "closing" ? "warning" : "open",
    label: p.status === "closing" ? "Closing soon" : "Open",
    tone: p.status === "closing" ? "warning" : "success"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--fs-caption)",
      color: "var(--text-muted)"
    }
  }, "Closes ", p.closes)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--fs-h3)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-strong)",
      lineHeight: 1.35,
      marginBottom: 6
    }
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      color: "var(--text-muted)",
      fontSize: "var(--fs-sm)",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 14
  }), " ", p.dept), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px 14px",
      fontSize: "var(--fs-sm)",
      color: "var(--text-body)",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 14,
    color: "var(--text-muted)"
  }), " ", p.hours), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "banknote",
    size: 14,
    color: "var(--text-muted)"
  }), " ", p.wage), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 14,
    color: "var(--text-muted)"
  }), " ", p.slots, " openings"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 14,
    color: "var(--text-muted)"
  }), " ", p.applied, " applied")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, p.tags.map(t => /*#__PURE__*/React.createElement(Badge, {
    key: t,
    tone: "neutral"
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    block: true,
    onClick: () => onApply(p)
  }, "Apply"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "bookmark",
      size: 15
    }),
    "aria-label": "Save"
  }))))));
}
window.PostsScreen = PostsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/PostsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/ScheduleScreen.jsx
try { (() => {
// Student · Work Schedule (week view)
function ScheduleScreen({
  ns,
  onRequestSub
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Button,
    StatusPill,
    Icon,
    StatCard
  } = ns;
  const D = window.STREAM_DATA;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const totalHrs = D.shifts.reduce((a, s) => a + s.hours, 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Work Schedule"
      }]
    }),
    title: "Work Schedule",
    description: "Your assigned shifts for the current week.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "download",
        size: 15
      })
    }, "Export"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "chevron-left",
        size: 15
      })
    }, "Prev week"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Scheduled this week",
    value: totalHrs,
    unit: "hrs",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "calendar-days",
      size: 18
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Shifts",
    value: D.shifts.length,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "clock",
      size: 18
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Pending swaps",
    value: "1",
    deltaTone: "neutral",
    delta: "1 awaiting approval",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "repeat",
      size: 18
    })
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Week of Sep 8 \u2013 Sep 12",
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, days.map((d, i) => {
    const shift = D.shifts.find(s => s.day === d);
    return /*#__PURE__*/React.createElement("div", {
      key: d,
      style: {
        borderRight: i < 4 ? "1px solid var(--border-subtle)" : "none",
        minHeight: 180,
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "10px 12px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--neutral-25)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "var(--fs-caption)",
        fontWeight: "var(--fw-semibold)",
        color: "var(--text-strong)"
      }
    }, d), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "var(--fs-micro)",
        color: "var(--text-muted)"
      }
    }, shift ? shift.date : "—")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 10,
        flex: 1
      }
    }, shift && /*#__PURE__*/React.createElement("div", {
      style: {
        border: "1px solid var(--sogang-red-100)",
        background: "var(--sogang-red-50)",
        borderRadius: "var(--radius-sm)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular",
      style: {
        fontSize: "var(--fs-sm)",
        fontWeight: "var(--fw-bold)",
        color: "var(--sogang-red)"
      }
    }, shift.time), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--fs-micro)",
        color: "var(--text-body)",
        lineHeight: 1.35
      }
    }, shift.place), shift.status === "swap" ? /*#__PURE__*/React.createElement(StatusPill, {
      status: "pending",
      label: "Swap requested",
      tone: "warning"
    }) : /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      style: {
        padding: "0 6px",
        height: 24,
        justifyContent: "flex-start"
      },
      onClick: onRequestSub,
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "repeat",
        size: 13
      })
    }, "Request sub"))));
  }))));
}
window.ScheduleScreen = ScheduleScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/ScheduleScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/Shell.jsx
try { (() => {
// STREAM student shell + shared UI helpers (plain script, window exports)

// ---- Icon (Lucide) ----
function Icon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.75,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          stroke: color,
          'stroke-width': strokeWidth
        },
        nameAttr: 'data-lucide'
      });
    }
  }, [name, size, color, strokeWidth]);
  return React.createElement('span', {
    ref,
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      ...style
    }
  });
}

// ---- Status badge ----
const STATUS_TONES = {
  '모집중': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  '지원완료': {
    bg: '#E8F0FB',
    fg: '#2563C9'
  },
  '지원 완료': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  '마감임박': {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  '검토 중': {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  '면접 진행': {
    bg: '#EEEAFB',
    fg: '#6D4FCB'
  },
  '최종 합격': {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  '불합격': {
    bg: '#EEF0F2',
    fg: '#6B7280'
  },
  '모집완료': {
    bg: '#EEF0F2',
    fg: '#6B7280'
  }
};
function StatusBadge({
  status,
  size = 'md'
}) {
  const t = STATUS_TONES[status] || {
    bg: '#EEF0F2',
    fg: '#6B7280'
  };
  const pad = size === 'lg' ? '6px 14px' : '4px 11px';
  const fs = size === 'lg' ? 14 : 12;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      background: t.bg,
      color: t.fg,
      padding: pad,
      borderRadius: 6,
      fontSize: fs,
      fontWeight: 600,
      whiteSpace: 'nowrap'
    }
  }, status);
}

// ---- Stat card ----
const TONE_CIRCLE = {
  neutral: {
    bg: '#EEF1F4',
    fg: '#5B6570'
  },
  green: {
    bg: '#E7F4EA',
    fg: '#1F8A4C'
  },
  orange: {
    bg: '#FDEEE0',
    fg: '#D9791F'
  },
  blue: {
    bg: '#E8F0FB',
    fg: '#2563C9'
  },
  purple: {
    bg: '#EEEAFB',
    fg: '#6D4FCB'
  },
  gold: {
    bg: '#FBF1DC',
    fg: '#B8860B'
  }
};
const TONE_VALUE = {
  neutral: '#1F2937',
  green: '#1F8A4C',
  orange: '#D9791F',
  blue: '#2563C9',
  purple: '#6D4FCB',
  gold: '#B8860B'
};
function StatCard({
  stat,
  active,
  onClick
}) {
  const c = TONE_CIRCLE[stat.tone] || TONE_CIRCLE.neutral;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      flex: 1,
      minWidth: 0,
      textAlign: 'left',
      cursor: onClick ? 'pointer' : 'default',
      background: '#fff',
      border: active ? '1.5px solid ' + c.fg : '1px solid #E6E8EB',
      borderRadius: 12,
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 1px 2px rgba(16,24,40,.04)',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: c.bg,
      color: c.fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: stat.icon,
    size: 22,
    color: c.fg
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: 600
    }
  }, stat.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      lineHeight: 1.1,
      color: TONE_VALUE[stat.tone] || '#1F2937'
    }
  }, stat.value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#9AA1A9'
    }
  }, stat.sub)));
}

// ---- Weekly time grid ----
// redSlots: filled red cells (수업시간). checkSlots: red check marks (근무가능). label for red cells.
function TimeGrid({
  redSlots = [],
  checkSlots = [],
  redLabel = '수업시간',
  legend = true
}) {
  const rows = window.timeRows,
    days = window.dayCols;
  const cell = (day, time) => {
    const key = day + '-' + time;
    const isRed = redSlots.includes(key);
    const isCheck = checkSlots.includes(key);
    return /*#__PURE__*/React.createElement("td", {
      key: key,
      style: {
        border: '1px solid #E6E8EB',
        height: 30,
        textAlign: 'center',
        verticalAlign: 'middle',
        background: isRed ? '#B01116' : '#fff',
        color: '#fff',
        padding: 0,
        fontSize: 11,
        fontWeight: 600
      }
    }, isRed ? redLabel : isCheck ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 14,
      color: "#B01116",
      style: {
        verticalAlign: 'middle'
      }
    }) : '');
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      border: '1px solid #E6E8EB',
      background: '#F6F0E6',
      padding: '8px 0',
      fontSize: 12,
      fontWeight: 700,
      color: '#5B4B33',
      width: 68
    }
  }, "\uC2DC\uAC04"), days.map(d => /*#__PURE__*/React.createElement("th", {
    key: d,
    style: {
      border: '1px solid #E6E8EB',
      background: '#F6F0E6',
      padding: '8px 0',
      fontSize: 13,
      fontWeight: 700,
      color: '#5B4B33'
    }
  }, d)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      border: '1px solid #E6E8EB',
      background: '#FAFAFA',
      textAlign: 'center',
      fontSize: 12,
      color: '#6B7280',
      height: 30
    }
  }, t), days.map(d => cell(d, t)))))), legend && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24,
      marginTop: 12,
      fontSize: 12,
      color: '#6B7280'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      background: '#B01116',
      borderRadius: 3,
      display: 'inline-block'
    }
  }), "\uBD89\uC740\uC0C9\uC740 \uC218\uC5C5\uC2DC\uAC04\uC73C\uB85C \uC790\uB3D9 \uC5F0\uB3D9\uB41C \uC120\uD0DD \uBD88\uAC00 \uC2AC\uB86F\uC785\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    color: "#B01116"
  }), " \uCCB4\uD06C\uB41C \uCE78\uC740 \uADFC\uBB34 \uAC00\uB2A5 \uC2DC\uAC04\uC785\uB2C8\uB2E4.")));
}

// ---- Card / Panel ----
function Panel({
  title,
  right,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: '#fff',
      border: '1px solid #E6E8EB',
      borderRadius: 12,
      padding: 24,
      ...style
    }
  }, (title || right) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 16,
      fontWeight: 700,
      color: '#1F2937'
    }
  }, title), right), children);
}

// ---- Shell (SAINT header + STREAM sidebar) ----
function Shell({
  active,
  onNavigate,
  children
}) {
  const u = window.currentUser;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      background: '#F4F5F7',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      background: '#fff',
      borderBottom: '1px solid #E6E8EB',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      gap: 28,
      position: 'sticky',
      top: 0,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/sogang-logo.png",
    alt: "\uC11C\uAC15\uB300\uD559\uAD50",
    style: {
      height: 34
    }
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 30,
      flex: 1,
      justifyContent: 'center'
    }
  }, window.saintNav.map(n => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: '#3A4048',
      cursor: 'pointer'
    }
  }, n)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: '#B01116',
      cursor: 'pointer',
      position: 'relative',
      paddingBottom: 4,
      borderBottom: '3px solid #B01116'
    }
  }, "STREAM")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 20,
    color: "#5B6570"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: '#EEF1F4',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16,
    color: "#5B6570"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#3A4048',
      fontWeight: 600
    }
  }, u.name, " (", u.role, ")"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 16,
    color: "#9AA1A9"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 248,
      background: '#fff',
      borderRight: '1px solid #E6E8EB',
      padding: '28px 16px',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 12px 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: '#B01116',
      letterSpacing: '.04em'
    }
  }, "STREAM"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#9AA1A9',
      marginTop: 4
    }
  }, "\uC11C\uAC15\uB300\uD559\uAD50 \uAD50\uB0B4\uADFC\uB85C \uD1B5\uD569\uAD00\uB9AC \uC2DC\uC2A4\uD15C")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      marginTop: 22
    }
  }, window.streamMenu.map(m => {
    const on = active === m.id;
    return /*#__PURE__*/React.createElement("button", {
      key: m.id,
      onClick: () => onNavigate && onNavigate(m.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'left',
        width: '100%',
        background: on ? '#FDECEC' : 'transparent',
        color: on ? '#B01116' : '#4B5563',
        fontWeight: on ? 700 : 500,
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: m.icon,
      size: 18,
      color: on ? '#B01116' : '#8A929B'
    }), m.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'linear-gradient(180deg,#FEF4F3 0%,#FDECEC 100%)',
      border: '1px solid #F7D9D8',
      borderRadius: 14,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/stream-mascot.png",
    alt: "",
    style: {
      width: 76,
      height: 'auto'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: '#B01116'
    }
  }, "AI \uCC57\uBD07"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#3A4048'
    }
  }, "\uC11C\uAC15 \uADFC\uB85C \uC9C0\uC6D0 \uB3C4\uC6B0\uBBF8"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#9AA1A9'
    }
  }, "\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?")))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: '28px 32px 48px'
    }
  }, children)));
}
Object.assign(window, {
  Icon,
  StatusBadge,
  StatCard,
  TimeGrid,
  Panel,
  Shell
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/SubstitutionScreen.jsx
try { (() => {
// Student · Substitution Requests
function SubstitutionScreen({
  ns,
  openSub,
  onCloseSub
}) {
  const {
    PageHeader,
    Breadcrumb,
    Card,
    Table,
    StatusPill,
    Button,
    Icon,
    Dialog,
    FormField,
    Select,
    Textarea,
    Alert
  } = ns;
  const D = window.STREAM_DATA;
  const columns = [{
    key: "shift",
    header: "Shift",
    strong: true,
    render: v => /*#__PURE__*/React.createElement("span", {
      className: "stream-tabular"
    }, v)
  }, {
    key: "place",
    header: "Location"
  }, {
    key: "reason",
    header: "Reason"
  }, {
    key: "covered",
    header: "Covered by",
    render: v => v === "—" ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-subtle)"
      }
    }, "\u2014") : v
  }, {
    key: "filed",
    header: "Filed"
  }, {
    key: "status",
    header: "Status",
    render: v => /*#__PURE__*/React.createElement(StatusPill, {
      status: v
    })
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    breadcrumb: /*#__PURE__*/React.createElement(Breadcrumb, {
      items: [{
        label: "STREAM",
        href: "#"
      }, {
        label: "Substitution Requests"
      }]
    }),
    title: "Substitution Requests",
    description: "Request a substitute when you cannot make a scheduled shift.",
    actions: /*#__PURE__*/React.createElement(Button, {
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16
      }),
      onClick: () => onCloseSub(true)
    }, "New request")
  }), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement(Table, {
    columns: columns,
    data: D.substitutions,
    rowKey: "id"
  })), /*#__PURE__*/React.createElement(Dialog, {
    open: openSub,
    title: "New substitution request",
    onClose: () => onCloseSub(false),
    width: 500,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => onCloseSub(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      onClick: () => onCloseSub(false)
    }, "Submit request"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Alert, {
    tone: "warning",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "clock",
      size: 17
    })
  }, "Requests must be filed at least 24 hours before the shift."), /*#__PURE__*/React.createElement(FormField, {
    label: "Shift to cover",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: ""
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "Select a shift\u2026"), /*#__PURE__*/React.createElement("option", null, "Sep 19 \xB7 09:00\u201313:00 \xB7 Reference Desk"), /*#__PURE__*/React.createElement("option", null, "Sep 22 \xB7 13:00\u201317:00 \xB7 Circulation"))), /*#__PURE__*/React.createElement(FormField, {
    label: "Reason",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: ""
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "Select\u2026"), /*#__PURE__*/React.createElement("option", null, "Exam conflict"), /*#__PURE__*/React.createElement("option", null, "Illness"), /*#__PURE__*/React.createElement("option", null, "Family event"), /*#__PURE__*/React.createElement("option", null, "Other"))), /*#__PURE__*/React.createElement(FormField, {
    label: "Details",
    help: "Provide any context for the reviewer."
  }, /*#__PURE__*/React.createElement(Textarea, {
    rows: 3,
    placeholder: "Brief explanation\u2026"
  })))));
}
window.SubstitutionScreen = SubstitutionScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/SubstitutionScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student/data.js
try { (() => {
// Shared mock data for the STREAM UI kits (student + admin).
window.STREAM_DATA = {
  student: {
    name: "Kim Minjun",
    sid: "20241023",
    dept: "Economics",
    initials: "KM"
  },
  posts: [{
    id: "p1",
    title: "Central Library — Reference Desk Assistant",
    dept: "Central Library",
    type: "Semester",
    hours: "12 hrs/week",
    wage: "₩10,030/hr",
    slots: 4,
    applied: 18,
    closes: "Sep 15",
    status: "open",
    tags: ["On-campus", "Weekday"]
  }, {
    id: "p2",
    title: "IT Helpdesk — Student Support",
    dept: "Information & Communications",
    type: "Semester",
    hours: "10 hrs/week",
    wage: "₩10,030/hr",
    slots: 2,
    applied: 27,
    closes: "Sep 12",
    status: "open",
    tags: ["On-campus", "Rotating"]
  }, {
    id: "p3",
    title: "Admissions Office — Data Entry",
    dept: "Admissions Office",
    type: "Short-term",
    hours: "8 hrs/week",
    wage: "₩10,030/hr",
    slots: 3,
    applied: 9,
    closes: "Sep 18",
    status: "open",
    tags: ["On-campus", "Weekday"]
  }, {
    id: "p4",
    title: "Loyola Library — Circulation Support",
    dept: "Loyola Library",
    type: "Semester",
    hours: "12 hrs/week",
    wage: "₩10,030/hr",
    slots: 2,
    applied: 22,
    closes: "Sep 9",
    status: "closing",
    tags: ["On-campus", "Weekend"]
  }, {
    id: "p5",
    title: "Career Center — Event Operations",
    dept: "Career Development Center",
    type: "Short-term",
    hours: "6 hrs/week",
    wage: "₩10,030/hr",
    slots: 5,
    applied: 4,
    closes: "Sep 20",
    status: "open",
    tags: ["On-campus", "Flexible"]
  }],
  applications: [{
    id: "a1",
    post: "Central Library — Reference Desk Assistant",
    dept: "Central Library",
    submitted: "2025-09-02",
    status: "screening"
  }, {
    id: "a2",
    post: "IT Helpdesk — Student Support",
    dept: "Information & Communications",
    submitted: "2025-09-01",
    status: "submitted"
  }, {
    id: "a3",
    post: "Career Center — Event Operations",
    dept: "Career Development Center",
    submitted: "2025-08-28",
    status: "selected"
  }, {
    id: "a4",
    post: "Loyola Library — Night Shelving",
    dept: "Loyola Library",
    submitted: "2025-08-20",
    status: "rejected"
  }],
  shifts: [{
    day: "Mon",
    date: "Sep 8",
    time: "09:00–13:00",
    place: "Central Library · Reference Desk",
    hours: 4,
    status: "scheduled"
  }, {
    day: "Tue",
    date: "Sep 9",
    time: "13:00–17:00",
    place: "Central Library · Circulation",
    hours: 4,
    status: "scheduled"
  }, {
    day: "Thu",
    date: "Sep 11",
    time: "09:00–12:00",
    place: "Central Library · Reference Desk",
    hours: 3,
    status: "scheduled"
  }, {
    day: "Fri",
    date: "Sep 12",
    time: "14:00–18:00",
    place: "Central Library · Reading Room",
    hours: 4,
    status: "swap"
  }],
  substitutions: [{
    id: "s1",
    shift: "Sep 12 · 14:00–18:00",
    place: "Reading Room",
    reason: "Midterm exam conflict",
    covered: "Lee Seoyeon",
    status: "approved",
    filed: "Sep 5"
  }, {
    id: "s2",
    shift: "Sep 19 · 09:00–13:00",
    place: "Reference Desk",
    reason: "Family event",
    covered: "—",
    status: "pending",
    filed: "Sep 6"
  }, {
    id: "s3",
    shift: "Aug 29 · 13:00–17:00",
    place: "Circulation",
    reason: "Illness",
    covered: "Park Jiho",
    status: "covered",
    filed: "Aug 28"
  }],
  attendance: [{
    date: "Sep 5",
    shift: "09:00–13:00",
    place: "Reference Desk",
    checkIn: "08:57",
    checkOut: "13:02",
    hours: 4.0,
    status: "present"
  }, {
    date: "Sep 4",
    shift: "13:00–17:00",
    place: "Circulation",
    checkIn: "13:08",
    checkOut: "17:00",
    hours: 3.9,
    status: "late"
  }, {
    date: "Sep 2",
    shift: "09:00–12:00",
    place: "Reference Desk",
    checkIn: "08:55",
    checkOut: "12:00",
    hours: 3.1,
    status: "present"
  }, {
    date: "Aug 29",
    shift: "13:00–17:00",
    place: "Circulation",
    checkIn: "—",
    checkOut: "—",
    hours: 0,
    status: "excused"
  }, {
    date: "Aug 28",
    shift: "09:00–13:00",
    place: "Reading Room",
    checkIn: "—",
    checkOut: "—",
    hours: 0,
    status: "absent"
  }],
  // ---- Admin ----
  applicants: [{
    id: "u1",
    name: "Kim Minjun",
    sid: "20241023",
    major: "Economics",
    year: 2,
    gpa: "3.8",
    applied: "Sep 2",
    status: "screening",
    score: 87
  }, {
    id: "u2",
    name: "Lee Seoyeon",
    sid: "20239981",
    major: "Business",
    year: 3,
    gpa: "3.9",
    applied: "Sep 1",
    status: "screening",
    score: 91
  }, {
    id: "u3",
    name: "Park Jiho",
    sid: "20244412",
    major: "Computer Science",
    year: 2,
    gpa: "3.6",
    applied: "Sep 2",
    status: "submitted",
    score: 78
  }, {
    id: "u4",
    name: "Choi Yuna",
    sid: "20238820",
    major: "English Literature",
    year: 4,
    gpa: "4.0",
    applied: "Aug 31",
    status: "selected",
    score: 95
  }, {
    id: "u5",
    name: "Jung Haeun",
    sid: "20245510",
    major: "Media & Comm.",
    year: 1,
    gpa: "3.5",
    applied: "Sep 3",
    status: "waitlist",
    score: 72
  }, {
    id: "u6",
    name: "Yoon Doyoon",
    sid: "20241199",
    major: "Physics",
    year: 3,
    gpa: "3.7",
    applied: "Sep 1",
    status: "submitted",
    score: 81
  }],
  workers: [{
    id: "w1",
    name: "Choi Yuna",
    sid: "20238820",
    dept: "Central Library",
    role: "Reference Desk",
    hours: 48.5,
    attendance: "98%",
    status: "present"
  }, {
    id: "w2",
    name: "Kim Minjun",
    sid: "20241023",
    dept: "Central Library",
    role: "Circulation",
    hours: 44.0,
    attendance: "95%",
    status: "present"
  }, {
    id: "w3",
    name: "Han Jiwoo",
    sid: "20239001",
    dept: "IT Helpdesk",
    role: "Support",
    hours: 40.0,
    attendance: "92%",
    status: "absent"
  }, {
    id: "w4",
    name: "Seo Minseo",
    sid: "20244102",
    dept: "Admissions",
    role: "Data Entry",
    hours: 36.5,
    attendance: "89%",
    status: "late"
  }, {
    id: "w5",
    name: "Oh Taeyang",
    sid: "20238333",
    dept: "Career Center",
    role: "Event Ops",
    hours: 30.0,
    attendance: "100%",
    status: "present"
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/data.js", error: String((e && e.message) || e) }); }

// ui_kits/student/student-data.js
try { (() => {
// STREAM student portal — mock data (loaded as plain script; exposed on window)

// SAINT global nav (student context)
const saintNav = ['학생정보', '학적변동', '수업/성적', '등록/장학', '졸업', '학생신청', '학생활동', '시설'];

// STREAM student sidebar
const streamMenu = [{
  id: 'posts',
  label: '교내 근로 모집 공고',
  icon: 'megaphone'
}, {
  id: 'apply',
  label: '지원서 작성',
  icon: 'file-pen-line'
}, {
  id: 'status',
  label: '내 지원 현황',
  icon: 'clipboard-list'
}, {
  id: 'schedule',
  label: '근무 시간표',
  icon: 'calendar-days'
}, {
  id: 'substitute',
  label: '대타 요청',
  icon: 'repeat'
}, {
  id: 'attendance',
  label: '출결 내역',
  icon: 'list-checks'
}];
const currentUser = {
  name: '안희진',
  role: '학생',
  studentId: '202312345',
  major: '경영학과',
  phone: '010-1234-5678',
  email: 'heejin@sogang.ac.kr'
};

// Recruitment posts
const posts = [{
  id: 'P001',
  status: '모집중',
  dept: '학생지원팀',
  title: '행정 업무 보조',
  team: '학생지원팀',
  period: '2026.06.02 ~ 2026.08.29',
  hours: '10:00 ~ 13:00 (3H)',
  headcount: '2명',
  weeklyMax: '최대 15시간',
  preferred: '엑셀 활용 가능자, 문서작성 가능자',
  dday: 'D-3',
  deadline: '2026.05.25 (월) 23:59',
  applied: false,
  category: '교내 부서'
}, {
  id: 'P002',
  status: '지원완료',
  dept: '로욜라도서관',
  title: '참고서비스 제공',
  team: '정보서비스팀',
  period: '2026.05.02 ~ 2026.08.29',
  hours: '14:00 ~ 17:00 (3H)',
  headcount: '1명',
  weeklyMax: '최대 15시간',
  preferred: '도서정리, 자료실 이용 안내, 대화인성 지원',
  appliedDate: '2026.05.20 (화) 15:00',
  deadline: '2026.05.25 (월) 23:59',
  applied: true,
  category: '도서관'
}, {
  id: 'P003',
  status: '마감임박',
  dept: '입학처',
  title: '논술 보조',
  team: '입학처',
  period: '2026.06.02 ~ 2026.06.30',
  hours: '종일 (8H)',
  headcount: '2명',
  weeklyMax: '최대 15시간',
  preferred: '꼼꼼하고 성실한 분, 유사 업무 경험자 우대',
  dday: 'D-1',
  deadline: '2026.05.23 (금) 23:59',
  applied: false,
  category: '교내 부서'
}, {
  id: 'P004',
  status: '모집중',
  dept: '종합봉사실',
  title: '증명서·학생증 발급 보조',
  team: '학생서비스',
  period: '2026.06.02 ~ 2026.08.29',
  hours: '09:30~12:30 / 13:00~16:00',
  headcount: '2명',
  weeklyMax: '최대 10시간',
  preferred: '민원 응대 경험, 행정 업무 보조 경험',
  dday: 'D-5',
  deadline: '2026.05.27 (수) 23:59',
  applied: false,
  category: '학과별 사무실'
}];
const postStats = [{
  key: 'total',
  label: '전체 공고',
  value: '12건',
  sub: '전체 등록된 공고',
  icon: 'files',
  tone: 'neutral'
}, {
  key: 'open',
  label: '모집중',
  value: '12건',
  sub: '현재 지원 가능한 공고',
  icon: 'megaphone',
  tone: 'green'
}, {
  key: 'soon',
  label: '마감임박',
  value: '3건',
  sub: '3일 이내 마감',
  icon: 'clock',
  tone: 'orange'
}, {
  key: 'done',
  label: '지원완료',
  value: '2건',
  sub: '내가 지원한 공고',
  icon: 'circle-check',
  tone: 'blue'
}];

// Post detail (default P001)
const postDetail = {
  status: '모집중',
  team: '학생지원팀',
  title: '행정 업무 보조',
  headcount: '2명',
  weeklyMax: '10시간 이내',
  period: '2026.03.02 ~ 2026.06.30',
  deadline: '2026.05.25 23:59',
  duties: ['민원 응대 및 학생지원팀 행정 업무 보조', '문서 정리, 자료 입력, 안내 자료 관리', '부서 내 단순 행정 업무 지원'],
  qualifications: ['엑셀 활용 가능자 우대', '문서 작성 및 자료 정리 경험자 우대', '월/수 요일 근무 가능자 우대'],
  location: '학생지원팀 사무실',
  contactEmail: 'studentoffice@sogang.ac.kr',
  contactPhone: '02-705-8000',
  // grid: red cells (class time / assigned work) keyed "day-time"
  workSlots: ['월-10:00', '월-11:00', '월-12:00', '수-10:00', '수-11:00', '수-12:00']
};

// My applications
const myAppStats = [{
  key: 'all',
  label: '전체',
  value: '8건',
  sub: '내가 지원한 공고',
  icon: 'files',
  tone: 'blue'
}, {
  key: 'done',
  label: '지원 완료',
  value: '5건',
  sub: '제출이 완료된 공고',
  icon: 'circle-check',
  tone: 'green'
}, {
  key: 'review',
  label: '검토 중',
  value: '2건',
  sub: '담당자 검토 중',
  icon: 'clock',
  tone: 'orange'
}, {
  key: 'interview',
  label: '면접 진행',
  value: '1건',
  sub: '면접이 예정된 공고',
  icon: 'users',
  tone: 'purple'
}, {
  key: 'pass',
  label: '최종 합격',
  value: '0건',
  sub: '최종 합격한 공고',
  icon: 'trophy',
  tone: 'gold'
}];

// stepIndex: 0 제출완료, 1 검토중, 2 면접, 3 결과(합/불)
const myApplications = [{
  id: 'A1',
  title: '학생지원팀 행정 보조 근로',
  dept: '학생지원팀',
  cat: '행정/사무 보조',
  period: '2026.06.02 ~ 2026.08.29',
  date: '2026.05.20 (화) 15:30',
  status: '지원 완료',
  step: 0,
  result: null
}, {
  id: 'A2',
  title: '로욜라도서관 자료실 근로',
  dept: '로욜라도서관',
  cat: '도서/자료 정리',
  period: '2026.06.02 ~ 2026.08.29',
  date: '2026.05.18 (일) 11:20',
  status: '검토 중',
  step: 1,
  result: null
}, {
  id: 'A3',
  title: '정보통신원 영상 촬영 및 편집 보조',
  dept: '정보통신원',
  cat: '미디어/콘텐츠',
  period: '2026.06.02 ~ 2026.06.30',
  date: '2026.05.16 (금) 09:15',
  status: '면접 진행',
  step: 2,
  result: null
}, {
  id: 'A4',
  title: '학과 사무실 행정 보조',
  dept: '경영학과',
  cat: '행정/사무 보조',
  period: '2026.06.02 ~ 2026.07.15',
  date: '2026.05.10 (토) 16:45',
  status: '불합격',
  step: 3,
  result: 'fail'
}, {
  id: 'A5',
  title: '국제교류팀 지원 근로',
  dept: '국제교류팀',
  cat: '행정/사무 보조',
  period: '2026.06.02 ~ 2026.07.31',
  date: '2026.05.03 (일) 13:10',
  status: '지원 완료',
  step: 0,
  result: null
}];

// Application detail (A1)
const appDetail = {
  title: '행정 업무 보조',
  team: '학생지원팀',
  status: '지원 완료',
  date: '2026.05.20 (화) 15:30',
  step: 1,
  // stepper highlight up to 검토중
  motivation: '학생지원팀에서 다양한 행정 업무를 경험하며 학교 구성원들에게 실질적인 도움을 주고 싶습니다. 평소 꼼꼼하고 책임감 있게 일을 처리하는 성격을 바탕으로 팀에 기여하고 성장하고자 지원했습니다.',
  experience: '전공 수업 조교 경험을 통해 문서 정리, 데이터 입력, 이메일 응대 등의 행정 업무를 수행해 왔습니다. 꼼꼼한 성격과 원활한 커뮤니케이션 능력으로 팀 협업에 적극적으로 참여할 수 있습니다.',
  attachment: {
    name: '포트폴리오_안희진.pdf',
    date: '2026.05.20 15:29',
    size: '128 KB'
  },
  availSlots: ['화-09:00', '화-10:00', '목-09:00', '목-10:00', '금-09:00', '금-10:00', '월-14:00', '수-14:00', '목-14:00', '수-15:00', '목-15:00', '수-16:00', '목-16:00', '수-17:00', '금-17:00', '수-18:00', '금-18:00'],
  classSlots: ['월-10:00', '수-11:00', '수-12:00', '월-13:00', '금-14:00', '금-15:00', '금-16:00']
};

// Application form defaults
const formJob = {
  team: '학생지원팀',
  title: '행정 업무 보조',
  icon: 'briefcase',
  period: '2026.03.02 ~ 2026.06.30',
  hours: '월·수 10:00 ~ 13:00',
  headcount: '2명',
  weeklyMax: '최대 10시간',
  deadline: '2026.05.25 (월) 23:59'
};
const formRequired = ['학부 재학생', '휴학생 불가', '친절/서비스 마인드', '시간 엄수·성실', '선발 즉시 근무 가능'];
const formPreferred = ['문서 작성/자료 정리 경험', '엑셀 활용 가능', '월·수 오전 근무 가능', '행정 업무 보조 경험'];
const formClassSlots = ['화-14:00', '화-15:00', '목-15:00', '목-16:00'];
const formCheckedSlots = ['월-10:00', '월-11:00', '월-12:00', '월-13:00', '수-10:00', '수-11:00', '수-12:00', '수-13:00'];
const timeRows = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const dayCols = ['월', '화', '수', '목', '금'];
Object.assign(window, {
  saintNav,
  streamMenu,
  currentUser,
  posts,
  postStats,
  postDetail,
  myAppStats,
  myApplications,
  appDetail,
  formJob,
  formRequired,
  formPreferred,
  formClassSlots,
  formCheckedSlots,
  timeRows,
  dayCols
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student/student-data.js", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.FormField = __ds_scope.FormField;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.PageHeader = __ds_scope.PageHeader;

__ds_ns.SidebarNav = __ds_scope.SidebarNav;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.FieldGrid = __ds_scope.FieldGrid;

__ds_ns.PageTitleBar = __ds_scope.PageTitleBar;

__ds_ns.SectionPanel = __ds_scope.SectionPanel;

__ds_ns.ToolbarButton = __ds_scope.ToolbarButton;

__ds_ns.Toolbar = __ds_scope.Toolbar;

})();
