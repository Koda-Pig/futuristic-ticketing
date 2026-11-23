import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const { DEPLOY_PRIME_URL } = loadEnv(mode, ".", "DEPLOY_PRIME_URL");
  return {
    define: {
      "import.meta.env.EMBED_PREVIEW_ORIGIN": JSON.stringify(
        DEPLOY_PRIME_URL ? new URL(DEPLOY_PRIME_URL).origin : "",
      ),
    },
    plugins: [react()],
    test: { include: ["tests/**/*.test.{ts,tsx}"] },
  };
});
