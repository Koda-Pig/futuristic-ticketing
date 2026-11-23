import "./inspector.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { fetchShell } from "./scene/shellLoader";

const raw = new URLSearchParams(location.search).get("debug") === "materials";
const status = document.querySelector("#status");
const bookmarks = {
  Overview: [
    [-143, 116, 163],
    [0, 4, 0],
  ],
  Sideline: [
    [-42, 5, 8],
    [38, 10, -5],
  ],
  "Skybox exterior": [
    [46, 9, 8],
    [62, 11, 6.5],
  ],
};
// Shell surfaces that hide the seating bowl from above (see docs/PLAN.md §9).
const ROOF_SURFACES = new Set(["roof", "membrane", "glass", "truss"]);
const ROOF_FADE = { low: 35, high: 90, minOpacity: 0.12 };

function button(parent, label, action) {
  const el = document.createElement("button");
  el.textContent = label;
  el.onclick = action;
  parent.append(el);
}
function toggle(parent, label, checked, action) {
  const el = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.onchange = () => action(input.checked);
  el.append(input, label);
  parent.append(el);
  return input;
}
function materialPanel(model, redraw) {
  const groups = new Map();
  model.traverse((object) => {
    if (!object.material) return;
    const name = object.material.name;
    if (!groups.has(name)) groups.set(name, { objects: [], triangles: 0 });
    const group = groups.get(name);
    group.objects.push(object);
    if (object.isMesh)
      group.triangles +=
        (object.geometry.index?.count ??
          object.geometry.attributes.position.count) / 3;
  });
  const panel = document.querySelector("#materials");
  const inputs = new Map();
  function show(name) {
    for (const [key, group] of groups) {
      inputs.get(key).checked = !name || key === name;
      group.objects.forEach((o) => (o.visible = inputs.get(key).checked));
    }
    redraw();
  }
  button(panel, "Show all", () => show());
  for (const [name, group] of [...groups].sort(
    (a, b) => b[1].triangles - a[1].triangles,
  )) {
    const row = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    inputs.set(name, input);
    input.onchange = () => {
      group.objects.forEach((o) => (o.visible = input.checked));
      redraw();
    };
    label.append(input, name + " · " + group.triangles.toLocaleString());
    row.append(label);
    button(row, "Isolate", () => show(name));
    panel.append(row);
  }
}
// Mowing-stripe pitch so the bowl reads at the right scale under look-dev lighting.
function pitch() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? "#2f6b2a" : "#357a2f";
    ctx.fillRect(i * 64, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(68 + 12, 105 + 12),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  );
  texture.rotation = Math.PI / 2;
  texture.center.set(0.5, 0.5);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}
function lighting(scene, renderer) {
  const neutral = new THREE.Group();
  neutral.add(new THREE.HemisphereLight(0xfffaf0, 0x9eaeb7, 2));
  const sun = new THREE.DirectionalLight(0xfff2d7, 2.4);
  sun.position.set(-60, 110, 55);
  neutral.add(sun);

  // Night match preview: dim environment, cool sky, two warm floodlight keys.
  const night = new THREE.Group();
  night.add(new THREE.HemisphereLight(0x5a6f99, 0x0b0d12, 0.35));
  for (const [x, z, shadows] of [
    [-70, 90, true],
    [70, -90, false],
  ]) {
    const flood = new THREE.DirectionalLight(0xfff1dc, shadows ? 3.2 : 1.6);
    flood.position.set(x, 75, z);
    flood.castShadow = shadows;
    if (shadows) {
      flood.shadow.mapSize.set(2048, 2048);
      Object.assign(flood.shadow.camera, {
        left: -110,
        right: 110,
        top: 110,
        bottom: -110,
        near: 10,
        far: 320,
      });
      flood.shadow.bias = -0.0004;
      flood.shadow.normalBias = 0.05;
    }
    night.add(flood);
  }
  night.add(pitch());
  const env = new THREE.PMREMGenerator(renderer).fromScene(
    new RoomEnvironment(),
    0.04,
  ).texture;
  function set(lookdev) {
    neutral.visible = !lookdev;
    night.visible = lookdev;
    scene.environment = lookdev ? env : null;
    scene.environmentIntensity = 0.25;
    scene.background.set(lookdev ? 0x070a12 : 0x24313b);
    renderer.toneMapping = lookdev
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    renderer.shadowMap.enabled = lookdev;
    scene.traverse((o) => o.material && (o.material.needsUpdate = true));
  }
  scene.add(neutral, night);
  return set;
}
async function start() {
  document.querySelector("#raw").hidden = !import.meta.env.DEV;
  if (raw && !import.meta.env.DEV)
    throw Error("Source materials are available on the local dev server.");
  const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("canvas"),
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24313b);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 700);
  const controls = new OrbitControls(camera, renderer.domElement);
  const roof = [];
  let roofFade = !raw;
  function render() {
    // Fade roof surfaces as the camera rises so the stands stay visible from above.
    const t = THREE.MathUtils.smoothstep(
      camera.position.y,
      ROOF_FADE.low,
      ROOF_FADE.high,
    );
    const opacity = roofFade
      ? THREE.MathUtils.lerp(1, ROOF_FADE.minOpacity, t)
      : 1;
    for (const material of roof) {
      material.opacity = opacity * material.userData.baseOpacity;
      material.transparent = opacity < 1 || material.userData.baseOpacity < 1;
      material.depthWrite = !material.transparent;
    }
    renderer.render(scene, camera);
  }
  controls.addEventListener("change", render);
  function pose([eye, target]) {
    camera.position.fromArray(eye);
    controls.target.fromArray(target);
    controls.update();
  }
  // Dev-only handle for authoring bookmarks from the console: __inspector.pose([eye, target]).
  if (import.meta.env.DEV)
    window.__inspector = { scene, camera, controls, pose, render };
  for (const [name, view] of Object.entries(bookmarks))
    button(document.querySelector("#bookmarks"), name, () => pose(view));
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    render();
  }
  addEventListener("resize", resize);
  resize();
  pose(bookmarks.Overview);
  const setLighting = lighting(scene, renderer);
  const options = document.querySelector("#options");
  toggle(options, "Night look-dev", !raw, (on) => {
    setLighting(on);
    render();
  });
  toggle(options, "Fade roof from above", roofFade, (on) => {
    roofFade = on;
    render();
  });
  setLighting(!raw);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // The shipped shell is gzipped under a hashed name that venue.json records.
  const { scene: model } = raw
    ? await loader.loadAsync("/assets/modern_stadium/scene.gltf")
    : await loader.parseAsync(
        await fetchShell(
          (await (await fetch("/venues/cape-point/venue.json")).json()).shell
            .gltfUrl,
        ),
        "",
      );
  if (raw) {
    model.scale.setScalar(0.0254);
    model.position.set(-1205 * 0.0254, 59 * 0.0254, 2063 * 0.0254);
    materialPanel(model, render);
  }
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    // Real floodlights hang under the roof edge; the roof must not shadow the bowl.
    if (ROOF_SURFACES.has(o.material.name)) o.castShadow = false;
    if (ROOF_SURFACES.has(o.material.name) && !roof.includes(o.material)) {
      o.material.userData.baseOpacity = o.material.opacity;
      roof.push(o.material);
    }
  });
  scene.add(model);
  render();
  status.textContent = "Drag to orbit · Scroll to zoom";
}
start().catch(
  (error) => (status.textContent = "Inspector unavailable. " + error.message),
);
