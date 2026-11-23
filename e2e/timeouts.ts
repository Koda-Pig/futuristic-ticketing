declare const process: { env: Record<string, string | undefined> };

/**
 * Scales a test's time budget for CI, where SwiftShader on a 2-core runner is
 * several times slower than a laptop's software renderer (playwright.config.ts).
 */
export const budget = (ms: number) => (process.env.CI ? ms * 4 : ms);
