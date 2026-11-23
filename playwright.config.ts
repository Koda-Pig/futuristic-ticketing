import { defineConfig } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

// `GPU=1 pnpm e2e` runs in the installed Google Chrome on the real GPU instead
// of the headless shell's software renderer (SwiftShader), for timing checks.
const gpu = !!process.env.GPU;

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://127.0.0.1:4197",
    ...(gpu && {
      channel: "chrome",
      launchOptions: {
        args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"],
      },
    }),
  },
  webServer: {
    command: "node_modules/.bin/vite --host 127.0.0.1 --port 4197 --strictPort",
    url: "http://127.0.0.1:4197",
  },
});
