# STREAM 디자인 시스템

**STREAM**은 **서강대학교 SAINT ERP의 서브시스템**입니다. 대학의 캠퍼스 내 **교내 근로** 생애주기를 체계화합니다: 모집, 지원자 선발, 시간표, 대타 요청, 출결 관리. 이 디자인 시스템은 STREAM의 두 인터페이스 — **학생 포털**과 **직원/관리자 콘솔** — 을 구축하는 데 필요한 토큰, 컴포넌트, 전체 화면 UI 키트를 공급하며, 공식 대학 ERP와 일관된 톤으로 유지됩니다.

> **설계 지침:** 교내 근로 와이어프레임을 정교한 관리 인터페이스로 재설계하면서 기존 정보 아키텍처를 유지합니다. 단순하고 구조적이며 작업 중심 — 스타트업 스타일은 아닙니다.

## Sources provided
- **Fonts:** `SOGANG_UNIVERSITY_for_mac.otf` (display), Nanum Gothic family (KR body), Freesentation family — 9 weights (primary UI). All in `uploads/`, copied into `fonts/`.
- **Logo:** `sogang-logo.png` — the Sogang University crest (IHS shield) + Korean/English wordmark. Copied to `assets/`.
- **No wireframe files were attached.** The information architecture below is taken from the written brief; screens were designed fresh against it. → *If the original wireframes exist, share them and the UI kits will be reconciled to match.*

## Information architecture (preserved from brief)
- **Student:** Recruitment Posts · Application Form · My Applications · Work Schedule · Substitution Requests · Attendance History.
- **Staff / Admin:** Recruitment Posts · Student Selection · Student Management · Work Schedule · Operations Dashboard.

---

## Content fundamentals
How STREAM writes copy — the register of a public university administrative system, in English with Korean where the brand voice calls for it.

- **Voice:** institutional, plain, and instructional. Neutral third-person for system labels ("Recruitment Posts", "Student Selection"); direct second person ("you") only in student-facing guidance ("Submit your application before Sept 15"). Never marketing-y, never chatty.
- **Casing:** **Title Case** for page titles and nav items ("Work Schedule", "Operations Dashboard"). **Sentence case** for descriptions, help text, table cells, and buttons ("Request a substitute when you cannot make a scheduled shift"). **UPPERCASE + letter-spacing** only for small overlines/eyebrows and table column headers.
- **Buttons:** verb-first and specific — "Submit application", "Review applicants", "Request sub", "Export roster". Avoid bare "OK"/"Submit".
- **Status language:** a fixed work-study vocabulary drives `StatusPill`: *Open, Closing soon, Submitted, Screening, Selected, Waitlisted, Not selected* (applications); *Present, Late, Absent, Excused* (attendance); *Pending, Approved, Declined, Covered* (substitutions). Reuse these exact terms.
- **Numbers & units:** always tabular figures; explicit units and KST times ("12 hrs/week", "09:00–13:00", "₩10,030/hr", "Closes Sep 15"). Dates as "Sep 15" or "2025-09-02" in records.
- **Korean:** long-form Korean copy is set in Nanum Gothic; UI chrome can mix Hangul + Latin in Freesentation. Example: "지원 마감일은 9월 15일입니다."
- **Emoji:** none. This is an official ERP. Iconography carries visual meaning instead.
- **Tone example:** *"Applications close in 3 days — submit before Sept 15, 23:59 KST."* Informative, time-bound, no exclamation-mark hype.

## Visual foundations
- **Color:** Sogang Red `#B01116` (sampled from the crest) is the identity + primary-action color, used sparingly against a cool neutral-grey field. Silver `#B3B5B8` echoes the crest chevron. A full neutral ramp (`--neutral-0…900`) carries surfaces, borders, and text; semantic Success / Warning / Danger / Info each have a base + two tints. Red is *reserved* — it is not a decorative fill. Backgrounds are flat `--neutral-50` pages with white cards; **no gradients, no textures, no imagery washes.**
- **Type:** three families — **Sogang** (display, brand lockups/mastheads only), **Freesentation** (all UI: headings 800/700 with tight tracking, body 400/500), **Nanum Gothic** (long-form Korean). Compact institutional scale (display 34 → micro 11); body is 14px. Numerals are tabular throughout data views.
- **Spacing:** 4px base grid (`--space-*`). Fixed layout constants: 56px top bar, 244px sidebar, 1200px content max.
- **Corner radii:** modest — cards `--radius-md` (7px), controls `--radius-sm` (5px), pills only for status/counters. Nothing is heavily rounded.
- **Elevation:** low, soft, cool-grey shadows (`--shadow-xs…lg`). Cards use a 1px `--border-subtle` **plus** a faint shadow — never a colored left-border accent. Modals use `--shadow-lg` over a `rgba(22,24,28,.44)` scrim with a 1px blur.
- **Borders:** hairline `--neutral-200/300` separate rows, cards, and sections. Tables use subtle row separators, not full gridlines.
- **Motion:** functional and quick. `--dur-fast 120ms` / `--dur-normal 180ms` with a standard ease; hovers and toggles only. No bounces, no decorative looping animation. Respect the institutional restraint.
- **Interaction states:** hover = subtle grey fill (`--surface-hover`) or a darker red for primary; press = the deeper red/grey step; focus = 3px Sogang-red focus ring (`--focus-ring`). Active nav item shows a red left-rail bar + red label + red-tinted background.
- **Transparency/blur:** used only on the modal scrim. Surfaces are otherwise opaque.
- **Imagery:** none shipped beyond the logo — this ERP is data-first. Avatars fall back to red-tinted initials.

## Iconography
- **Library:** **[Lucide](https://lucide.dev)** — thin, consistent 1.75px stroke that matches the system's restrained institutional weight. **Substitution flag:** Sogang provided no icon set, so Lucide is used as the closest-fitting stroke library; swap it out if the university has an official glyph set.
- **Delivery:** loaded from CDN (`unpkg.com/lucide`). The `Icon` component wraps it — `<Icon name="calendar-clock" size={18} />` (kebab-case Lucide ids).
- **Usage:** icons appear in nav items, buttons, stat cards, table row actions, and empty states — always paired with text in navigation and actions; icon-only allowed in dense table row-action clusters (via `IconButton`, always with an accessible `label`). Common glyphs: `briefcase, file-text, calendar-days, repeat, clipboard-check, user-check, users, clock, bell, search, plus, download, check-circle-2, alert-triangle, inbox`.
- **No emoji, no hand-drawn SVG, no unicode-as-icon.**

## Intentional additions
- **`Icon`** (foundation) — a thin wrapper over the Lucide set. Added because the brand supplied no icons but the ERP needs a consistent glyph system; documented above as a flagged substitution.

---

## Index (manifest)

**Root**
- `styles.css` — the single entry point consumers link (import list only).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `base.css`, `components.css`.
- `fonts/` — Freesentation (6 weights), Nanum Gothic (2), Sogang display.
- `assets/` — `sogang-logo.png`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `components/` — reusable React primitives (below).
- `ui_kits/` — full-screen product recreations (below).
- `SKILL.md` — Agent-Skill wrapper for use in Claude Code.

**Components** (`window.STREAMDesignSystem_b095d7.<Name>`)
- *Foundation:* `Icon`
- *SAINT layout:* `PageTitleBar`, `SectionPanel`, `Field` / `FieldGrid`, `Toolbar` / `ToolbarButton`
- *Forms:* `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `FormField`
- *Data:* `Badge`, `StatusPill`, `Avatar`, `Table`, `StatCard`, `Pagination`
- *Layout:* `Card`, `PageHeader`, `Breadcrumb`
- *Navigation:* `SidebarNav`, `TopBar`, `Tabs`
- *Feedback:* `Alert`, `Dialog`, `EmptyState`

**UI kits**
- `ui_kits/student/` — **Student Portal**: Recruitment Posts, My Applications (+ application dialog), Work Schedule, Substitution Requests, Attendance History.
- `ui_kits/admin/` — **Staff / Admin Console**: Operations Dashboard, Recruitment Posts, Student Selection, Student Management, Work Schedule.
