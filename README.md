# Stadium ticketing

A white-label, embeddable 3D seat picker. Buyers fly around a night-match stadium, see prices per stand, drop into a block, pick a seat, see the live view from it, and can upgrade to a VIP skybox. Checkout is handed back to the host site through `postMessage`.

It ships with two fictional venues: **Cape Point Stadium** (`cape-point`, the default, with a decorative shell model) and **Riverside Ground** (`riverside`, no shell, so the procedural one is used). Desktop only for v1; small or touch screens get a "Best experienced on desktop" notice.

The plan is in [docs/PLAN.md](docs/PLAN.md), deviations from it in [docs/DECISIONS.md](docs/DECISIONS.md), measurements in [docs/PERF.md](docs/PERF.md) and the shell pipeline in [docs/ASSETS.md](docs/ASSETS.md).

## Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. Useful query parameters:

| Parameter                                | Effect                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `?venue=riverside`                       | Load another venue from `public/venues/<id>/venue.json`                                    |
| `?block=…&seat=…&box=…&vipSeat=…&done=1` | Deep link into a phase; the app keeps these in the URL as you go                           |
| `?debug`                                 | FPS, draw calls, triangles, quality level, phase and hovered IDs; embed allowlist warnings |
| `?debug=shell`, `?debug=materials`       | Shell inspector with camera bookmarks, and the raw material inspector (needs `assets/`)    |
| `?calibrate`                             | Bowl calibration: sliders over the shell at 50% opacity, with **Export JSON**              |

The renderer steps quality down by itself when the frame rate drops (DPR 1.5 → 1, then no post-processing) and back up when it recovers.

## Test

```bash
pnpm test
```

```bash
pnpm lint && pnpm format:check
```

Install Chromium once, then run the browser tests. `e2e/smoke.spec.ts` is the scripted demo from overview to VIP checkout.

```bash
pnpm exec playwright install chromium --only-shell
```

```bash
pnpm e2e
```

The headless shell renders WebGL in software, which is slow. To time the demo and sample per-phase frame rates on your GPU, run in the installed Google Chrome:

```bash
GPU=1 pnpm e2e smoke perf
```

GitHub Actions runs lint, format, unit tests, the build and the e2e suite on every push.

## Process the stadium model

The shell (`public/venues/cape-point/shell.glb`) is committed. Rebuilding it needs the licensed source, which is not in git: place the glTF, its buffer and textures in `assets/modern_stadium/`, then run:

```bash
pnpm process:stadium
```

`VERBOSE=1` prints per-material reductions. The script fails if the result is over budget (≤ 15 MB, ≤ 850k triangles). Material rules live in `scripts/stadium-materials.json`; `/?debug=materials` shows each material's triangle count and lets you toggle or isolate it.

## Add a venue

Everything interactive is generated from one JSON file, so a new venue needs no code changes.

1. Copy `public/venues/riverside/venue.json` to `public/venues/<id>/venue.json` and set `id` to `<id>`. The file is validated by `src/venue/schema.ts`; a mistake shows the validation error on load.
2. Set the name, `branding.accent`, `locale`, `currency` and the `event`.
3. Describe the bowl: `outline` (a superellipse around the pitch), `tiers` (offset, base height, rows, row depth, riser), `stands` (angle ranges in degrees: 0° is east (+X), 90° is south (+Z)) and `blocks.perStandPerTier`. Optional `tiers[].rowsByStand` and `voids` handle irregular terraces.
4. Price every tier × stand in `pricing.tiers`, set the VIP price, and place any `vipBoxes`.
5. Optionally add a decorative `shell` GLB. Without one, the procedural shell is drawn. Open `/?venue=<id>&calibrate` to fit the tiers to it and export the JSON.
6. Add the origins that will embed the venue to `embed.allowedOrigins`.

Open `/?venue=<id>` to check the full flow.

## Embed

```html
<div id="stadium"></div>
<script
  src="https://<deploy>/embed.js"
  data-target="#stadium"
  data-venue="cape-point"
  data-event="cps-2027-03-14"
  async
></script>
<script>
  window.addEventListener("stadium:seatSelected", (e) => console.log(e.detail));
  window.addEventListener("stadium:checkout", (e) => console.log(e.detail));
</script>
```

`embed.js` creates a 16:9 iframe (set `data-height` to override) and re-dispatches the app's messages as `stadium:ready`, `stadium:seatSelected` and `stadium:checkout` events on `window`. `window.StadiumEmbed.reset()` clears the selection. The app only posts to a parent whose origin is in the venue's `embed.allowedOrigins`; Netlify builds add their own deploy and production origins automatically. `/embed-test.html` is a host page that prints every event.

`seatSelected` carries `{ venueId, eventId, seatId, block, row, seat, tier, stand, gate, price, currency }`; `checkout` adds `{ vip, boxId?, vipSeatIndex? }`.

## Deploy

Netlify builds `main` to production with `pnpm build` and publishes `dist/`.

## Credits

Stadium model: “Modern Stadium” by Razny (Sketchfab), Sketchfab Standard licence. [Source model](https://sketchfab.com/3d-models/modern-stadium-21767e058e9e4df8a1c57352611756aa). Venue, team and event names are fictional.
