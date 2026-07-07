// Admin · Student Selection (review applicants for a post)
function SelectionScreen({ ns }) {
  const { PageHeader, Breadcrumb, Card, Table, StatusPill, Button, Icon, Avatar, Checkbox, Badge, Tabs } = ns;
  const D = window.STREAM_DATA;
  const [tab, setTab] = React.useState("all");
  const [sel, setSel] = React.useState({});
  const [rows, setRows] = React.useState(D.applicants);

  const shown = tab === "all" ? rows : rows.filter(r => r.status === tab);
  const selectedIds = Object.keys(sel).filter(k => sel[k]);
  const toggle = (id) => setSel(s => ({ ...s, [id]: !s[id] }));
  const setStatus = (id, status) => setRows(rs => rs.map(r => r.id === id ? { ...r, status } : r));

  const columns = [
    { key: "_sel", header: <Checkbox />, width: 40, render: (_, r) => <Checkbox checked={!!sel[r.id]} onChange={() => toggle(r.id)} /> },
    { key: "name", header: "Applicant", strong: true, render: (v) => <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><Avatar name={v} size={28} /> {v}</span> },
    { key: "sid", header: "Student ID", render: v => <span className="stream-tabular">{v}</span> },
    { key: "major", header: "Major" },
    { key: "year", header: "Yr", align: "center" },
    { key: "gpa", header: "GPA", align: "center", render: v => <span className="stream-tabular">{v}</span> },
    { key: "score", header: "Match", align: "center", render: v => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 42, height: 6, borderRadius: 999, background: "var(--neutral-100)", overflow: "hidden", display: "inline-block" }}>
          <span style={{ display: "block", height: "100%", width: v + "%", background: v >= 85 ? "var(--success)" : v >= 75 ? "var(--warning)" : "var(--neutral-400)", borderRadius: 999 }} />
        </span>
        <span className="stream-tabular" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>{v}</span>
      </span>
    ) },
    { key: "status", header: "Decision", render: v => <StatusPill status={v} /> },
    { key: "id", header: "", align: "right", render: (_, r) => (
      <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
        <Button size="sm" variant="secondary" onClick={() => setStatus(r.id, "selected")}>Select</Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "rejected")}>Reject</Button>
      </span>
    ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Recruitment", href: "#" }, { label: "Central Library — Selection" }]} />}
        title="Student Selection"
        description="Central Library — Reference Desk Assistant · 4 openings · 18 applicants."
      />
      <Card padded={false}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px 0", borderBottom: "1px solid var(--border-subtle)" }}>
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: "all", label: "All", badge: rows.length },
            { id: "submitted", label: "New" },
            { id: "screening", label: "Screening" },
            { id: "selected", label: "Selected" },
            { id: "waitlist", label: "Waitlist" },
          ]} />
        </div>
        {selectedIds.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "var(--sogang-red-50)", borderBottom: "1px solid var(--sogang-red-100)" }}>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--sogang-red)" }}>{selectedIds.length} selected</span>
            <Button size="sm" onClick={() => { selectedIds.forEach(id => setStatus(id, "selected")); setSel({}); }}>Select all</Button>
            <Button size="sm" variant="secondary" onClick={() => { selectedIds.forEach(id => setStatus(id, "waitlist")); setSel({}); }}>Waitlist</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel({})}>Clear</Button>
          </div>
        )}
        <Table columns={columns} data={shown} rowKey="id" empty="No applicants in this stage" />
      </Card>
    </div>
  );
}
window.SelectionScreen = SelectionScreen;
