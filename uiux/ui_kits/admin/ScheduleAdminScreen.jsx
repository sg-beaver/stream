// Admin · Work Schedule (assignment grid)
function ScheduleAdminScreen({ ns }) {
  const { PageHeader, Breadcrumb, Card, Button, Icon, Avatar, StatusPill } = ns;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const slots = ["09:00–13:00", "13:00–17:00"];

  // assignment map: `${day}-${slot}` -> assignment
  const grid = {
    "Mon-09:00–13:00": { who: "Choi Yuna", place: "Reference Desk" },
    "Mon-13:00–17:00": { who: "Kim Minjun", place: "Circulation" },
    "Tue-09:00–13:00": { who: "Choi Yuna", place: "Reference Desk" },
    "Tue-13:00–17:00": { who: "Kim Minjun", place: "Circulation", swap: true },
    "Wed-09:00–13:00": { who: "Han Jiwoo", place: "Reading Room" },
    "Thu-09:00–13:00": { who: "Choi Yuna", place: "Reference Desk" },
    "Thu-13:00–17:00": { who: "Seo Minseo", place: "Circulation" },
    "Fri-13:00–17:00": { who: "Kim Minjun", place: "Reading Room" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: "STREAM", href: "#" }, { label: "Work Schedule" }]} />}
        title="Work Schedule"
        description="Central Library · assign and adjust student shifts for the week."
        actions={<><Button variant="secondary" iconLeft={<Icon name="chevron-left" size={15} />}>Prev</Button><Button variant="secondary" iconLeft={<Icon name="wand-2" size={15} />}>Auto-fill</Button><Button iconLeft={<Icon name="plus" size={15} />}>Add shift</Button></>}
      />
      <Card title="Week of Sep 8 – Sep 12" padded={false}>
        <div style={{ display: "grid", gridTemplateColumns: "110px repeat(5,1fr)", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ background: "var(--neutral-25)", borderRight: "1px solid var(--border-subtle)" }} />
          {days.map((d, i) => (
            <div key={d} style={{ padding: "10px 12px", textAlign: "center", background: "var(--neutral-25)", borderRight: i < 4 ? "1px solid var(--border-subtle)" : "none", borderBottom: "1px solid var(--border-subtle)", fontSize: "var(--fs-caption)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)" }}>{d}</div>
          ))}
          {slots.map(slot => (
            <React.Fragment key={slot}>
              <div style={{ padding: "12px", borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--neutral-25)", fontSize: "var(--fs-micro)", color: "var(--text-muted)", fontWeight: "var(--fw-semibold)" }} className="stream-tabular">{slot}</div>
              {days.map((d, i) => {
                const a = grid[`${d}-${slot}`];
                return (
                  <div key={d + slot} style={{ borderRight: i < 4 ? "1px solid var(--border-subtle)" : "none", borderBottom: "1px solid var(--border-subtle)", padding: 8, minHeight: 74 }}>
                    {a ? (
                      <div style={{ border: `1px solid ${a.swap ? "var(--warning-100)" : "var(--sogang-red-100)"}`, background: a.swap ? "var(--warning-50)" : "var(--sogang-red-50)", borderRadius: "var(--radius-sm)", padding: "7px 8px", display: "flex", flexDirection: "column", gap: 5, height: "100%" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Avatar name={a.who} size={20} />
                          <span style={{ fontSize: "var(--fs-caption)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.who}</span>
                        </span>
                        <span style={{ fontSize: "var(--fs-micro)", color: "var(--text-muted)" }}>{a.place}</span>
                        {a.swap && <StatusPill status="pending" label="Swap" tone="warning" />}
                      </div>
                    ) : (
                      <button style={{ width: "100%", height: "100%", border: "1px dashed var(--border-default)", background: "transparent", borderRadius: "var(--radius-sm)", color: "var(--text-subtle)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</button>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}
window.ScheduleAdminScreen = ScheduleAdminScreen;
