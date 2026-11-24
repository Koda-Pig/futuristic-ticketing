import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
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
const venueFile = "public/venues/cape-point/venue.json";
const outputDir = "public/venues/cape-point";
// `--repack` re-encodes the shipped shell without the licensed source, for
// changes to the final packing stage only (compression, hashing, checks).
const repack = process.argv.includes("--repack");
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
const primitives = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
const triangles = (p) =>
  p.getMode() === 4 ? p.getIndices().getCount() / 3 : 0;
function stats(doc, bytes) {
  return {
    triangles: primitives(doc).reduce((sum, p) => sum + triangles(p), 0),
    materials: doc.getRoot().listMaterials().length,
    bytes,
  };
}
/** The source pipeline: drop, simplify and restyle the licensed model. */
async function fromSource() {
  const doc = await io.read(source);
  const manifest = JSON.parse(await fs.readFile(source));
  const files = [
    source,
    ...[...manifest.images, ...manifest.buffers].map((item) =>
      path.join(path.dirname(source), item.uri),
    ),
  ];
  const before = stats(
    doc,
    (
      await Promise.all([...new Set(files)].map((file) => fs.stat(file)))
    ).reduce((sum, f) => sum + f.size, 0),
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
  for (const p of primitives(doc)) {
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
    if (rule.ratio)
      reductions.set(p, { ...rule, material: original.getName() });
  }
  await doc.transform(prune(), weld());

  const reductionLog = {};
  for (const [p, rule] of reductions) {
    if (p.isDisposed()) continue;
    const log = (reductionLog[rule.material] ??= { before: 0, after: 0 });
    log.before += triangles(p);
    const positions = Float32Array.from(p.getAttribute("POSITION").getArray());
    const indices = Uint32Array.from(p.getIndices().getArray());
    const target = Math.max(
      3,
      3 * Math.floor((indices.length * rule.ratio) / 3),
    );
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

  // Simplification leaves zero-area triangles. Their creased normals come out as
  // (0,0,0), which shade as NaN and make Bloom black out whole frames in motion.
  function dropZeroArea(indices, points) {
    const kept = [];
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const ux = points[b * 3] - points[a * 3],
        uy = points[b * 3 + 1] - points[a * 3 + 1],
        uz = points[b * 3 + 2] - points[a * 3 + 2];
      const vx = points[c * 3] - points[a * 3],
        vy = points[c * 3 + 1] - points[a * 3 + 1],
        vz = points[c * 3 + 2] - points[a * 3 + 2];
      const cross = Math.hypot(
        uy * vz - uz * vy,
        uz * vx - ux * vz,
        ux * vy - uy * vx,
      );
      if (cross > 1e-9) kept.push(a, b, c);
    }
    return Uint32Array.from(kept);
  }

  // Rebuild normals for surfaces whose normals were stripped: smooth across
  // gentle curvature, hard across creases (steps, frames, fascia edges).
  for (const p of primitives(doc)) {
    if (p.getMode() !== 4 || p.getAttribute("NORMAL")) continue;
    const position = p.getAttribute("POSITION");
    const points = Float32Array.from(position.getArray());
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(points, 3));
    geometry.setIndex(
      new BufferAttribute(dropZeroArea(p.getIndices().getArray(), points), 1),
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
        const [ax, ay, az] = Array.from(
          nrm.subarray(i * 3, i * 3 + 3),
          Math.abs,
        );
        const [u, v] =
          ax >= ay && ax >= az ? [y, z] : ay >= az ? [x, z] : [x, y];
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

  const model = doc.getRoot().listScenes()[0].listChildren()[0];
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
  );
  return { doc, before };
}

/** The shipped shell, unpacked, plus its own size as the "before" figure. */
async function fromShipped() {
  const venue = JSON.parse(await fs.readFile(venueFile));
  const file = path.join("public", venue.shell.gltfUrl);
  const raw = await fs.readFile(file);
  const glb = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  const doc = await io.readBinary(glb);
  return { doc, before: stats(doc, raw.length) };
}

/**
 * Zero normals (left on zero-area faces by simplification, or carried over
 * from the source) shade as NaN, and Bloom spreads a NaN pixel into a black
 * frame. Point them up: they only belong to faces with no area.
 */
function repairNormals(doc) {
  let repaired = 0;
  for (const p of primitives(doc)) {
    const normal = p.getAttribute("NORMAL");
    if (!normal) continue;
    const n = [0, 0, 0];
    for (let i = 0; i < normal.getCount(); i++) {
      normal.getElement(i, n);
      if (n[0] || n[1] || n[2]) continue;
      normal.setElement(i, [0, 1, 0]);
      repaired++;
    }
  }
  return repaired;
}

function zeroNormals(doc) {
  let zero = 0;
  for (const p of primitives(doc)) {
    const normal = p.getAttribute("NORMAL");
    if (!normal) continue;
    const n = [0, 0, 0];
    for (let i = 0; i < normal.getCount(); i++) {
      normal.getElement(i, n);
      if (!n[0] && !n[1] && !n[2]) zero++;
    }
  }
  return zero;
}

const { doc, before } = repack ? await fromShipped() : await fromSource();
const repaired = repairNormals(doc);
await doc.transform(
  // textureCompress can leave the original images behind.
  prune(),
  // "high" adds meshopt's filters (octahedral normals, exponential UVs),
  // ~22% smaller than "medium" before gzip.
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
const glb = await io.writeBinary(doc);
// Meshopt is designed to be followed by a general-purpose compressor, and
// static hosts don't reliably gzip model/gltf-binary, so ship it gzipped and
// let the app inflate it (src/scene/shellLoader.ts).
const bytes = gzipSync(glb, { level: 9 });
const after = { ...stats(doc, bytes.length), unzipped: glb.length };
// Check what the browser will decode, not the in-memory document.
const shipped = await io.readBinary(glb);
const zero = zeroNormals(shipped);
const bySurface = {};
for (const p of primitives(doc)) {
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
if (repaired) console.log(`Repaired ${repaired} zero normals`);
if (zero) throw Error(`Shipped shell still has ${zero} zero normals`);
// Desktop-only v1: shell ≤850k leaves room for ~400k far-LOD seats
// within the 1.5M on-screen budget (docs/PLAN.md §13).
const MAX_TRIANGLES = Number(process.env.MAX_TRIANGLES ?? 850000);
if (
  after.triangles > MAX_TRIANGLES ||
  after.materials > 15 ||
  after.unzipped > 15000000
)
  throw Error("Shell exceeds M1 budget");

// A content hash in the name lets the host cache the shell forever
// (scripts/headers.mjs); venue.json points at the current one.
const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
const name = `shell.${hash}.glb.gz`;
await fs.mkdir(outputDir, { recursive: true });
for (const file of await fs.readdir(outputDir))
  if (/^shell\..*glb(\.gz)?$/.test(file) && file !== name)
    await fs.rm(path.join(outputDir, file));
await fs.writeFile(path.join(outputDir, name), bytes);
// Edit the one value in place so the file keeps its formatting.
const text = await fs.readFile(venueFile, "utf8");
const url = "/" + path.posix.join("venues", "cape-point", name);
const updated = text.replace(
  /("gltfUrl":\s*)"[^"]*"/,
  `$1${JSON.stringify(url)}`,
);
if (JSON.parse(updated).shell.gltfUrl !== url)
  throw Error(`Couldn't update shell.gltfUrl in ${venueFile}`);
await fs.writeFile(venueFile, updated);
console.log(`Wrote ${path.join(outputDir, name)}`);
