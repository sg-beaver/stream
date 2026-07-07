# STREAM — Staff / Admin Console (UI kit)

Interactive recreation of the staff-facing work-study operations console, built from STREAM design-system components.

## Run
Open `index.html`. The sidebar groups views under Overview / Recruitment / Operations.

## Screens
- **DashboardScreen.jsx** — Operations Dashboard. KPI stat cards, department staffing bars, alert banner, recent-activity feed.
- **PostsAdminScreen.jsx** — Recruitment Posts. Manage postings (applicants vs. slots, status, row actions).
- **SelectionScreen.jsx** — Student Selection. Applicant table with match score, bulk-select bar, per-row select/reject, stage tabs.
- **StudentsScreen.jsx** — Student Management. Active workers roster with term hours and attendance.
- **ScheduleAdminScreen.jsx** — Work Schedule. Day × slot assignment grid with student chips and empty add cells.

## Data
Reuses `window.STREAM_DATA` from `../student/data.js`. All content is mock.

## Notes
Screens receive the component namespace as `ns` and register on `window`. Icons: Lucide via CDN. All tokens from `styles.css`.
