---
name: stream-design
description: Use this skill to generate well-branded interfaces and assets for STREAM, Sogang University's work-study operations subsystem (part of the SAINT ERP), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `styles.css` — link this one file; it imports all tokens + fonts.
- `tokens/` — colors (Sogang Red `#B01116`), typography (Freesentation / Nanum Gothic / Sogang), spacing, elevation, base + component states.
- `components/` — React primitives, grouped: forms, data, layout, navigation, feedback, foundation (Icon). Each has a `.d.ts`, `.prompt.md`, and a `@dsCard` demo.
- `ui_kits/student/` and `ui_kits/admin/` — full interactive screen recreations; read these for real composition patterns.
- `assets/sogang-logo.png` — the university crest + wordmark (only shipped image).

## Rules of thumb
- Institutional, task-oriented, restrained. Sogang Red is for identity + one primary action per view only; everything else is neutral grey.
- Icons: Lucide, thin 1.75 stroke, via the `Icon` component. No emoji, no hand-drawn SVG.
- Numbers tabular; buttons verb-first; Title Case titles, sentence-case everything else.
- Use `StatusPill` for the fixed work-study status vocabulary.
