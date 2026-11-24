# Gaps against the reference reels

Review of 2026-11-24. Method: frames taken from both reels (PLAN §2) and set beside the app running on the dev server (Cape Point), from the overview through to Confirm VIP. The reels are kept locally as `assets/reference/omnyalab-football.mp4` and `assets/reference/ascenta-basketball.mp4`. They are not in git (`assets/` is ignored, and they are someone else's work), so ask Josh for them on a fresh clone. To get a contact sheet of a reel, run `ffmpeg -i <reel> -vf "fps=1,scale=480:-1,tile=4x8" -frames:v 1 sheet.jpg`. Every step of the flow works and the ticket card's fields match the reel. The gaps are in how it looks, how the camera moves, and the VIP steps.

Ranked roughly by how much each one shows on screen. Gaps where the plan chose differently on purpose are marked **(by plan)**.

## 1. Rendering quality

Addressed on 2026-11-24. A warm floodlight casts shadows across the bowl, with cool fill from the opposite side. Both venues use a near-black backdrop and a lit perimeter in place of the car park; at Cape Point the perimeter runs outside the stadium model. Cape Point also picks up the venue accent on its roof membrane and trusses, and the glow fades with the roof in the overview.

Seats now have a cupped pan and curved backrest. Nearby blocks use the detailed moulding and glossy plastic. Distant tiers use an eight-triangle version of the same profile. The seat view leaves the rows empty, with availability shown by seat colour. This replaces the crowd billboards specified in PLAN M5.

## 2. Camera moves

Addressed on 2026-11-24. The camera sweeps above the selected block, dives into the bowl and settles at the seat. Camera motion adds directional blur when post-processing is on. Reduced motion jumps to the destination and skips the blur.

The VIP upgrade leaves the rows toward the pitch and enters the box through its front opening. Confirming either ticket pulls back to the aerial overview with the confirmation card still visible.

## 3. VIP upgrade

Addressed on 2026-11-24. Upgrading stops outside the glass-fronted skybox. The black VIP ticket shows a barcode and a “Choose your VIP seat” button that takes the camera inside. The header shows the active box, its available seats and the VIP price.

The picker highlights an available padded recliner. Pick a chair in the scene or use its numbered button to see the pitch through the window from that seat. The “Another view” ticket lets you confirm or return to the same box to choose another recliner.

## 4. Overview and block view

Addressed on 2026-11-24. Hovering a stand tints it orange and shows its remaining stock and lowest available price. In the block view, available seats in the chosen block use the venue accent, taken seats are charcoal, and surrounding blocks are muted.

Price panels sit below the front tread of each tier and fit whole labels to each block. The seat preview tracks its chair as the camera moves. The ticket floats near the centre with a slight tilt. Outside the skybox and in the chair picker, the VIP ticket docks to the right (to the bottom on narrow screens) and the view shifts into the space beside it, widening in the picker so every recliner stays clear and clickable.

## 5. Jumbotrons and premium suites

Addressed on 2026-11-24. Both ends of each pitch have a jumbotron showing the home and away teams and the local kickoff. Cape Point uses the screen mounts in the stadium model.

Premium Suites has its own bookable blocks, copper-coloured seats and a price ribbon. The suites start at R2 400 in Cape Point’s east stand and £95 in Riverside’s west stand. Selecting a suite seat uses the regular ticket flow, with the VIP skybox available as a separate upgrade.
