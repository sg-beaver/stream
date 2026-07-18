// Student · Work Schedule (week view)
function ScheduleScreen({ ns, onRequestSub }) {
  const { PageHeader, Breadcrumb, Card, Button, StatusPill, Icon, StatCard } = ns;
  const D = window.STREAM_DATA;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const totalHrs = D.shifts.reduce((a, s) => a + s.hours, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Work Schedule" }]} />}
        title="Work Schedule"
        description="Your assigned shifts for the current week."
        actions={<><Button variant="secondary" iconLeft={<Icon name="download" size={15} />}>Export</Button><Button variant="secondary" iconLeft={<Icon name="chevron-left" size={15} />}>Prev week</Button></>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <StatCard label="Scheduled this week" value={totalHrs} unit="hrs" icon={<Icon name="calendar-days" size={18} />} />
        <StatCard label="Shifts" value={D.shifts.length} icon={<Icon name="clock" size={18} />} />
        <StatCard label="Pending swaps" value="1" deltaTone="neutral" delta="1 awaiting approval" icon={<Icon name="repeat" size={18} />} />
      </div>

      <Card title="Week of Sep 8 – Sep 12" padded={false}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderTop: "1px solid var(--border-subtle)" }}>
          {days.map((d, i) => {
            const shift = D.shifts.find(s => s.day === d);
            return (
              <div key={d} style={{ borderRight: i < 4 ? "1px solid var(--border-subtle)" : "none", minHeight: 180, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", background: "var(--neutral-25)" }}>
                  <div style={{ fontSize: "var(--fs-caption)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)" }}>{d}</div>
                  <div style={{ fontSize: "var(--fs-micro)", color: "var(--text-muted)" }}>{shift ? shift.date : "—"}</div>
                </div>
                <div style={{ padding: 10, flex: 1 }}>
                  {shift && (
                    <div style={{ border: "1px solid var(--sogang-red-100)", background: "var(--sogang-red-50)", borderRadius: "var(--radius-sm)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      <span className="stream-tabular" style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--sogang-red)" }}>{shift.time}</span>
                      <span style={{ fontSize: "var(--fs-micro)", color: "var(--text-body)", lineHeight: 1.35 }}>{shift.place}</span>
                      {shift.status === "swap" ? <StatusPill status="pending" label="Swap requested" tone="warning" /> :
                        <Button variant="ghost" size="sm" style={{ padding: "0 6px", height: 24, justifyContent: "flex-start" }} onClick={onRequestSub} iconLeft={<Icon name="repeat" size={13} />}>Request sub</Button>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
window.ScheduleScreen = ScheduleScreen;
