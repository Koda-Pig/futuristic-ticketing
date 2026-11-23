import fs from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  compactPrimitive,
  dedup,
  flatten,
  join,
  meshopt,
  prune,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import {
  MeshoptEncoder,
  MeshoptDecoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import sharp from "sharp";
import { BufferAttribute, BufferGeometry } from "three";
import {
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

const source = "assets/modern_stadium/scene.gltf";
const output = "public/venues/cape-point/shell.glb";
const METRES_PER_UNIT = 0.0254; // SketchUp export is in inches
const DEFAULT_MAX_ERROR = 0.01; // metres; geometric error allowed per decimated surface
const CREASE_ANGLE = (40 * Math.PI) / 180;
const rules = JSON.parse(await fs.readFile("scripts/stadium-materials.json"));
await Promise.all([
  MeshoptEncoder.ready,
  MeshoptDecoder.ready,
  MeshoptSimplifier.ready,
]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const doc = await io.read(source);
const root = doc.getRoot();
const primitives = () =>
  root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
const triangles = (p) =>
  p.getMode() === 4 ? p.getIndices().getCount() / 3 : 0;
function stats(bytes) {
  return {
    triangles: primitives().reduce((sum, p) => sum + triangles(p), 0),
    materials: root.listMaterials().length,
    bytes,
  };
}
const manifest = JSON.parse(await fs.readFile(source));
const files = [
  source,
  ...[...manifest.images, ...manifest.buffers].map((item) =>
    path.join(path.dirname(source), item.uri),
  ),
];
const before = stats(
  (await Promise.all([...new Set(files)].map((file) => fs.stat(file)))).reduce(
    (sum, f) => sum + f.size,
    0,
  ),
);

// Flat-colour surfaces lose their UVs; any surface not listed here keeps the
// first source material's textures (e.g. concrete keeps Beton_16).
const surfaces = new Map();
const colors = {
  steel: [0.34, 0.36, 0.38],
  truss: [0.4, 0.42, 0.44], // distinct from steel so dedup() keeps it separate for roof fading
  concreteFlat: [0.3, 0.3, 0.29],
  charcoal: [0.035, 0.04, 0.045],
  white: [0.85, 0.85, 0.82],
  ochre: [0.9, 0.57, 0.025],
  leather: [0.09, 0.05, 0.035],
  roof: [0.85, 0.84, 0.72],
};
const reductions = new Map();
const boxUv = new Set();
const UV_TILE_METRES = 2;
for (const p of primitives()) {
  const original = p.getMaterial();
  const rule = rules[original.getName()];
  if (!rule) throw Error("Unclassified material " + original.getName());
  if (rule.action === "drop") {
    p.dispose();
    continue;
  }
  const name = rule.surface;
  if (!surfaces.has(name)) {
    const material = colors[name]
      ? doc
          .createMaterial()
          .setMetallicFactor(name === "steel" || name === "truss" ? 0.35 : 0)
          .setRoughnessFactor(0.76)
          .setBaseColorFactor([...colors[name], 1])
          .setDoubleSided(original.getDoubleSided())
      : original.clone();
    surfaces.set(name, material.setName(name));
  }
  p.setMaterial(surfaces.get(name));
  // SketchUp exports textured faces as separate islands, so UV and hard-edge
  // normal splits become locked borders that block simplification. Strip them
  // and rebuild after decimation: creased normals, and box-projected UVs for
  // textured surfaces marked `"uv": "box"`.
  if (colors[name] || rule.uv === "box") p.setAttribute("TEXCOORD_0", null);
  if ((colors[name] || rule.uv === "box") && rule.ratio)
    p.setAttribute("NORMAL", null);
  if (rule.uv === "box") boxUv.add(p);
  if (rule.ratio) reductions.set(p, { ...rule, material: original.getName() });
}
await doc.transform(prune(), weld());

const reductionLog = {};
for (const [p, rule] of reductions) {
  if (p.isDisposed()) continue;
  const log = (reductionLog[rule.material] ??= { before: 0, after: 0 });
  log.before += triangles(p);
  const positions = Float32Array.from(p.getAttribute("POSITION").getArray());
  const indices = Uint32Array.from(p.getIndices().getArray());
  const target = Math.max(3, 3 * Math.floor((indices.length * rule.ratio) / 3));
  // Convert the metre budget into meshopt's error, which is relative to mesh extent.
  const maxError =
    (rule.maxError ?? DEFAULT_MAX_ERROR) /
    METRES_PER_UNIT /
    MeshoptSimplifier.getScale(positions, 3);
  let [result] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3,
    target,
    maxError,
    [
      ...(rule.lockBorder === false ? [] : ["LockBorder"]),
      // Removes disconnected fragments (bolts, short rail stubs) smaller than the error.
      ...(rule.prune ? ["Prune"] : []),
    ],
  );
  // Disconnected tubes and export seams can block edge collapses on dense
  // fixtures; opt-in rules fall back to sloppy simplification within the same error.
  if (rule.sloppy && result.length > target * 1.2) {
    const [sloppy] = MeshoptSimplifier.simplifySloppy(
      indices,
      positions,
      3,
      null,
      target,
      maxError,
    );
    if (sloppy.length && sloppy.length < result.length) result = sloppy;
  }
  p.getIndices().setArray(result);
  compactPrimitive(p);
  log.after += triangles(p);
}
if (process.env.VERBOSE)
  console.table(
    Object.fromEntries(
      Object.entries(reductionLog).sort((a, b) => b[1].after - a[1].after),
    ),
  );

// Rebuild normals for surfaces whose normals were stripped: smooth across
// gentle curvature, hard across creases (steps, frames, fascia edges).
for (const p of primitives()) {
  if (p.getMode() !== 4 || p.getAttribute("NORMAL")) continue;
  const position = p.getAttribute("POSITION");
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(Float32Array.from(position.getArray()), 3),
  );
  geometry.setIndex(
    new BufferAttribute(Uint32Array.from(p.getIndices().getArray()), 1),
  );
  const creased = mergeVertices(toCreasedNormals(geometry, CREASE_ANGLE));
  position.setArray(creased.getAttribute("position").array);
  p.setAttribute(
    "NORMAL",
    doc
      .createAccessor()
      .setType("VEC3")
      .setArray(creased.getAttribute("normal").array)
      .setBuffer(position.getBuffer()),
  );
  p.getIndices().setArray(Uint32Array.from(creased.getIndex().array));
  if (boxUv.has(p)) {
    // Project each vertex onto the plane facing its dominant normal axis.
    const pos = creased.getAttribute("position").array;
    const nrm = creased.getAttribute("normal").array;
    const uv = new Float32Array((pos.length / 3) * 2);
    const scale = METRES_PER_UNIT / UV_TILE_METRES;
    for (let i = 0; i < pos.length / 3; i++) {
      const [x, y, z] = pos.subarray(i * 3, i * 3 + 3);
      const [ax, ay, az] = Array.from(nrm.subarray(i * 3, i * 3 + 3), Math.abs);
      const [u, v] = ax >= ay && ax >= az ? [y, z] : ay >= az ? [x, z] : [x, y];
      uv[i * 2] = u * scale;
      uv[i * 2 + 1] = v * scale;
    }
    p.setAttribute(
      "TEXCOORD_0",
      doc
        .createAccessor()
        .setType("VEC2")
        .setArray(uv)
        .setBuffer(position.getBuffer()),
    );
  }
}

const model = root.listScenes()[0].listChildren()[0];
model
  .setScale([METRES_PER_UNIT, METRES_PER_UNIT, METRES_PER_UNIT])
  .setTranslation([
    -1205 * METRES_PER_UNIT,
    59 * METRES_PER_UNIT,
    2063 * METRES_PER_UNIT,
  ]);
await doc.transform(
  flatten(),
  dedup(),
  prune(),
  join(),
  prune(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [1024, 1024],
  }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
const bytes = await io.writeBinary(doc);
const after = stats(bytes.length);
const bySurface = {};
for (const p of primitives()) {
  const name = p.getMaterial()?.getName() ?? "(none)";
  bySurface[name] = (bySurface[name] ?? 0) + triangles(p);
}
console.table(
  Object.fromEntries(
    Object.entries(bySurface)
      .sort((a, b) => b[1] - a[1])
      .map(([name, tris]) => [name, { triangles: tris }]),
  ),
);
console.table({ before, after });
// Desktop-only v1: shell ≤850k leaves room for ~400k far-LOD seats and crowd
// within the 1.5M on-screen budget (docs/PLAN.md §13).
const MAX_TRIANGLES = Number(process.env.MAX_TRIANGLES ?? 850000);
if (
  after.triangles > MAX_TRIANGLES ||
  after.materials > 15 ||
  after.bytes > 15000000
)
  throw Error("Shell exceeds M1 budget");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, bytes);
