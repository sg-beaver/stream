// Admin · Student Management (active workers)
function StudentsScreen({ ns }) {
  const { PageHeader, Breadcrumb, Card, Table, StatusPill, Button, IconButton, Icon, Avatar, Input, Select, StatCard } = ns;
  const D = window.STREAM_DATA;

  const columns = [
    { key: "name", header: "Student", strong: true, render: v => <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><Avatar name={v} size={28} /> {v}</span> },
    { key: "sid", header: "Student ID", render: v => <span className="stream-tabular">{v}</span> },
    { key: "dept", header: "Department" },
    { key: "role", header: "Role" },
    { key: "hours", header: "Term hours", align: "right", render: v => <span className="stream-tabular">{v.toFixed(1)}</span> },
    { key: "attendance", header: "Attendance", align: "center", render: v => <span className="stream-tabular">{v}</span> },
    { key: "status", header: "Today", render: v => <StatusPill status={v} /> },
    { key: "id", header: "", align: "right", render: () => (
      <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
        <IconButton label="View profile"><Icon name="user" size={16} /></IconButton>
        <IconButton label="Message"><Icon name="mail" size={16} /></IconButton>
      </span>
    ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Student Management" }]} />}
        title="Student Management"
        description="Active work-study students across your departments this term."
        actions={<Button variant="secondary" iconLeft={<Icon name="download" size={15} />}>Export roster</Button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <StatCard label="Active students" value={D.workers.length} icon={<Icon name="users" size={18} />} />
        <StatCard label="Avg attendance" value="94.8" unit="%" deltaTone="up" delta="+1.2 pts" icon={<Icon name="check-circle-2" size={18} />} />
        <StatCard label="Total term hours" value="199" unit="hrs" icon={<Icon name="clock" size={18} />} />
      </div>
      <Card padded={false}>
        <div style={{ display: "flex", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}><Input size="sm" iconLeft={<Icon name="search" size={15} />} placeholder="Search students" /></div>
          <div style={{ width: 170 }}><Select size="sm" defaultValue="all"><option value="all">All departments</option></Select></div>
          <div style={{ width: 150 }}><Select size="sm" defaultValue="all"><option value="all">All status</option><option>Present</option><option>Absent</option></Select></div>
        </div>
        <Table columns={columns} data={D.workers} rowKey="id" />
      </Card>
    </div>
  );
}
window.StudentsScreen = StudentsScreen;
