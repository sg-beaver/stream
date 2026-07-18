# STREAM — Student Portal (UI kit)

Interactive recreation of the student-facing work-study workflow, built entirely from STREAM components consuming the design-system bundle (`_ds_bundle.js`).

## Run
Open `index.html`. The dark top bar + `SidebarNav` form the app shell; the sidebar switches between five views.

## Screens
- **PostsScreen.jsx** — Recruitment Posts. Card grid of open positions with search/filter; "Apply" opens the application dialog.
- **ApplicationsScreen.jsx** — My Applications. Status table + the application form `Dialog` (preferred shift, availability, statement).
- **ScheduleScreen.jsx** — Work Schedule. Weekly grid with per-shift cards; "Request sub" jumps to Substitutions.
- **SubstitutionScreen.jsx** — Substitution Requests. History table + new-request `Dialog`.
- **AttendanceScreen.jsx** — Attendance History. KPI stat cards + tabbed check-in log.

## Data
`data.js` exposes `window.STREAM_DATA` (shared with the admin kit). All content is mock.

## Notes
- Screens receive the component namespace as the `ns` prop and register themselves on `window`.
- Icons are Lucide (loaded via CDN). Fonts, colors, spacing all come from `styles.css`.
