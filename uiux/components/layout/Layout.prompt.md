**Layout** — `Card`, `PageHeader`, `Breadcrumb`.

```jsx
<PageHeader
  breadcrumb={<Breadcrumb items={[{label:"STREAM", href:"#"}, {label:"Recruitment"}]} />}
  title="Recruitment Posts"
  description="Open on-campus work-study positions for the current term."
  actions={<Button iconLeft={<Icon name="plus" size={16} />}>New post</Button>}
/>

<Card title="Applicants" subtitle="24 total" actions={<IconButton label="Filter"><Icon name="filter" /></IconButton>}>
  …table…
</Card>
```

`Card` gives 1px border + soft shadow + `--radius-md`; pass `padded={false}` when embedding a full-bleed table. `PageHeader` uses the extrabold H1 institutional treatment.
