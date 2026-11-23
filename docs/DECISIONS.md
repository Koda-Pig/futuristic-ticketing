# Decisions

Choices made where docs/PLAN.md was ambiguous or had to change. Newest last.

| Date       | Area         | Decision                                                                                                                           | Why                                                                                            |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-11-23 | Tooling      | pnpm instead of npm. Wherever the plan says `npm run x`, use `pnpm x`                                                              | Faster installs; one lockfile                                                                  |
| 2026-11-23 | Shell budget | ≤850k triangles (was 300k)                                                                                                         | The terraces, fascia rails and trusses tore below that; v1 is desktop-only. See docs/ASSETS.md |
| 2026-11-23 | Skyboxes     | The model has no enclosed boxes; the east leather seating is an open hospitality tier. VIP interiors are procedural (§7.4)         | Inspection in M1: the dark "windows" are opaque panels on solid concrete                       |
| 2026-11-23 | Inspector    | The M1 inspector stays plain JS (`src/inspector.js`), loaded lazily from `main.tsx` for `?debug=shell` and `?debug=materials` only | Keeps the working tool without pulling it into the React app bundle                            |
| 2026-11-23 | Testing      | The R3F canvas sets `data-ready` in `onCreated`; e2e waits for it                                                                  | Lets tests tell R3F's context apart from one the test creates                                  |
