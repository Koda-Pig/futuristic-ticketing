import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { netlifyHeaders } from "./scripts/headers.mjs";

// Host pages that embed the app from the dev server (`pnpm dev` serves
// embed-test.html on 5173; the e2e suite routes a host page there too).
const DEV_HOSTS = ["http://localhost:5173", "http://127.0.0.1:5173"];

export default defineConfig(({ command, mode }) => {
  // On Netlify, DEPLOY_PRIME_URL is this deploy's own address and URL is the
  // site's main (production) address. Both may host embed-test.html.
  const env = loadEnv(mode, ".", ["DEPLOY_PRIME_URL", "URL", "NETLIFY"]);
  const origins = [
    env.DEPLOY_PRIME_URL,
    env.NETLIFY && env.URL,
    ...(command === "serve" ? DEV_HOSTS : []),
  ]
    .filter((url): url is string => !!url && URL.canParse(url))
    .map((url) => new URL(url).origin);
  return {
    define: {
      // A plain global, not import.meta.env: Vitest turns env values into strings.
      __EMBED_ORIGINS__: JSON.stringify([...new Set(origins)]),
    },
    plugins: [react(), frameAncestors(origins)],
    test: { include: ["tests/**/*.test.{ts,tsx}"] },
  };
});

/** Emits Netlify `_headers` (frame-ancestors from the venues' allowlists). */
function frameAncestors(extra: string[]): Plugin {
  return {
    name: "frame-ancestors",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: netlifyHeaders(extra),
      });
    },
  };
}
