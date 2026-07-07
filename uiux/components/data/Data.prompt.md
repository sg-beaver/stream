**Data display** — `Badge`, `StatusPill`, `Avatar`, `Table`, `StatCard`, `Pagination`.

```jsx
<Badge tone="brand">New</Badge>
<StatusPill status="selected" />        {/* auto label + tone */}
<StatusPill status="present" />
<Avatar name="Kim Minjun" size={34} />

<Table
  columns={[
    { key: "name", header: "Student", strong: true },
    { key: "dept", header: "Department" },
    { key: "status", header: "Status", render: v => <StatusPill status={v} /> },
  ]}
  data={rows}
  onRowClick={openStudent}
/>

<StatCard label="On shift now" value="42" unit="students" delta="+6 vs last week" deltaTone="up" />
<Pagination page={2} pageCount={12} onChange={setPage} />
```

`StatusPill` knows the STREAM work-study vocabulary (open, submitted, selected, present, late, absent, pending, approved…). `Table` is column-config driven with per-column `render`.
