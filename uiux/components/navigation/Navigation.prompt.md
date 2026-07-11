**Navigation** — `SidebarNav`, `TopBar`, `Tabs`. Together they form the STREAM app shell.

```jsx
<TopBar
  brand={<img src="assets/sogang-logo.png" style={{height:24}} />}
  title="STREAM · Work-Study"
  right={<Avatar name="Admin User" size={30} />}
/>
<div style={{display:"flex", height:"calc(100vh - 56px)"}}>
  <SidebarNav
    active={view}
    onSelect={setView}
    sections={[
      { label:"Student", items:[
        { id:"posts", label:"Recruitment Posts", icon:<Icon name="briefcase" size={18}/> },
        { id:"apps", label:"My Applications", icon:<Icon name="file-text" size={18}/>, badge:2 },
      ]},
    ]}
  />
  <main>…</main>
</div>

<Tabs active={tab} onChange={setTab} tabs={[
  {id:"all", label:"All", badge:24}, {id:"screening", label:"Screening"},
]} />
```

`SidebarNav` shows a red left-rail indicator + red text on the active item; `TopBar` is the dark `--surface-header` bar.
