export function isInspectorMode(search: string) {
  const mode = new URLSearchParams(search).get("debug");
  return mode === "shell" || mode === "materials";
}
