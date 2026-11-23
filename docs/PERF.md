# M3 overview

The production entry, runtime, schema, Three.js and stadium chunks total approximately 471 kB gzip in the local Vite build. The JavaScript budget is 600 kB gzip. This figure excludes the on-demand inspector and calibration routes.

The desktop Chromium hover check covers all eight Cape Point stands. A frame-rate measurement on an M1 MacBook Air at 1440p and DPR 1.5, renderer draw-call and triangle counts, and a desktop Lighthouse run against a Netlify preview are pending.

## M5 seat view

The local production entry, runtime, stadium, schema and Three.js chunks total about 475 kB gzip against the 600 kB JavaScript budget. The sold-seat crowd uses one instanced draw per scene render. Entering a seat adds one 800 × 450 snapshot render. A desktop Lighthouse score for a Netlify preview is pending.

Chromium screenshots at 960 × 640 showed the pitch from both acceptance seats. Block 101, row 1, seat 2 looks across the near touchline. Block 301, row 10, seat 1 sees both goals beneath the roof with the crowd below. Neither settled view showed geometry intersecting the camera.

## M8 release

Measured 2026-11-23 with `GPU=1 pnpm e2e perf` (`e2e/perf.spec.ts`). The test runs Google Chrome on an Apple M5 (ANGLE Metal) at 1707 × 960 CSS px, DPR 1.5 (2560 × 1440 device pixels). It samples the `?debug` overlay for 5 s in each phase after the camera settles. Draw calls and triangles count every render in a frame: shadow, main, post-processing and thumbnail passes.

| Venue      | Phase    | FPS (min / median) | Draw calls | Triangles (typical / peak) |
| ---------- | -------- | ------------------ | ---------- | -------------------------- |
| Cape Point | overview | 60 / 60            | 96         | 1.18M / 1.18M              |
| Cape Point | block    | 60 / 60            | 49         | 1.19M / 1.19M              |
| Cape Point | seat     | 60 / 60            | 70–84      | 1.23M / 2.21M              |
| Cape Point | VIP      | 50 / 60            | 112        | 1.23M / 1.23M              |
| Riverside  | overview | 60 / 60            | 69         | 0.17M / 0.17M              |
| Riverside  | block    | 60 / 60            | 34–36      | 0.23M / 0.38M              |
| Riverside  | seat     | 60 / 60            | 49         | 0.22M / 0.22M              |
| Riverside  | VIP      | 60 / 60            | 91         | 0.25M / 0.25M              |

Peaks come from the frames that refresh the floodlight shadow map. Only the camera moves, so the map is redrawn every 20th frame instead of every frame. That took a typical Cape Point frame from 2.17M to 1.18M triangles, inside the 1.5M budget. The draw-call budget (≤ 250) holds everywhere. Adaptive quality never stepped down on this machine.

The scripted demo (`e2e/smoke.spec.ts`, overview to VIP checkout through the embed page) completes in 4.3 s of automated input on the same GPU. Under SwiftShader (headless shell and CI) it takes about 105 s, mostly re-rendering the 800 × 450 snapshots, so the 90 s assertion runs only on a GPU.

JavaScript for the app route is about 484 kB gzip in the production build. That counts the entry, runtime, stadium, schema (zod, R3F, drei, postprocessing), Three.js and geometry-utils chunks, against the 600 kB budget. The inspector and calibration chunks load only on their routes. Initial transfer with the 11 MB shell is about 11.6 MB, against the 20 MB budget.

Still pending:

- The M1 MacBook Air and mid-range Windows laptop frame-rate checks (§13) need those machines.
- The desktop Lighthouse run against the production Netlify URL wasn't run from this session.

## Load audit (2026-11-24)

| Item                      | Before                            | After                                       |
| ------------------------- | --------------------------------- | ------------------------------------------- |
| Shell download            | 11.31 MB (meshopt `medium`, raw)  | 5.45 MB (meshopt `high`, gzipped)           |
| Shell caching             | fixed name, revalidated per visit | content-hashed name, `immutable` for a year |
| Shell request starts      | after the 3D chunk mounts `Shell` | as soon as `venue.json` parses              |
| JavaScript (gzip)         | ~482 kB                           | ~445 kB                                     |
| Entry chunk before header | 94 kB (react-dom + zod)           | 82 kB (react chunk + zod/mini entry)        |
| Initial transfer          | ~11.6 MB                          | ~5.9 MB                                     |

- The 3D chunk is preloaded from the HTML (`modulepreload`) instead of being found only after the entry runs.
- Three.js, R3F, drei and postprocessing get their own `three` chunk and React its own `react` chunk, so an app deploy re-downloads about 15 kB (`stadium`) instead of the whole 381 kB 3D bundle.
- `n8ao` (~43 kB minified, imported by `@react-three/postprocessing` but never used) is aliased to a stub.
- Meshopt decoding runs in Web Workers, the shell's shaders compile with `compileAsync` before it joins the scene, and zero normals are fixed in the processor instead of a loop over every vertex on each mount.
- Seat snapshots are JPEG blobs from `toBlob` (encoded off the main thread) instead of `toDataURL` PNGs.

Small or touch screens see the desktop notice before the shell preloads, so they still download only the JavaScript.
