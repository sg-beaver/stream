**Button** — the primary institutional action control; use exactly one `primary` per view, `secondary` for supporting actions, `ghost` inline, `danger` for destructive confirms.

```jsx
<Button variant="primary" size="md" onClick={submit}>Submit application</Button>
<Button variant="secondary" iconLeft={<Icon name="download" />}>Export CSV</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="danger">Withdraw</Button>
```

Variants: `primary` · `secondary` · `ghost` · `danger`. Sizes: `sm` (30px) · `md` (38px) · `lg` (44px). Props: `block`, `disabled`, `iconLeft`, `iconRight`.
