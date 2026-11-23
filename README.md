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

| Parameter                          | Effect                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `?venue=riverside`                 | Load another venue from `public/venues/<id>/venue.json`                                                        |
| `?block=…&seat=…&box=…&vipSeat=…`  | Deep link into a phase; the app keeps these in the URL as you go. A confirmation is never restored from a link |
| `?debug`                           | FPS, draw calls, triangles, quality level, phase and hovered IDs; embed allowlist warnings                     |
| `?debug=shell`, `?debug=materials` | Shell inspector with camera bookmarks, and the raw material inspector (needs `assets/`; dev server only)       |
| `?calibrate`                       | Bowl calibration: sliders over the shell at 50% opacity, with **Export JSON** (dev server only)                |

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

The shell is committed as a gzipped, content-hashed GLB (`public/venues/cape-point/shell.<hash>.glb.gz`); the script writes the new name into `venue.json` and deletes the old file. Rebuilding it needs the licensed source, which is not in git: place the glTF, its buffer and textures in `assets/modern_stadium/`, then run:

```bash
pnpm process:stadium
```

To change only the final packing stage (compression, hashing, checks) without the source, re-encode the shipped shell:

```bash
pnpm process:stadium --repack
```

`VERBOSE=1` prints per-material reductions. The script fails if the result is over budget (≤ 15 MB unzipped, ≤ 850k triangles) or still has zero normals. Material rules live in `scripts/stadium-materials.json`; `/?debug=materials` shows each material's triangle count and lets you toggle or isolate it.

## Add a venue

Everything interactive is generated from one JSON file, so a new venue needs no code changes.

1. Copy `public/venues/riverside/venue.json` to `public/venues/<id>/venue.json` and set `id` to `<id>`. The file is validated by `src/venue/schema.ts`; a mistake shows the validation error on load.
2. Set the name, `branding` (accent colours and an optional `logoUrl`), `locale`, `currency` and the `event`. Write `event.startsAt` in the venue's local time with its UTC offset (`2027-03-14T17:00:00+02:00`); the page shows that date and time as written.
3. Describe the bowl: `outline` (a superellipse around the pitch), `tiers` (offset, base height, rows, row depth, riser), `stands` (angle ranges in degrees: 0° is east (+X), 90° is south (+Z)) and `blocks.perStandPerTier`. Optional `tiers[].rowsByStand` and `voids` handle irregular terraces.
4. Price every tier × stand in `pricing.tiers`, set the VIP price, and place any `vipBoxes`. With several boxes, Upgrade opens the free box nearest the chosen seat and the VIP card lets the buyer switch boxes.
5. Optionally add a decorative `shell` GLB. Without one, the procedural shell is drawn. Open `/?venue=<id>&calibrate` to fit the tiers to it and export the JSON.
6. Add the origins that will embed the venue to `embed.allowedOrigins`. The build turns every venue's list into the site's `frame-ancestors` header, so redeploy after changing it.

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

`embed.js` creates a 16:9 iframe (set `data-height` to override) and re-dispatches the app's messages as `stadium:ready`, `stadium:seatSelected` and `stadium:checkout` events, on the `data-target` element and on `window`. With several embeds on one page, listen on each target. `window.StadiumEmbed.reset()` clears every embed's selection; `reset("#stadium")` clears one.

The app only talks to a parent whose origin is in the venue's `embed.allowedOrigins`, or to its own site (so `/embed-test.html` works on any deploy). It finds the parent's origin from the browser, and through a handshake with `embed.js` when the host sends no referrer, so `Referrer-Policy: no-referrer` hosts work too. The dev server also allows `localhost:5173` and `127.0.0.1:5173`; production builds don't. An origin outside the list gets a console warning in the iframe and no events.

`seatSelected` carries `{ venueId, eventId, seatId, block, row, seat, tier, stand, gate, price, currency }`.

`checkout` carries a `checkoutId`:

- Standard seat: `seatSelected`'s fields plus `{ vip: false, checkoutId }`.
- VIP seat: `{ venueId, eventId, seatId, vip: true, boxId, vipSeatIndex, price, currency, checkoutId }`, where `seatId` is `<boxId>-S<n>`. It describes the VIP seat only, not the standard seat that was picked first.

A buyer can go back after checking out and check out again (say, to upgrade), so a host may receive several `checkout` events. Each has a new `checkoutId`; treat the latest one as the order.

The iframe is client-side code the buyer controls. Before taking payment, the host must look up the price and check the seat is still free on its own server; the `price` field and the mock availability are for display.

## Deploy

Netlify builds `main` to production with `pnpm build` and publishes `dist/` (`netlify.toml`). It takes pnpm's version from `packageManager` in `package.json` and runs Node 22. The build writes `dist/_headers`: `frame-ancestors` from the venues' allowlists, long-lived caching for hashed assets, and `noindex` on the embed test page.

## Credits

Stadium model: “Modern Stadium” by Razny (Sketchfab), Sketchfab Standard licence. [Source model](https://sketchfab.com/3d-models/modern-stadium-21767e058e9e4df8a1c57352611756aa). Venue, team and event names are fictional.
