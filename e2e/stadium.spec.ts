import { expect, test } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";

import { money } from "../src/venue/format";
import { generateBowl } from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

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

test("opens the calibration page with the generated bowl", async ({ page }) => {
  await page.goto("/?calibrate");
  await expect(page.locator("main canvas[data-ready]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
  await expect(page.getByText(/\d{2},\d{3} seats · \d+ blocks/)).toBeVisible();
});

test("shows the starting price when pointing at each stand", async ({
  page,
}) => {
  test.setTimeout(90000);
  // Reduced motion turns off the idle auto-rotate, so the camera stays put.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await expect(page.locator("canvas[data-ready]")).toBeVisible();
  const venue = venueSchema.parse(
    await (await page.request.get("/venues/cape-point/venue.json")).json(),
  );
  const bowl = generateBowl(venue);
  const camera = new PerspectiveCamera(43, 960 / 640, 0.1, 1000);
  camera.position.set(...venue.cameras.overview.position);
  camera.lookAt(...venue.cameras.overview.target);
  camera.updateMatrixWorld();
  const tag = page.locator("output");
  for (const stand of venue.stands) {
    const blocks = bowl.blocks.filter((b) => b.standId === stand.id);
    const cheapest = Math.min(
      ...blocks.map((b) => venue.pricing.tiers[b.tierId][stand.id]),
    );
    let found = false;
    for (const block of blocks.filter((b) => b.tierId === "upper")) {
      const point = new Vector3(...block.centroid).project(camera);
      await page.mouse.move((point.x + 1) * 480, (1 - point.y) * 320);
      if ((await tag.textContent())?.includes(stand.label)) {
        found = true;
        break;
      }
    }
    expect(found, stand.label).toBe(true);
    await expect(tag).toContainText(money(venue, cheapest));
  }
});
