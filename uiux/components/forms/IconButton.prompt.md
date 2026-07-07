**IconButton** — square, icon-only action for toolbars and table rows. Always pass `label` for accessibility.

```jsx
<IconButton label="Edit" onClick={edit}><Icon name="pencil" size={16} /></IconButton>
<IconButton variant="outline" label="More"><Icon name="more-horizontal" /></IconButton>
```

Sizes `sm`/`md`/`lg`. Variants `ghost` (default) · `outline`.
