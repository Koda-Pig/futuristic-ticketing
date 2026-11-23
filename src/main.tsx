import { isInspectorMode } from "./inspectorMode";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

if (isInspectorMode(location.search)) {
  const { default: markup } = await import("./inspector.html?raw");
  root.innerHTML = markup;
  document.title = "Cape Point Stadium · Model inspector";
  await import("./inspector.js");
} else {
  const { mount } = await import("./stadium");
  await mount(root);
}
