import { isInspectorMode } from "./inspectorMode";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

// The inspector reads the licensed source model in assets/ and calibration is
// an authoring tool, so both exist in the dev server only and are left out of
// production builds.
if (import.meta.env.DEV && isInspectorMode(location.search)) {
  const { default: markup } = await import("./inspector.html?raw");
  root.innerHTML = markup;
  document.title = "Cape Point Stadium · Model inspector";
  await import("./inspector.js");
} else if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("calibrate")
) {
  const [{ mountVenue }, { Calibrate }] = await Promise.all([
    import("./stadium"),
    import("./dev/Calibrate"),
  ]);
  document.title = "Cape Point Stadium · Calibrate";
  await mountVenue(root, (venue) => <Calibrate initial={venue} />);
} else {
  const { mount } = await import("./stadium");
  await mount(root);
}
