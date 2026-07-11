// Student · Recruitment Posts — browse & apply
function PostsScreen({ ns, onApply }) {
  const { PageHeader, Breadcrumb, Card, Button, Input, Select, Badge, StatusPill, Icon } = ns;
  const D = window.STREAM_DATA;
  const [q, setQ] = React.useState("");
  const posts = D.posts.filter(p => p.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Recruitment Posts" }]} />}
        title="Recruitment Posts"
        description="On-campus work-study positions open for the Fall 2025 term."
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Input value={q} onChange={e => setQ(e.target.value)} iconLeft={<Icon name="search" size={15} />} placeholder="Search positions or departments" />
        </div>
        <div style={{ width: 190 }}><Select defaultValue="all"><option value="all">All departments</option><option>Central Library</option><option>IT Helpdesk</option></Select></div>
        <div style={{ width: 150 }}><Select defaultValue="all"><option value="all">All types</option><option>Semester</option><option>Short-term</option></Select></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {posts.map(p => (
          <Card key={p.id} bodyStyle={{ padding: 18 }} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <StatusPill status={p.status === "closing" ? "warning" : "open"} label={p.status === "closing" ? "Closing soon" : "Open"} tone={p.status === "closing" ? "warning" : "success"} />
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>Closes {p.closes}</span>
            </div>
            <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", color: "var(--text-strong)", lineHeight: 1.35, marginBottom: 6 }}>{p.title}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: "var(--fs-sm)", marginBottom: 14 }}>
              <Icon name="map-pin" size={14} /> {p.dept}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", fontSize: "var(--fs-sm)", color: "var(--text-body)", marginBottom: 16 }}>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="clock" size={14} color="var(--text-muted)" /> {p.hours}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="banknote" size={14} color="var(--text-muted)" /> {p.wage}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="users" size={14} color="var(--text-muted)" /> {p.slots} openings</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="file-text" size={14} color="var(--text-muted)" /> {p.applied} applied</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {p.tags.map(t => <Badge key={t} tone="neutral">{t}</Badge>)}
            </div>
            <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
              <Button block onClick={() => onApply(p)}>Apply</Button>
              <Button variant="secondary" iconLeft={<Icon name="bookmark" size={15} />} aria-label="Save"></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
window.PostsScreen = PostsScreen;
