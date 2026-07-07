// Student · My Applications  (+ application form dialog)
function ApplicationsScreen({ ns, applyPost, onCloseDialog }) {
  const { PageHeader, Breadcrumb, Card, Table, StatusPill, Button, Icon, Dialog, FormField, Input, Select, Textarea, Checkbox, Alert } = ns;
  const D = window.STREAM_DATA;

  const columns = [
    { key: "post", header: "Position", strong: true },
    { key: "dept", header: "Department" },
    { key: "submitted", header: "Submitted", render: v => <span className="stream-tabular">{v}</span> },
    { key: "status", header: "Status", render: v => <StatusPill status={v} /> },
    { key: "id", header: "", align: "right", render: () => <Button variant="ghost" size="sm" iconRight={<Icon name="chevron-right" size={15} />}>View</Button> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "My Applications" }]} />}
        title="My Applications"
        description="Track the status of every position you have applied to this term."
      />
      <Card padded={false}>
        <Table columns={columns} data={D.applications} rowKey="id" />
      </Card>

      <Dialog
        open={!!applyPost}
        title="Apply — work-study position"
        onClose={onCloseDialog}
        width={520}
        footer={<><Button variant="ghost" onClick={onCloseDialog}>Cancel</Button><Button onClick={onCloseDialog} iconLeft={<Icon name="send" size={15} />}>Submit application</Button></>}
      >
        {applyPost && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Alert tone="info" icon={<Icon name="info" size={17} />}>
              You are applying to <b>{applyPost.title}</b> · {applyPost.dept}.
            </Alert>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormField label="Name"><Input defaultValue={D.student.name} disabled /></FormField>
              <FormField label="Student ID"><Input defaultValue={D.student.sid} disabled /></FormField>
            </div>
            <FormField label="Preferred shift" required>
              <Select defaultValue=""><option value="" disabled>Select a shift…</option><option>Morning (09:00–13:00)</option><option>Afternoon (13:00–17:00)</option><option>Flexible</option></Select>
            </FormField>
            <FormField label="Weekly availability" required help="Select all days you can work.">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 2 }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map(d => <Checkbox key={d} label={d} defaultChecked={["Mon", "Wed"].includes(d)} />)}
              </div>
            </FormField>
            <FormField label="Statement of interest" required help="Why are you a good fit? (max 300 chars)">
              <Textarea rows={3} placeholder="I have prior experience supporting library patrons…" />
            </FormField>
            <Checkbox label="I confirm the information above is accurate and agree to the work-study terms." />
          </div>
        )}
      </Dialog>
    </div>
  );
}
window.ApplicationsScreen = ApplicationsScreen;
