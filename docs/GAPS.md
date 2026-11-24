# Gaps against the reference reels

Review of 2026-11-24. Method: frames taken from both reels (PLAN §2) and set beside the app running on the dev server (Cape Point), from the overview through to Confirm VIP. The reels are kept locally as `assets/reference/omnyalab-football.mp4` and `assets/reference/ascenta-basketball.mp4`. They are not in git (`assets/` is ignored, and they are someone else's work), so ask Josh for them on a fresh clone. To get a contact sheet of a reel, run `ffmpeg -i <reel> -vf "fps=1,scale=480:-1,tile=4x8" -frames:v 1 sheet.jpg`. Every step of the flow works and the ticket card's fields match the reel. The gaps are in how it looks, how the camera moves, and the VIP steps.

Ranked roughly by how much each one shows on screen. Gaps where the plan chose differently on purpose are marked **(by plan)**.

## 1. Rendering quality

Addressed on 2026-11-24. A warm floodlight casts shadows across the bowl, with cool fill from the opposite side. Both venues use a near-black backdrop and a lit perimeter in place of the car park; at Cape Point the perimeter runs outside the stadium model. Cape Point also picks up the venue accent on its roof membrane and trusses, and the glow fades with the roof in the overview.

Seats now have a cupped pan and curved backrest. Nearby blocks use the detailed moulding and glossy plastic. Distant tiers use an eight-triangle version of the same profile. The seat view leaves the rows empty, with availability shown by seat colour. This replaces the crowd billboards specified in PLAN M5.

## 2. Camera moves

- The reels use fast swooping dives with motion blur: aerial, then top-down over the block, then down to the seat. The app's moves are plain and have no blur.
- **Bug:** the camera path from the seat view to the skybox passes through the stand. One frame shows the inside of the concrete, with the VIP card cut off by geometry.
- The omnyalab reel ends by pulling back to the aerial view. Not checked whether the app does this after Confirm.

## 3. VIP upgrade

- **No exterior shot.** The reel shows the glass skybox from outside, then goes inside. The app's boxes are procedural with no glass (DECISIONS, Skyboxes), so there is no such shot.
- **VIP seat view.** It looks like an ordinary seat view. There is no glass or box frame around it, as in the reel's "Your view from the box".
- **Recliners.** The reel has leather recliners with one highlighted. The app's are blocky dark boxes.
- **VIP card.** The reel's is a polished black ticket with a barcode and a "Choose your VIP seat →" call to action. In the app, boxes and seat numbers are plain underlined text links ("Skybox 1 · Skybox 2…", "1 2 3 4…").
- **Ending.** The reel ends on an "Another view" pick with "Confirm ticket" and "Choose another seat". The app goes straight to Confirm VIP.
- **Header.** It still says "Block 205 · 51 left · R 750" while you are in the VIP box.

## 4. Overview and block view

- **Stand hover.** The reel tints the whole stand orange and its glass tag shows stock ("Sold out", "18 left"). The app's highlight is a 15% additive tint plus a white outline (`src/scene/Stand.tsx`), and the tag shows no stock. The stand tag could not be made to appear in the desktop app's browser pane, though seat hover worked there and the e2e smoke test covers stand hover.
- **Block view.** The reel highlights the chosen block in an accent colour and gives free and taken seats strongly contrasting colours. The app colours every block the same, so the chosen block does not stand out.
- **LED price ribbons.** They cut through seat rows and get clipped ("UPPER TIER · FROM", "ER · FROM R 750"). In the ascenta reel they sit cleanly on the fascia between tiers.
- **Seat tooltip.** The reel floats it beside the seat in the 3D scene. The app pins it to the bottom-left corner.
- **Ticket card.** The reel's floats in the middle of the scene with a 3D tilt. The app's is docked bottom-right and flat.

## 5. Not yet taken from the ascenta reel

- A jumbotron showing the matchup.
- A separate premium-suites tier with its own ribbon ("PREMIUM SUITES FROM $480").

## Suggested order

1. The camera path into the skybox (§2): a visible bug.
2. Glass skybox, exterior shot and VIP card (§3).
3. The rest of §4 and §5.
