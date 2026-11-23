import { defineConfig } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

// `GPU=1 pnpm e2e` runs in the installed Google Chrome on the real GPU instead
// of the headless shell's software renderer (SwiftShader), for timing checks.
const gpu = !!process.env.GPU;
// GitHub's 2-core runners render the stadium in SwiftShader about four times
// slower than a laptop (the smoke flow takes over a minute just to load, and
// each VIP step over a minute more), so CI runs one test at a time, gives
// assertions three minutes and leaves actions bounded by the test's own budget.
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  workers: ci ? 1 : undefined,
  retries: ci ? 1 : 0,
  timeout: ci ? 240000 : 30000,
  expect: { timeout: ci ? 180000 : 5000 },
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
