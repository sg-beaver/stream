**Form controls** — `Checkbox`, `Radio`, `Switch`, and the `FormField` wrapper.

```jsx
<FormField label="Department" required help="Where you'll be assigned">
  <Select><option>Library</option></Select>
</FormField>

<Checkbox label="I agree to the work-study terms" />
<Radio name="shift" value="am" label="Morning (09:00–13:00)" />
<Switch checked={avail} onChange={e => setAvail(e.target.checked)} label="Available this week" />
```

All use Sogang red as the accent color. `FormField` shows `error` (red) in place of `help` when present.
