// Student · Attendance History
function AttendanceScreen({ ns }) {
  const { PageHeader, Breadcrumb, Card, Table, StatusPill, Icon, StatCard, Tabs } = ns;
  const D = window.STREAM_DATA;
  const [tab, setTab] = React.useState("all");
  const rows = tab === "all" ? D.attendance : D.attendance.filter(r => r.status === tab);

  const columns = [
    { key: "date", header: "Date", strong: true },
    { key: "shift", header: "Scheduled", render: v => <span className="stream-tabular">{v}</span> },
    { key: "place", header: "Location" },
    { key: "checkIn", header: "Check-in", align: "center", render: v => <span className="stream-tabular">{v}</span> },
    { key: "checkOut", header: "Check-out", align: "center", render: v => <span className="stream-tabular">{v}</span> },
    { key: "hours", header: "Hours", align: "right", render: v => <span className="stream-tabular">{v.toFixed(1)}</span> },
    { key: "status", header: "Status", render: v => <StatusPill status={v} /> },
  ];

  const totalHrs = D.attendance.reduce((a, r) => a + r.hours, 0);
  const present = D.attendance.filter(r => r.status === "present").length;
  const rate = Math.round((present / D.attendance.length) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Attendance History" }]} />}
        title="Attendance History"
        description="Your check-in records and logged hours for the term."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <StatCard label="Logged hours (term)" value={totalHrs.toFixed(1)} unit="hrs" icon={<Icon name="clock" size={18} />} />
        <StatCard label="On-time rate" value={rate} unit="%" deltaTone="up" delta="Good standing" icon={<Icon name="check-circle-2" size={18} />} />
        <StatCard label="Absences" value="1" delta="1 excused" deltaTone="neutral" icon={<Icon name="calendar-x" size={18} />} />
      </div>
      <Card padded={false}>
        <div style={{ padding: "6px 14px 0" }}>
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: "all", label: "All" },
            { id: "present", label: "Present" },
            { id: "late", label: "Late" },
            { id: "absent", label: "Absent" },
          ]} />
        </div>
        <Table columns={columns} data={rows} rowKey="date" empty="No records for this filter" />
      </Card>
    </div>
  );
}
window.AttendanceScreen = AttendanceScreen;
