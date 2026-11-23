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
  simplifyPrimitive,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import {
  MeshoptEncoder,
  MeshoptDecoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import sharp from "sharp";

const source = "assets/modern_stadium/scene.gltf";
const output = "public/venues/cape-point/shell.glb";
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
function stats(bytes) {
  return {
    triangles: primitives()
      .filter((p) => p.getMode() === 4)
      .reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0),
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
const surfaces = new Map();
const colors = {
  steel: [0.34, 0.36, 0.38],
  concrete: [0.46, 0.45, 0.43],
  charcoal: [0.035, 0.04, 0.045],
  white: [0.85, 0.85, 0.82],
  ochre: [0.9, 0.57, 0.025],
  leather: [0.09, 0.05, 0.035],
  roof: [0.85, 0.84, 0.72],
};
const reductions = new Map();
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
          .setMetallicFactor(name === "steel" ? 0.35 : 0)
          .setRoughnessFactor(0.76)
          .setBaseColorFactor([...colors[name], 1])
          .setDoubleSided(original.getDoubleSided())
      : original.clone();
    surfaces.set(name, material.setName(name));
  }
  p.setMaterial(surfaces.get(name));
  if (colors[name]) p.setAttribute("TEXCOORD_0", null);
  if (colors[name] && rule.ratio) p.setAttribute("NORMAL", null);
  if (rule.ratio) reductions.set(p, rule.ratio);
}
await doc.transform(prune(), weld());
for (const [p, ratio] of reductions) {
  if (p.isDisposed()) continue;
  const target = Math.max(
    3,
    3 * Math.floor((p.getIndices().getCount() * ratio) / 3),
  );
  simplifyPrimitive(p, {
    simplifier: MeshoptSimplifier,
    ratio,
    error: p.getMaterial().getName() === "concrete" ? 0.002 : 0.01,
    lockBorder: p.getMaterial().getName() !== "concrete",
  });
  // Disconnected tubes and export seams can prevent edge collapses on dense fixtures.
  if (p.getMaterial().getName() === "concrete") continue;
  if (p.getIndices().getCount() > target * 1.2) {
    const [indices] = MeshoptSimplifier.simplifySloppy(
      Uint32Array.from(p.getIndices().getArray()),
      p.getAttribute("POSITION").getArray(),
      3,
      null,
      target,
      0.005,
    );
    if (indices.length) {
      p.getIndices().setArray(indices);
      compactPrimitive(p);
    }
  }
}
const model = root.listScenes()[0].listChildren()[0];
model
  .setScale([0.0254, 0.0254, 0.0254])
  .setTranslation([-1205 * 0.0254, 59 * 0.0254, 2063 * 0.0254]);
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
console.table({ before, after });
if (after.triangles > 300000 || after.materials > 15 || after.bytes > 15000000)
  throw Error("Shell exceeds M1 budget");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, bytes);
