# M3 overview

The production entry, runtime, schema, Three.js and stadium chunks total approximately 471 kB gzip in the local Vite build. The JavaScript budget is 600 kB gzip. This figure excludes the on-demand inspector and calibration routes.

The desktop Chromium hover check covers all eight Cape Point stands. A frame-rate measurement on an M1 MacBook Air at 1440p and DPR 1.5, renderer draw-call and triangle counts, and a desktop Lighthouse run against a Netlify preview are pending.

## M5 seat view

The local production entry, runtime, stadium, schema and Three.js chunks total about 475 kB gzip against the 600 kB JavaScript budget. The sold-seat crowd uses one instanced draw per scene render. Entering a seat adds one 800 × 450 snapshot render. A desktop Lighthouse score for a Netlify preview is pending.

Chromium screenshots at 960 × 640 showed the pitch from both acceptance seats. Block 101, row 1, seat 2 looks across the near touchline. Block 301, row 10, seat 1 sees both goals beneath the roof with the crowd below. Neither settled view showed geometry intersecting the camera.
