# 3D Stadium Ticketing: Implementation Plan (v1)

Status: agreed 2026-11-23. Builders: Josh + Claude Code. No deadline.
This document is meant to be complete. If something here is ambiguous, pick the option closest to the reference reels (section 2) and note the choice in `docs/DECISIONS.md`.

---

## 1. What we're building

A white-label, embeddable 3D seat-selection experience for stadiums, used to pitch venues like DHL Stadium (Cape Town). A venue buys it and embeds it on their site. Buyers fly around a 3D stadium, see prices, pick a seat, see the real view from that seat, and can upgrade to a VIP skybox. Checkout is handed back to the venue's own ticketing system.

The v1 deliverable is a polished desktop demo on a public URL. It runs on a fictional venue that loosely follows DHL Stadium's layout, and it proves that the same build can run a second venue from config alone.

### Goals

- The full flow, end to end: aerial overview → hover prices → fly into block → pick seat → live seat view → ticket card → Upgrade (card flip) → fly into skybox → choose VIP seat → confirm.
- Venue-agnostic: all interactive geometry comes from a JSON venue config. The decorative shell is an optional GLB.
- Embeddable through an iframe and a one-line `embed.js`, with `postMessage` callbacks.

### Non-goals (v1)

- Mobile/touch support (deferred; see §14). Small or touch screens get a "Best experienced on desktop" notice with a "Continue anyway" button.
- Real backend, real availability, payments, accounts, multi-seat or group purchase.
- AI-generated imagery inside the product. The seat view must be accurate, so it's rendered in real time.
- Any real venue or club names or marks.

---

## 2. Reference breakdown (from the reels)

**omnyalab (football, daylight): the flow to copy**

- Aerial overview of the stadium in a park. Hovering a stand tints it orange and shows a glass tag: `FROM · South-West Corner · AED 850`.
- Click → the camera dives into the stand. Block tag: `Upper tier · Block 331 · 78 left · AED 850`.
- Seat picker close-up: available seats in the team colour, taken seats in a contrasting colour, the active block highlighted. Hovering a seat shows `Block 232 · Row 10 · Seat 8 · AED 1,250` plus a small thumbnail of the view.
- Ticket card (white, floating over the scene): a "Your view" image on the left. On the right: `North Stand · Middle Tier`, `Block 232`, `Row 10 / Seat 8 / Gate N3`, a barcode stub, the price, an orange `Upgrade · +2,500` button and a `Keep my seat` link.
- Upgrade → the card flips to a black VIP card: `VIP · Level 2 · Skybox 12 · Seats 8 · Entry VIP · 3,750 · Choose your VIP seat →`. The camera shows the glass skybox from outside, then goes inside (dark leather recliners, one highlighted), then shows the view through the glass ("Another view"). Ends by pulling back to the overview.

**ascenta (basketball, night): the look plus two ideas**

- Dark, holographic-looking overview. The hovered section gets a white outline and a tooltip ("1 seat from $112").
- Prices shown **inside the scene** on the LED ribbon boards between tiers: `LOWER BOWL FROM $240`, `COURTSIDE FROM $1,450`.
- Orange leather suites, a jumbotron showing the matchup, a night mood.

**What we take:** the omnyalab flow, ticket card and VIP seat choice; the ascenta night look, LED price ribbons and section outline on hover.

---

## 3. Decisions log

| Area        | Decision                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Purpose     | Pitch demo for venues; white-label, embeddable                                                                                |
| Geometry    | Hybrid: the parametric generator builds the seating bowl (everything interactive); an optional decorative shell GLB per venue |
| Shell asset | Sketchfab "Modern Stadium" by Razny (Sketchfab Standard licence), cleaned by script. Credit in the app                        |
| Demo venue  | Fictional **Cape Point Stadium**; match **Cape Storm vs Highveld Lions**, Sat 14 Mar 2027, 17:00 SAST; currency ZAR           |
| Seat view   | Real-time 3D camera at the seat's eye position; snapshots for thumbnails                                                      |
| Stack       | Vite + TypeScript + React 19 + React Three Fiber + drei + zustand + @react-three/postprocessing                               |
| Embed       | iframe + `embed.js` loader + `postMessage` API                                                                                |
| Hosting     | Vercel (static)                                                                                                               |
| Data        | Static venue JSON; seeded mock availability behind a `DataSource` interface                                                   |
| Checkout    | Out of scope; `onCheckout` callback to the host page; standalone mode shows a demo confirmation                               |
| Selection   | Single seat (plus VIP seat after upgrade)                                                                                     |
| Look        | Night match: floodlights, bloom on LEDs, ACES tone mapping, stylised ground (car park, paths, trees)                          |
| Platform    | Desktop Chrome, Safari, Firefox, Edge (latest). WebGL2 required                                                               |

---

## 4. Repository layout

```
/
├─ assets/                      # gitignored raw sources (assets/modern_stadium/scene.gltf, 350 MB)
├─ scripts/
│  ├─ process-stadium.mjs        # raw glTF → public/venues/cape-point/shell.glb
│  └─ stadium-materials.json     # per-material keep/drop/decimate rules
├─ public/
│  ├─ embed.js                   # host-page loader (plain JS, no build step dependency)
│  ├─ embed-test.html            # plain page that embeds the app, logs callbacks
│  └─ venues/
│     ├─ cape-point/{venue.json, shell.glb, textures/…}
│     └─ riverside/venue.json    # second venue, no shell (white-label proof)
├─ src/
│  ├─ main.tsx, App.tsx
│  ├─ venue/
│  │  ├─ schema.ts               # VenueConfig types + zod validation
│  │  ├─ generateBowl.ts         # config → seats, blocks, hit meshes (pure, unit-tested)
│  │  └─ superellipse.ts         # outline + offset-curve math
│  ├─ data/
│  │  ├─ DataSource.ts           # interface
│  │  ├─ MockDataSource.ts       # seeded availability
│  │  └─ prng.ts                 # mulberry32
│  ├─ state/store.ts             # zustand: phase machine + selection
│  ├─ scene/
│  │  ├─ Stage.tsx               # Canvas, lights, env, post-fx, PerformanceMonitor
│  │  ├─ CameraDirector.tsx      # phase → CameraControls transitions
│  │  ├─ Shell.tsx               # optional GLB
│  │  ├─ ProceduralShell.tsx     # fallback roof ring + masts + wall (no-GLB venues)
│  │  ├─ Pitch.tsx, Ground.tsx, Floodlights.tsx, Jumbotron.tsx
│  │  ├─ Bowl.tsx                # far-LOD seat strips per tier
│  │  ├─ BlockSeats.tsx          # near-LOD instanced seats for active block(s)
│  │  ├─ BlockHitAreas.tsx       # invisible pick meshes + hover outline
│  │  ├─ LedRibbons.tsx          # in-world tier prices
│  │  ├─ Crowd.tsx               # instanced billboards on sold seats
│  │  ├─ Skybox.tsx              # VIP interior furnishing + glass
│  │  └─ snapshots.ts            # render-to-texture thumbnails/snapshots
│  ├─ ui/
│  │  ├─ TopBar.tsx              # event info, Back, Esc hint
│  │  ├─ HoverTag.tsx            # stand/block tags (glass)
│  │  ├─ SeatTooltip.tsx         # with live thumbnail
│  │  ├─ TicketCard.tsx          # front + VIP back, CSS 3D flip
│  │  ├─ DesktopOnlyNotice.tsx
│  │  ├─ Credits.tsx
│  │  └─ DebugOverlay.tsx        # ?debug: FPS, draw calls, tris, phase
│  ├─ dev/Calibrate.tsx          # ?calibrate: leva panel to fit the bowl to the shell
│  └─ embed/bridge.ts            # postMessage protocol (inside iframe)
├─ tests/ (vitest unit) + e2e/ (playwright)
└─ docs/PLAN.md, docs/DECISIONS.md
```

---

## 5. Venue config (`venue.json`)

Units are metres. Origin is the pitch centre, +Y up, +Z = "South" (the camera's default overview position looks from the south-west).

```ts
type VenueConfig = {
  id: string; // "cape-point"
  name: string; // "Cape Point Stadium"
  branding: { accent: string; accentOn: string; logoUrl?: string };
  locale: string;
  currency: string; // "en-ZA", "ZAR"
  event: {
    id: string;
    home: string;
    away: string;
    startsAt: string;
    sport: "football" | "rugby";
  };
  pitch: { length: number; width: number; kind: "football" | "rugby" };
  outline: { halfLength: number; halfWidth: number; exponent: number }; // superellipse of tier-1 front edge
  tiers: Array<{
    id: "lower" | "middle" | "upper" | string;
    label: string; // "Lower Tier"
    offset: number; // horizontal distance of row 1 from outline
    baseHeight: number; // height of row 1 tread
    rows: number;
    rowDepth: number; // 0.8
    riser: number; // vertical step per row (sets the rake)
    seatWidth: number; // 0.5
    gateLetter: string; // "N" etc. combined with stand for Gate N3
  }>;
  stands: Array<{
    // angular split of the bowl, in degrees, 0° = +X, CCW
    id: string;
    label: string; // "north", "North Stand"
    from: number;
    to: number;
  }>;
  blocks: {
    perStandPerTier: Record<string, number>; // standId → number of blocks, or use explicit list
    aisleWidth: number; // gap between blocks
    numbering: "stadium"; // tier digit + 2-digit index: 1xx lower, 2xx middle, 3xx upper
  };
  pricing: {
    tiers: Record<string, Record<string, number>>; // tierId → standId → price
    vip: { pricePerSeat: number; label: string };
  };
  vipBoxes: Array<{
    id: string;
    label: string; // "skybox-12", "Skybox 12"
    level: number;
    position: [number, number, number];
    rotationY: number; // faces the pitch
    size: [number, number, number]; // interior w,h,d
    seats: number; // 8
  }>;
  shell?: {
    gltfUrl: string;
    position?: [number, number, number];
    rotationY?: number;
    scale?: number;
  };
  cameras: { overview: CameraPose }; // other poses are derived
  availability: { seed: number; soldRatio: [number, number] }; // e.g. [0.6, 0.85]
  embed: { allowedOrigins: string[] };
};
type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
};
```

Validate with zod on load. On a validation error, show a full-screen developer message that names the field.

**Cape Point Stadium values:** write them during M2 calibration (see §7). Starting guesses: pitch 105×68; outline halfLength 64, halfWidth 46, exponent 3.2; three tiers (lower 22 rows, middle 14, upper 20); stands N/E/S/W, each split into a centre stand plus corners (8 stands); blocks ≈ 6–9 per stand per tier; target ≈ 34k seats. VIP boxes on the east side at hospitality level (world x ≈ 63–70 m, y ≈ 10–13 m), behind the model's leather seating tier; see docs/ASSETS.md for positions.

**Prices (ZAR):** lower sideline R 850, lower corners R 650, lower ends R 450; middle sideline R 1,250, middle corners/ends R 750; upper sideline R 450, upper corners/ends R 300; VIP skybox R 3,750/seat. The Upgrade button shows the difference (e.g. `+R 2,500`).

---

## 6. Bowl generator (`generateBowl.ts`)

A pure function: `generateBowl(config) → Bowl`. No three.js imports apart from math types, so it can be unit-tested in Node.

1. **Outline:** a superellipse `|x/a|^n + |z/b|^n = 1`, sampled densely (2048 points) and arc-length parameterised so seats are evenly spaced. Each tier row `r` is the outline offset outward by `tier.offset + r·rowDepth` (use the normal of the sampled curve; the superellipse is convex, so a simple normal offset is fine). Row height is `baseHeight + r·riser`.
2. **Stands and blocks:** convert each stand's angular range to arc-length intervals on each row curve. Split each stand×tier into N blocks of equal angle, then remove `aisleWidth` at each block boundary.
3. **Seats:** along each row segment inside a block, place seats every `seatWidth`, centred. Each seat gets:
   `id = "${blockId}-R${row}-S${seat}"`, `position` (seat-pan centre), `yaw` (facing the pitch, i.e. the inward normal), `eye = position + up·1.15 + forward·0.15` (seated eye height), block, tier, stand, row and seat numbers.
4. **Block hit meshes:** for each block, a quad strip covering the block's rows (front-row edge to back-row edge, following the rake), used for raycasting and the hover outline. Also store the block centroid and a precomputed fly-in camera pose (see §8).
5. **Far-LOD strips:** per tier, a single merged geometry with one small box (12 triangles) per seat and per-vertex colour (available/sold/tier tint). That's ~400k triangles total.
6. Return `{ seats: Seat[], seatIndexById: Map, blocks: Block[], tiers, stands, stats }`.

Seat numbering runs left to right when you face the pitch from the seat. Row 1 is nearest the pitch.

**Unit tests:** seat counts are deterministic for a fixed config; IDs are unique; no two seats are closer than `seatWidth − ε` in the same row; every seat yaw points within 30° of the pitch centre; the riser produces a monotonic eye height per row; block numbering follows the 1xx/2xx/3xx scheme.

---

## 7. Stadium shell asset pipeline

Source: `assets/modern_stadium/scene.gltf` (+ `scene.bin`, 30 textures). Facts found on inspection:

- 6.16M triangles, 192 meshes, 62 materials. Node names are useless (`Material2_…`), so **classify by material**.
- Material names are Polish SketchUp names. The biggest:
  `Stal_04__szczotkowana` (brushed steel) 2.03M · `Stal_02__szorstka_1` (rough steel) 1.17M · `Color_M07` 0.91M (unknown) · `Tworzywo_sztuczne_01` (plastic, likely the seat shells) 0.53M · `Skra_07` (leather, likely the VIP seats) 0.39M · `Beton_16_3` / `Beton_16` (concrete) 0.51M combined.
- The root node rotates Z-up to Y-up. **Verify the scale** (SketchUp exports are sometimes in inches): measure the pitch markings and rescale so the pitch is ~105 m long.

Steps:

1. **Identify:** a dev page, `?debug=materials`, loads the raw glTF (local only, it's slow), lists the materials with triangle counts, and lets you toggle or isolate each one. Use it to fill in `scripts/stadium-materials.json`:
   ```json
   {
     "Tworzywo_sztuczne_01": { "action": "drop" },
     "Stal_04__szczotkowana": { "action": "decimate", "ratio": 0.05 },
     "Skra_07": { "action": "decimate", "ratio": 0.15 },
     "Beton_16": { "action": "keep" },
     "...": {}
   }
   ```
   Expected: drop the public seat shells and their steel frames (if the frames are a separate material, or only reachable by bounding volume, drop the primitives that sit inside the seating-bowl volume). Keep and decimate the roof, facade, membrane, skyboxes, LED screens, concourse and pitch surroundings. Drop the model's own pitch (we render ours).
2. **`scripts/process-stadium.mjs`** (Node, using `@gltf-transform/core`, `/functions`, `/extensions`, `meshoptimizer`, `sharp`):
   read → apply the drop rules → `weld` → `simplify` per material ratio (meshopt simplifier, `lockBorder: true`) → `dedup` → `prune` → `join` (merge meshes per material) → `palette`/flatten for flat-coloured materials → resize textures to ≤1024 px and convert them to WebP (KTX2 only if `toktx` is installed; optional) → `meshopt` compression → write `public/venues/cape-point/shell.glb`.
   Simplification error limits are in metres (`maxError` per rule, converted with meshopt `getScale`), never meshopt's raw relative error: on a stadium-sized mesh a relative 0.002 is ~20 cm and flattens the steps. Normals stripped for simplification are rebuilt as creased normals (40°); textured concrete gets box-projected UVs (`"uv": "box"`).
   Print a before/after table (triangles, materials, bytes) and a per-surface table. **Target: ≤850k triangles, ≤15 materials, ≤15 MB** (raised from 300k on 2026-11-23: the model's terraces, fascia rails and trusses could not go lower without visible damage, and v1 is desktop-only).
3. **Check:** `?debug=shell` loads only the processed GLB with fixed camera bookmarks (overview, sideline low, the skybox exterior) for screenshot comparisons.
4. **Skybox interiors (confirmed missing):** the dark "windows" behind the east hospitality seats and along the top of the upper tiers are opaque black panels on solid concrete, so there are no interiors to fly into. Therefore build a procedural box interior in `Skybox.tsx` (floor, back wall, glazing, 2 rows of 4 leather recliners from a small procedural/CC0 seat model) and place it at the `vipBoxes` poses.
5. Credits: "Stadium model: 'Modern Stadium' by Razny (Sketchfab), Sketchfab Standard licence", shown in `Credits.tsx` and in the README.

**Licence note:** the Standard licence allows commercial use and derivatives but bars redistributing the asset itself. We only ship a processed derivative. Before selling to a client, have someone review the licence or replace the model with one licensed for the purpose.

---

## 8. Flow and state machine

`store.ts` (zustand):

```ts
type Phase =
  | { kind: "overview" }
  | { kind: "block"; blockId: string }
  | { kind: "seat"; seatId: string } // camera at seat eye, ticket card shown
  | { kind: "vipBox"; boxId: string; fromSeatId: string } // card flipped, inside the box, choosing
  | { kind: "vipSeat"; boxId: string; vipSeatIndex: number; fromSeatId: string }
  | { kind: "done"; selection: Selection }; // checkout handed off
```

Hover state (`hoveredStandId`, `hoveredBlockId`, `hoveredSeatId`) is kept separately and never changes the phase. A `transitioning` flag blocks input during camera moves.

Transitions and controls:

- `overview` → click a block → `block`. In overview, hovering targets **stands** (8); the tag shows the cheapest price in the stand. The click goes to the hovered block within that stand (the hit mesh resolves the block).
- `block` → click an available seat → `seat`. Clicking a sold seat shakes the tooltip ("Taken").
- `seat` → "Upgrade" → `vipBox` (the first box with free seats, using `vipBoxes[0]` as the default; show the box label). "Keep my seat" → `done` with a standard selection. "Choose another seat" → `block`.
- `vipBox` → click a VIP seat → `vipSeat` (camera to that seat's eye, looking through the glass). "Back to standard seat" → `seat` (card flips back).
- `vipSeat` → "Confirm VIP" → `done` with a VIP selection.
- "Back" button and **Esc** step back one phase. "Overview" (logo click) jumps to `overview` from anywhere.
- The URL reflects the phase (`?block=232&seat=232-R10-S8`) so demo states can be deep-linked. Use `history.replaceState`; no router.

### Camera choreography (drei `CameraControls`, `smoothTime ≈ 0.6`)

- **Overview:** high orbit (~45° elevation, ~260 m out), slow auto-rotate while idle (stops on interaction, resumes after 8 s). Polar angle clamped to 15°–70°, distance 150–400 m, no panning.
- **Block fly-in:** a 1.4 s eased move to a pose above and in front of the block: about 18 m out towards the pitch from the block's centroid and 7 m above its mid row (was 10 m; see DECISIONS), looking at the block centroid. Orbit is limited to ±25° around that pose.
- **Seat:** a 1.2 s move to `seat.eye`, looking at the pitch centre (slightly toward the near half). Drag to look around (yaw ±70°, pitch ±25°). No translation.
- **Upgrade:** a 2.0 s path: pull back out of the bowl → arc to a pose outside the skybox glass (hold 0.4 s) → push through the glass to the box's interior viewpoint. Implement it as chained `setLookAt` calls with awaited promises.
- **VIP seat:** a 0.8 s move to the chosen recliner's eye position.
- All transitions take ≤2 s and can be interrupted only by "Back".

---

## 9. Scene and visuals

- **Renderer:** `<Canvas dpr={[1, 1.5]} gl={{ antialias: false }}>`, ACES filmic tone mapping, sRGB output. Post-processing: SMAA, Bloom (luminance threshold so only LEDs, floodlight heads and the roof edge glow), and a slight vignette. A `PerformanceMonitor` drops bloom → crowd → DPR 1 in that order when it detects a sustained fps drop.
- **Roof fade:** the `roof`, `membrane`, `glass` and `truss` surfaces fade from opaque to ~12% opacity as the camera rises from 35 m to 90 m, otherwise the roof hides the stands in the overview. They cast no shadows, since floodlights hang under the roof edge. Prototyped in the inspector (`src/inspector.js`, `ROOF_FADE`).
- **Lighting:** a night `Environment` (a drei preset or small HDR, intensity ≈ 0.3), a hemisphere fill, and 4 directional "floodlight" lights (one shadow-casting, 2048 shadow map limited to the pitch and lower bowl). The floodlight masts or roof lights are emissive meshes.
- **Pitch:** procedural shader with mowing stripes, line markings drawn from `pitch.kind` (football or rugby lines), and a subtle darker edge. Goalposts as simple geometry.
- **Ground (overview):** dark ground plane with car parks (emissive line markings), paths, and instanced low-poly trees (≤ 600) on a ring around the stadium. Faint ambient glow from the stadium onto the ground.
- **Seats:** far LOD (§6.5) is always on. Near LOD: `BlockSeats` renders a detailed seat (≈150 tris, procedural: pan + back + armrests) as one `InstancedMesh` per block, for the active block and its neighbours (≤ ~3k instances). Colours: available = venue accent tint, sold = desaturated slate, hovered = white, selected = orange (`#ff6a2b`).
- **Block hover:** the hovered block (or stand, in overview) gets a white outline (edges of the hit mesh drawn as a thin line, plus a 15% additive fill), and its seats brighten.
- **LED ribbons (`LedRibbons.tsx`):** emissive curved bands along each tier's front fascia (inside face), showing per-stand text like `LOWER TIER · FROM R 450` in a canvas texture, scrolling slowly. In the overview they double as a price legend.
- **Crowd:** instanced camera-facing billboards (2 tris each) on sold seats, using a 16-silhouette texture atlas with random team-colour tints. Shown in `seat`, `vipBox` and `vipSeat` (match-day look); hidden in `overview` and `block` so availability colours stay readable.
- **Jumbotron:** two screens (or the model's LED screens) showing the matchup "CAPE STORM vs HIGHVELD LIONS · SAT 14 MAR 17:00" and the venue's accent colour.
- **Skybox interior:** furnish the box at each `vipBoxes` pose: 8 dark leather recliners (2 rows × 4, the front row lower), a glass front (`MeshPhysicalMaterial`, transmission off, roughness 0.05, faint reflection), warm interior spotlights, and a counter at the back. The hovered recliner gets an orange rim and the chosen one turns orange (as in the reel).

### UI (DOM over the canvas)

- Style: glass cards (`backdrop-filter: blur(16px)`, white at 75% opacity on dark, 14 px radius), Inter or a similar font, and the venue accent for highlights. The price in each tag is right-aligned in the accent colour with a small currency label.
- **HoverTag:** follows the cursor at a 16 px offset, or anchors to the block centroid with drei `Html` while flying in. Shows `FROM · {stand label} · {price}` in the overview and `{tier} · Block {n} · {left} left · {price}` in block mode.
- **SeatTooltip:** `Block 232 · Row 10 · Seat 8 · R 1,250` + a 160×90 live thumbnail (§10).
- **TicketCard** (bottom-right, 460×220, `perspective: 1200px`; the flip is `rotateY(180deg)`, 600 ms, cubic-bezier(.2,.8,.2,1)):
  - Front (white): "Your view" snapshot on the left (40%); on the right: `{Stand} · {Tier}`, `Block 232`, a `ROW / SEAT / GATE` trio, a barcode stub (deterministic bars from the seat id), the price, `Upgrade · +R 2,500` (orange pill), `Keep my seat` link, `Choose another seat` link.
  - Back (black/gold): `VIP · Level 2`, `Skybox 12`, `Seats 8 · Entry VIP`, the VIP price, the "View from the box" snapshot, `Choose your VIP seat →` (before a seat is chosen) and then `Confirm VIP` / `Back to standard seat`.
- **TopBar:** venue logo/name (click → overview), the match, date and time, a Back button and an Esc hint.
- **Done state:** in standalone mode, a centred confirmation card that summarises the selection and says "Demo: checkout hands off to your ticketing provider". In embedded mode, post `checkout` and show "Continuing to checkout…".

---

## 10. Snapshots and thumbnails (`snapshots.ts`)

- A secondary `PerspectiveCamera` (fov 60) renders into a `WebGLRenderTarget`.
- **Seat tooltip thumbnail:** 320×180 target, re-rendered **only when the hovered seat changes** (debounced 80 ms), from `seat.eye`, looking at the pitch centre. Crowd and post-processing are off for thumbnails. Show it as a `<canvas>` copied with `readRenderTargetPixels` (flip Y), or render the target's texture in a second small R3F view. Use whichever is cheaper in practice.
- **Ticket "Your view":** 800×450, rendered once when entering `seat`, crowd on, and converted to a data-URL `<img>`.
- **VIP view:** the same, from the box's viewpoint, then from the chosen recliner.

---

## 11. Data (`DataSource`)

```ts
interface DataSource {
  getVenue(venueId: string): Promise<VenueConfig>;
  getAvailability(
    eventId: string,
    bowl: Bowl,
  ): Promise<Map<string /*seatId*/, "available" | "sold">>;
  getVipAvailability(eventId: string, boxId: string): Promise<boolean[]>;
}
```

`MockDataSource`: a `mulberry32(seed)` PRNG. Sold probability per seat is `base(soldRatio)` plus a bonus for sideline stands, lower rows and middle tiers, plus clustered runs (when a seat is sold, the next seat in the row is sold with probability 0.6), plus a few scattered singles. Clamp each block to ≥5 available seats so every block can still be demoed. VIP boxes: 2–4 of the 8 seats sold. Deterministic per seed; unit-test that the same seed gives the same map and that the overall sold ratio stays within `soldRatio`.

"N left" and "from" prices are derived from availability plus pricing on the client.

---

## 12. Embed API

Host page:

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
  window.addEventListener("stadium:checkout", (e) => console.log(e.detail));
</script>
```

- `embed.js` (< 4 kB, plain JS) creates an iframe (`src=/?venue=…&event=…&embed=1`, `allow="fullscreen"`, 100% width, height from `data-height` or 16:9). It listens for messages from the iframe's origin only and re-dispatches them as `CustomEvent`s on `window`: `stadium:ready`, `stadium:seatSelected`, `stadium:checkout`. It also exposes `window.StadiumEmbed.reset()`, which posts `{type:"reset"}` into the iframe.
- Inside the iframe (`bridge.ts`): post messages to `window.parent` only when `embed=1`, with `targetOrigin` set to the matching entry in `venue.embed.allowedOrigins` (exact match against `document.referrer`'s origin; if nothing matches, don't post, and log a warning in `?debug`).
- Payloads:
  - `seatSelected`: `{ venueId, eventId, seatId, block, row, seat, tier, stand, gate, price, currency }`
  - `checkout`: the same plus `{ vip: boolean, boxId?, vipSeatIndex? }`
- `public/embed-test.html` embeds the app and prints received events. Add `http://localhost:5173` and the Vercel preview origin to `allowedOrigins` in both venue configs.

---

## 13. Performance budgets (desktop, v1)

| Metric                                                     | Budget                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Frame rate                                                 | 60 fps on M1 MacBook Air (1440p, DPR 1.5) and a mid-range Windows laptop with integrated graphics, in every phase |
| First interactive frame (generated bowl + pitch, no shell) | < 3 s on cable                                                                                                    |
| Shell GLB                                                  | ≤ 15 MB and ≤ 850k triangles, loads after first frame and fades in                                                |
| Total initial transfer                                     | ≤ 20 MB                                                                                                           |
| JS bundle                                                  | ≤ 600 kB gzip (three + R3F + drei tree-shaken)                                                                    |
| Draw calls (overview)                                      | ≤ 250                                                                                                             |
| Triangles on screen                                        | ≤ 1.5M                                                                                                            |

`?debug` shows FPS, draw calls, triangles, phase and the hovered IDs. Check the deployed URL with Lighthouse (desktop preset), and record the results in `docs/PERF.md` at the end of each milestone.

Browsers without WebGL2 get a static card saying "This experience needs a modern desktop browser". Small or touch screens (`pointer: coarse` or width < 900) get `DesktopOnlyNotice` with "Continue anyway".

---

## 14. Milestones

Each milestone ends deployed to a Vercel preview, with its acceptance checks passing.

**M0: Scaffold**
Vite React-TS, ESLint and Prettier, Vitest, Playwright, zustand, R3F, drei, postprocessing, zod, leva (dev only). Vercel project connected; `main` deploys to production. `.gitignore` excludes `assets/`.
✅ `npm run dev`, `npm test` and `npm run e2e` all run; an empty Canvas is deployed.

**M1: Shell asset pipeline**
`?debug=materials` viewer; fill in `stadium-materials.json`; `process-stadium.mjs`; `?debug=shell` with camera bookmarks. Identify `Color_M07`. Locate the skyboxes and record their poses.
✅ `shell.glb` ≤ 15 MB, ≤ 850k triangles, terraces free of tears at the Sideline and Skybox bookmarks, no public seats left, roof, facade, LED screens and skyboxes intact, correct scale (pitch ≈105 m). Before/after table committed in `docs/ASSETS.md`.

**M2: Venue schema + bowl generator + calibration**
`schema.ts`, `generateBowl.ts` with tests, far-LOD `Bowl`, and the `?calibrate` page (leva sliders for outline/tier/stand params, shell shown at 50% opacity, an "Export JSON" button). Fit Cape Point's config to the shell.
✅ Generated tiers sit on the model's terraces with no visible floating or clipping from the overview and sideline bookmarks; ~34k seats; unit tests pass.

**M3: Overview and look**
Night lighting, pitch, ground and trees, floodlights, jumbotron, LED ribbons, post-processing, `CameraDirector` overview with idle auto-rotate, stand hover outline + HoverTag with the "from" price, TopBar, Credits.
✅ Hovering each of the 8 stands shows the correct label and minimum price; 60 fps on an M1 Air.

**M4: Block fly-in and seat picking**
Block hit areas, the fly-in pose, near-LOD `BlockSeats` with availability colours, seat hover, the SeatTooltip with the live thumbnail, clicks on sold seats rejected, Back/Esc.
✅ Any block can be entered; the tooltip IDs match the generator; the thumbnail updates in < 100 ms after the hover settles.

**M5: Seat view and ticket card**
Camera to the seat's eye, look-around limits, crowd billboards, "Your view" snapshot, TicketCard front, Keep my seat → done state, Choose another seat.
✅ The view from a front-row lower seat and from a back-row upper seat look clearly different and correct (pitch visible, nothing clips the camera); the card fields match the seat.

**M6: VIP upgrade**
Card flip, upgrade camera path, skybox interior (furnished model box or procedural fallback), VIP seat hover and choose, VIP card back with a snapshot, Confirm VIP, Back to standard seat.
✅ The full upgrade round trip works both ways with no state leaks (selection and prices correct after going back).

**M7: Data, embed, white-label**
`MockDataSource` with tests; deep-link URL state; `embed.js`, `bridge.ts`, `embed-test.html`; the second venue `riverside` (3 stands + an open end, 2 tiers, no shell so `ProceduralShell` is used, GBP, a green accent, a different match).
✅ `?venue=riverside` runs the full flow with zero code changes; the embed test page receives `seatSelected` and `checkout` with correct payloads; a message to a non-allowlisted origin is not sent.

**M8: Polish, performance, release**
Adaptive quality, a loading screen with a progress bar (drei `useProgress`), easing tuning, empty and error states, Lighthouse pass, `docs/PERF.md`, the Playwright smoke test, README (run, process assets, add a venue, embed), production deploy.
✅ All of §15 is true.

---

## 15. Definition of done (v1)

1. On desktop Chrome and Safari, the scripted demo runs without a reload in < 90 s: overview → hover stand → fly into block → hover seat (tooltip + thumbnail) → pick seat → seat view → ticket card with snapshot → Upgrade → flip → skybox → choose VIP seat → VIP card → Confirm fires `checkout`. "Keep my seat", Back and Esc work from every phase.
2. The performance budgets in §13 are met and recorded in `docs/PERF.md`.
3. The second venue config runs the full flow with zero code changes.
4. `embed.js` on a plain HTML page shows the app, and the host receives `seatSelected` and `checkout`.
5. Deployed to a public Vercel URL; the stadium model credit is visible.
6. Fictional names only: Cape Point Stadium, Cape Storm vs Highveld Lions. No real venue or club marks.
7. Vitest unit tests (generator, availability, price derivation) and one Playwright desktop smoke test pass in CI (GitHub Actions on push).

---

## 16. Deferred (explicitly out of v1)

- Mobile and touch: tap-to-preview, bottom-sheet seat picker, pinch and drag, mobile perf budgets (iPhone 13 ≥ 30 fps).
- Day/night toggle (daylight park look as in the omnyalab reel).
- Multi-seat or group selection; accessibility and wheelchair seating; price filters.
- A real backend and integration with ticketing providers (the `DataSource` interface is the seam).
- A web component or npm package embed.
- Marketing video (Higgsfield-style AI shots made from screen recordings).
- Licence review or replacement of the shell model before any paid client use.
- Analytics, i18n beyond `Intl` formatting, accessibility audit (beyond keyboard Back/Esc and focusable buttons).

---

## 17. Risks

| Risk                                                    | Mitigation                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The model's terraces don't fit a superellipse bowl      | Allow per-tier outline overrides (`outline` per tier) and per-stand radial offsets in the config; the calibration page exposes them                                          |
| Seats and frames can't be separated cleanly by material | Drop primitives by bounding volume inside the bowl region; worst case, use `ProceduralShell` for Cape Point too and keep the model only for the roof and skyboxes            |
| Skybox interiors are missing (confirmed in M1)          | Procedural box interior (§7.4); in M6 check whether the space behind the east panel band is solid, and if so hide that wall section (clipping box) where the box is inserted |
| Shell is over budget after decimation                   | Lower the steel ratios, drop interior concourse geometry that isn't visible from inside the bowl or from above                                                               |
| Raycasting 34k seats is slow                            | Raycast only the active block's InstancedMesh; stands and blocks pick via their hit meshes                                                                                   |
| Licence objections from a prospective client            | Swap the shell; nothing interactive depends on it                                                                                                                            |
