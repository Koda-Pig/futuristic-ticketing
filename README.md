# Stadium ticketing

Run `pnpm install` and `pnpm dev`. The root page opens the night-match overview. Hover a stand for its starting price, drag to orbit, or scroll to zoom. Open `/?debug=shell` for the processed Cape Point model and its camera bookmarks. Night look-dev lighting and the roof fade are on by default.

Run `pnpm test` for the unit tests and `pnpm lint` for ESLint. Install Chromium once with `pnpm exec playwright install chromium --only-shell`, then run `pnpm e2e` for the browser checks.

For local material inspection, place the licensed source glTF, binary buffer and textures in `assets/modern_stadium/` and open `/?debug=materials`. Each row shows a material's triangle count. Use the checkbox to toggle it, or **Isolate** to see its geometry alone.

Run `pnpm process:stadium` to rebuild the shell and check its budgets (`VERBOSE=1` prints per-material reductions). `pnpm build` produces the static viewer in `dist/`. Measurements, simplification rules and calibration notes are in [the asset report](docs/ASSETS.md).

Stadium model: “Modern Stadium” by Razny (Sketchfab), Sketchfab Standard licence. [Source model](https://sketchfab.com/3d-models/modern-stadium-21767e058e9e4df8a1c57352611756aa)
