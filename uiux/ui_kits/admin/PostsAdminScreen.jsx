// Admin · Recruitment Posts (manage)
function PostsAdminScreen({ ns }) {
  const { PageHeader, Breadcrumb, Card, Table, StatusPill, Button, IconButton, Icon, Input, Select } = ns;
  const D = window.STREAM_DATA;

  const columns = [
    { key: "title", header: "Position", strong: true },
    { key: "dept", header: "Department" },
    { key: "type", header: "Type", render: v => <span style={{ color: "var(--text-muted)" }}>{v}</span> },
    { key: "applied", header: "Applicants", align: "center", render: (v, r) => <span className="stream-tabular">{v} / {r.slots}</span> },
    { key: "closes", header: "Closes", render: v => <span className="stream-tabular">{v}</span> },
    { key: "status", header: "Status", render: v => <StatusPill status={v === "closing" ? "warning" : "open"} label={v === "closing" ? "Closing soon" : "Open"} tone={v === "closing" ? "warning" : "success"} /> },
    { key: "id", header: "", align: "right", render: () => (
      <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
        <IconButton label="Review applicants"><Icon name="users" size={16} /></IconButton>
        <IconButton label="Edit"><Icon name="pencil" size={16} /></IconButton>
        <IconButton label="More"><Icon name="more-horizontal" size={16} /></IconButton>
      </span>
    ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Recruitment Posts" }]} />}
        title="Recruitment Posts"
        description="Create and manage work-study postings for your departments."
        actions={<Button iconLeft={<Icon name="plus" size={16} />}>New post</Button>}
      />
      <Card padded={false}>
        <div style={{ display: "flex", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}><Input size="sm" iconLeft={<Icon name="search" size={15} />} placeholder="Search postings" /></div>
          <div style={{ width: 170 }}><Select size="sm" defaultValue="all"><option value="all">All departments</option></Select></div>
          <div style={{ width: 140 }}><Select size="sm" defaultValue="open"><option value="open">Open</option><option>Closed</option><option>Draft</option></Select></div>
        </div>
        <Table columns={columns} data={D.posts} rowKey="id" />
      </Card>
    </div>
  );
}
window.PostsAdminScreen = PostsAdminScreen;
