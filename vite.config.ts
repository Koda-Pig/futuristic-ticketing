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
    plugins: [react(), frameAncestors(origins), preloadStadium()],
    resolve: {
      alias: {
        n8ao: decodeURIComponent(
          new URL("src/stubs/n8ao.ts", import.meta.url).pathname,
        ),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // React first, so the 3D group below can't swallow it (it would
              // follow R3F's imports) and drag the entry into the 3D chunk.
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 2,
              },
              // The 3D libraries and everything they import change far less
              // often than the app, so they get their own long-cached chunk
              // instead of being re-downloaded with every app deploy.
              {
                name: "three",
                test: /node_modules[\\/](three|three-stdlib|postprocessing|@react-three[\\/][^\\/]+)[\\/]/,
                priority: 1,
              },
            ],
          },
        },
      },
    },
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

/**
 * The stadium chunk is a dynamic import, so the browser only discovers it once
 * the entry has downloaded and run. Preload it (and its imports) from the HTML
 * so the two download in parallel.
 */
function preloadStadium(): Plugin {
  return {
    name: "preload-stadium",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle ?? {};
        const chunks = Object.values(bundle).filter(
          (output) => output.type === "chunk",
        );
        const stadium = chunks.find(
          (chunk) => chunk.isDynamicEntry && chunk.name === "stadium",
        );
        if (!stadium) throw new Error("No stadium chunk to preload");
        const files = new Set<string>();
        const visit = (fileName: string) => {
          const chunk = bundle[fileName];
          if (files.has(fileName) || chunk?.type !== "chunk" || chunk.isEntry)
            return;
          files.add(fileName);
          chunk.imports.forEach(visit);
        };
        visit(stadium.fileName);
        return [...files]
          .filter((file) => !html.includes(`href="/${file}"`))
          .map((file) => ({
            tag: "link",
            attrs: {
              rel: "modulepreload",
              crossorigin: true,
              href: "/" + file,
            },
            injectTo: "head" as const,
          }));
      },
    },
  };
}
