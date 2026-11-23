# Cape Point shell

| Measurement | Source glTF | Shipped GLB | Maximum |
|---|---:|---:|---:|
| Triangles | 6,156,109 | 298,476 | 300,000 |
| Materials | 62 | 13 | 15 |
| Bytes | 367,032,545 | 2,011,824 | 15,000,000 |

Source bytes include the manifest, referenced buffer and textures. Triangle counts exclude SketchUp line primitives. Reproduce with `npm run process:stadium`. The processor checks all three budgets before replacing the derivative.

## Geometry and scale

The two goal-mouth assemblies sit near source Y = −18 and 4,147. At 0.0254 metres per source unit their separation is 105.8 m. The source root rotates Z-up into Y-up. The processor keeps that rotation, places the pitch centre (1,205, 2,063, −59) at the world origin, and uses +Z for south.

The isolated dark `Color_M07` geometry traces perimeter rails, horizontal bands and upright framing. The processor retains it. It removes the repeating plastic public seats and brushed-steel seat frames, the playing surface, goals, pitch-side equipment and exported edge lines. The leather seating on the east side belongs to the hospitality area. The main roof skin and wood facade retain their source geometry. Flat surfaces share materials, while the screens retain their image maps.

## East hospitality seating

In source coordinates the elevated leather seats occupy X ≈ 3,551–3,827 and Y ≈ 1,059–3,067. Three longitudinal gaps split the lower bank into four groups. The following are approximate centres for positioning cameras or fitting procedural interiors. Each group faces west, toward −X (rotation about Y = −π/2 for an object facing local +Z).

| Group, north to south | Approximate world position (x, y, z), metres |
|---|---|
| North end | (63, 8.4, −19.4) |
| North centre | (63, 8.4, −6.5) |
| South centre | (63, 8.4, 6.5) |
| South end | (63, 8.4, 19.4) |

These positions reference the lower bank of hospitality seats. The upper seats reach roughly 12.8 m above the pitch. The model supplies no suite numbers or interior pivot points.

## Inspection

Use the **Overview** bookmark to inspect the roof, facade and end screens. **Sideline** looks across the empty pitch toward the east stands. **Skybox exterior** faces the hospitality seats. Orbit and zoom work from each bookmark. The source-material inspector runs only on the development server.
