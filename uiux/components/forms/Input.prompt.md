**Input** — single-line text field. Wrap with `FormField` for label + help/error text.

```jsx
<Input placeholder="Student ID" />
<Input size="sm" iconLeft={<Icon name="search" size={15} />} placeholder="Search students" />
<Input invalid defaultValue="bad@" />
```

Sizes `sm`/`md`/`lg`; `invalid` for error border; `iconLeft`/`iconRight` adornments.
