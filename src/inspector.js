import "./inspector.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

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
function button(parent, label, action) {
  const el = document.createElement("button");
  el.textContent = label;
  el.onclick = action;
  parent.append(el);
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
async function start() {
  document.querySelector("#raw").hidden = !import.meta.env.DEV;
  if (raw && !import.meta.env.DEV)
    throw Error("Source materials are available on the local dev server.");
  const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("canvas"),
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24313b);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 700);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener("change", () => renderer.render(scene, camera));
  function pose([eye, target]) {
    camera.position.fromArray(eye);
    controls.target.fromArray(target);
    controls.update();
  }
  for (const [name, view] of Object.entries(bookmarks))
    button(document.querySelector("#bookmarks"), name, () => pose(view));
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  addEventListener("resize", resize);
  resize();
  pose(bookmarks.Overview);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x9eaeb7, 2));
  const sun = new THREE.DirectionalLight(0xfff2d7, 2.4);
  sun.position.set(-60, 110, 55);
  scene.add(sun);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const url = raw
    ? "/assets/modern_stadium/scene.gltf"
    : "/venues/cape-point/shell.glb";
  const { scene: model } = await loader.loadAsync(url);
  if (raw) {
    model.scale.setScalar(0.0254);
    model.position.set(-1205 * 0.0254, 59 * 0.0254, 2063 * 0.0254);
    materialPanel(model, () => renderer.render(scene, camera));
  }
  scene.add(model);
  renderer.render(scene, camera);
  status.textContent = "Drag to orbit · Scroll to zoom";
}
start().catch(
  (error) => (status.textContent = "Inspector unavailable. " + error.message),
);
