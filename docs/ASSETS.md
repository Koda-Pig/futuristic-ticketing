# Cape Point shell

| Measurement      | Source glTF | Shipped GLB |    Maximum |
| ---------------- | ----------: | ----------: | ---------: |
| Triangles        |   6,156,109 |     812,098 |    850,000 |
| Materials        |          62 |          15 |         15 |
| Bytes (unzipped) | 367,032,545 |   8,761,768 | 15,000,000 |
| Bytes (gzipped)  |             |   5,453,711 |            |

Source bytes include the manifest, referenced buffer and textures. Triangle counts exclude SketchUp line primitives. Reproduce with `pnpm process:stadium`; add `VERBOSE=1` for a per-material reduction table. The processor checks all three budgets before replacing the derivative (`MAX_TRIANGLES` overrides the triangle limit for experiments only).

Per surface: concrete 221k, charcoal 179k, truss 136k, steel 98k, leather 60k, roof 54k, wood 27k, everything else under 20k each.

## Packing

The last stage repairs zero normals (simplification leaves them on zero-area faces; they shade as NaN and Bloom spreads that into black frames), prunes unused images, applies meshopt at level `high` (filters: octahedral normals, exponential UVs) and gzips the GLB. Meshopt output is meant to be followed by a general-purpose compressor, and static hosts don't reliably gzip `model/gltf-binary`, so the app inflates it itself (`src/scene/shellLoader.ts`, which also accepts an already-decoded response). The file name carries a content hash so `_headers` can cache it for a year; `venue.json` records the current name.

2026-11-24: moving from meshopt `medium` to `high` plus gzip took the download from 11,310,820 to 5,453,711 bytes (−52%). That change was made with `--repack` on the previous derivative, so normals went from 16-bit to 8-bit octahedral without a fresh pass from source. The repack also repaired 903 zero normals that the app used to fix on every load.

## Geometry and scale

The two goal-mouth assemblies sit near source Y = −18 and 4,147. At 0.0254 metres per source unit their separation is 105.8 m. The source root rotates Z-up into Y-up. The processor keeps that rotation, places the pitch centre (1,205, 2,063, −59) at the world origin, and uses +Z for south.

The isolated dark `Color_M07` geometry traces perimeter rails, horizontal bands and upright framing. The processor retains it. It removes the repeating plastic public seats and brushed-steel seat frames, the playing surface, goals, pitch-side equipment and exported edge lines. The leather seating on the east side belongs to the hospitality area.

The source is exported in ~43k-triangle chunks that each span the whole stadium, so surfaces can only be separated by material, not by primitive. That is why the model's terraces stay in the shell and the bowl generator only adds seats.

## Simplification rules (`scripts/stadium-materials.json`)

Each source material maps to a `surface` (the shipped material) and an `action`: `drop`, `keep` or `decimate`. Decimate rules take:

- `ratio`: target fraction of triangles. The simplifier stops earlier if it would exceed `maxError`.
- `maxError`: allowed geometric error in **metres** (default 0.01). Concrete uses 0.05, the roof truss 0.08 and the `Color_M07` rails 0.15. All were checked at the Sideline and Skybox bookmarks.
- `lockBorder: false`: lets mesh borders move (within `maxError`). Needed for SketchUp geometry full of T-junctions (concrete, rails); without it nothing collapses.
- `prune`: drop disconnected fragments smaller than `maxError`.
- `sloppy`: fall back to sloppy simplification for dense fixtures that cannot collapse normally. It is only used when it produces fewer triangles.
- `uv: "box"`: strip UVs before simplifying and regenerate box-projected UVs (2 m tile) afterwards, so textured concrete can be welded and decimated.

Flat-colour surfaces lose their UVs. Normals stripped for simplification are rebuilt as creased normals (40°), so curved seats shade smoothly and steps keep hard edges.

## Surfaces the app relies on

| Surface                              | Use                                                         |
| ------------------------------------ | ----------------------------------------------------------- |
| `roof`, `membrane`, `glass`, `truss` | Fade with camera height in the overview; never cast shadows |
| `leather`                            | East hospitality seating (open tier, not enclosed boxes)    |
| `display`, `screen`                  | LED screens; candidates for the jumbotron texture in M3     |
| `concrete`                           | Terraces the generated seats sit on                         |

## East hospitality seating

In source coordinates the elevated leather seats occupy X ≈ 3,551–3,827 and Y ≈ 1,059–3,067. Three longitudinal gaps split the lower bank into four groups. Each group faces west, toward −X (rotation about Y = −π/2 for an object facing local +Z).

| Group, north to south | Approximate world position (x, y, z), metres |
| --------------------- | -------------------------------------------- |
| North end             | (63, 8.4, −19.4)                             |
| North centre          | (63, 8.4, −6.5)                              |
| South centre          | (63, 8.4, 6.5)                               |
| South end             | (63, 8.4, 19.4)                              |

These positions reference the lower bank of hospitality seats. The upper seats reach roughly 12.8 m above the pitch.

**There are no enclosed skyboxes.** The dark "windows" behind these seats and along the top of the upper tiers are opaque `charcoal` panels on solid concrete. Hiding the `charcoal` surface reveals plain wall. The VIP box interior must therefore be built procedurally (docs/PLAN.md §7.4) and inserted behind the panel band above the hospitality seats.

## Inspection

`/?debug=shell` loads the shipped shell (the file `venue.json` names).

- **Night look-dev** (on by default): ACES tone mapping, a dim environment, two shadow-casting floodlight keys and a striped pitch. Judge assets with this on. The neutral daylight view is only for checking geometry.
- **Fade roof from above** (on by default): previews the overview roof fade.
- Bookmarks: **Overview** (roof, facade, whole bowl), **Sideline** (across the pitch to the east stands), **Skybox exterior** (the hospitality seats).
- In dev, `__inspector.pose([[x, y, z], [tx, ty, tz]])` in the console moves the camera, which helps when authoring new bookmarks.

The source-material inspector (`/?debug=materials`) runs only on the development server.
