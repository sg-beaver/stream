**SAINT layout primitives** — `PageTitleBar`, `SectionPanel`, `Field` / `FieldGrid`, `Toolbar` / `ToolbarButton`. These give screens the real SAINT ERP structure.

```jsx
<PageTitleBar title="교내 근로 모집 공고" right={<a href="#">도움말</a>} />

<SectionPanel title="검색조건" right={<ToolbarButton tone="primary" onClick={search}>조회</ToolbarButton>}>
  <FieldGrid columns={3}>
    <Field label="공고명"><Input size="sm" /></Field>
    <Field label="모집상태"><Select size="sm"><option>전체</option></Select></Field>
    <Field label="등록일자" readOnly>2025-09-01 - 2025-09-30</Field>
  </FieldGrid>
</SectionPanel>

<Toolbar align="end">
  <ToolbarButton icon={<Icon name="plus" size={14} />}>신규 등록</ToolbarButton>
  <ToolbarButton>이전 공고 불러오기</ToolbarButton>
</Toolbar>
```

`SectionPanel` collapses via its chevron header (tan fill). `PageTitleBar` is the maroon-bordered title box. `Field` `readOnly` renders the grey SAINT display box. `ToolbarButton` tones: `default` (bordered) · `primary` (red) · `ghost`.
