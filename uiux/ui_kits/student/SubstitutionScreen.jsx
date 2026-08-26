// Student · Substitution Requests
function SubstitutionScreen({ ns, openSub, onCloseSub }) {
  const { PageHeader, Breadcrumb, Card, Table, StatusPill, Button, Icon, Dialog, FormField, Select, Textarea, Alert } = ns;
  const D = window.STREAM_DATA;

  const columns = [
    { key: "shift", header: "Shift", strong: true, render: v => <span className="stream-tabular">{v}</span> },
    { key: "place", header: "Location" },
    { key: "reason", header: "Reason" },
    { key: "covered", header: "Covered by", render: v => v === "—" ? <span style={{ color: "var(--text-subtle)" }}>—</span> : v },
    { key: "filed", header: "Filed" },
    { key: "status", header: "Status", render: v => <StatusPill status={v} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Substitution Requests" }]} />}
        title="Substitution Requests"
        description="Request a substitute when you cannot make a scheduled shift."
        actions={<Button iconLeft={<Icon name="plus" size={16} />} onClick={() => onCloseSub(true)}>New request</Button>}
      />
      <Card padded={false}>
        <Table columns={columns} data={D.substitutions} rowKey="id" />
      </Card>

      <Dialog
        open={openSub}
        title="New substitution request"
        onClose={() => onCloseSub(false)}
        width={500}
        footer={<><Button variant="ghost" onClick={() => onCloseSub(false)}>Cancel</Button><Button onClick={() => onCloseSub(false)}>Submit request</Button></>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Alert tone="warning" icon={<Icon name="clock" size={17} />}>Requests must be filed at least 24 hours before the shift.</Alert>
          <FormField label="Shift to cover" required>
            <Select defaultValue=""><option value="" disabled>Select a shift…</option><option>Sep 19 · 09:00–13:00 · Reference Desk</option><option>Sep 22 · 13:00–17:00 · Circulation</option></Select>
          </FormField>
          <FormField label="Reason" required>
            <Select defaultValue=""><option value="" disabled>Select…</option><option>Exam conflict</option><option>Illness</option><option>Family event</option><option>Other</option></Select>
          </FormField>
          <FormField label="Details" help="Provide any context for the reviewer.">
            <Textarea rows={3} placeholder="Brief explanation…" />
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}
window.SubstitutionScreen = SubstitutionScreen;
