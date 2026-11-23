// Kept apart from shellLoader.ts so the entry chunk doesn't pull in GLTFLoader.

/**
 * Starts downloading the shell before the 3D chunk has loaded. The request
 * matches `fetchShell` in shellLoader.ts (same URL, CORS mode, same-origin credentials), so
 * the browser hands the preloaded response to it.
 */
export function preloadShell(url: string) {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "fetch";
  link.crossOrigin = "anonymous";
  link.href = url;
  document.head.append(link);
}
