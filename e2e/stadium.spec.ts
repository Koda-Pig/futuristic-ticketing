import { expect, test } from "@playwright/test";

test("opens the stadium canvas", async ({ page }) => {
  await page.goto("/");
  // R3F flags its own canvas once the renderer exists, so the WebGL2 check
  // below reads R3F's context instead of creating one.
  const canvas = page.locator("main canvas[data-ready]");
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate(
      (node) =>
        node instanceof HTMLCanvasElement &&
        node.getContext("webgl2")?.isContextLost() === false,
    ),
  ).toBe(true);
});

test("opens the shell inspector bookmark", async ({ page }) => {
  await page.goto("/?debug=shell");
  await expect(page.getByRole("button", { name: "Sideline" })).toBeVisible();
});
