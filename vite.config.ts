import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // On Netlify, DEPLOY_PRIME_URL is this deploy's own address and URL is the
  // site's main (production) address. Both may host embed-test.html.
  const env = loadEnv(mode, ".", ["DEPLOY_PRIME_URL", "URL", "NETLIFY"]);
  const origins = [env.DEPLOY_PRIME_URL, env.NETLIFY && env.URL]
    .filter((url): url is string => !!url && URL.canParse(url))
    .map((url) => new URL(url).origin);
  return {
    define: {
      "import.meta.env.EMBED_ORIGINS": JSON.stringify([...new Set(origins)]),
    },
    plugins: [react()],
    test: { include: ["tests/**/*.test.{ts,tsx}"] },
  };
});
