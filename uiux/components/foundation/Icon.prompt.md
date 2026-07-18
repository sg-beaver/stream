**Icon** — wraps the Lucide glyph set (STREAM's icon library). Needs the Lucide UMD script loaded on the page.

```jsx
<Icon name="calendar-clock" size={18} />
<Icon name="user-check" size={20} color="var(--sogang-red)" />
```

`name` is any Lucide id in kebab-case. Default stroke 1.75 matches the system's thin institutional weight. Inherits `currentColor` by default.
