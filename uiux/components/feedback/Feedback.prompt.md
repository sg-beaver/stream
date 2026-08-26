**Feedback** — `Alert`, `Dialog`, `EmptyState`.

```jsx
<Alert tone="warning" title="Applications close in 3 days" icon={<Icon name="clock" size={18} />} onDismiss={hide}>
  Submit your work-study application before Sept 15, 23:59 KST.
</Alert>

<EmptyState icon={<Icon name="inbox" size={22} />} title="No applications yet"
  message="You haven't applied to any positions this term."
  action={<Button>Browse recruitment posts</Button>} />

<Dialog open={open} title="Confirm withdrawal" onClose={close}
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Withdraw</Button></>}>
  This will withdraw your application. This action cannot be undone.
</Dialog>
```

Tones: `info` · `success` · `warning` · `danger` · `neutral`.
