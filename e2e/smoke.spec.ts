import { expect, test } from "@playwright/test";

import { lastEvent } from "./events";
import { budget } from "./timeouts";
import { PerspectiveCamera, Vector3 } from "three";

import { seatPayload, vipSeatId } from "../src/embed/bridge";
import { soldSeats } from "../src/venue/availability";
import { generateBowl } from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

// The scripted demo from docs/PLAN.md §15.1, embedded in a host page so the
// checkout hand-off is checked too. The whole flow must fit in 90 s.
test("smoke: the scripted demo runs from overview to VIP checkout", async ({
  page,
  baseURL,
  channel,
}) => {
  test.setTimeout(budget(150000));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 860 });
  const host = "http://localhost:5173/embed-test.html";
  const html = await (await page.request.get("/embed-test.html")).text();
  await page.route(host, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: html
        .replace('src="/embed.js"', `src="${baseURL}/embed.js"`)
        .replace('data-venue="riverside"', 'data-venue="cape-point"'),
    }),
  );
  await page.context().grantPermissions(["local-network-access"], {
    origin: new URL(host).origin,
  });
  const venue = venueSchema.parse(
    await (await page.request.get("/venues/cape-point/venue.json")).json(),
  );
  const bowl = generateBowl(venue);
  const sold = soldSeats(bowl, venue.availability);

  const started = Date.now();
  const lap = (name: string) =>
    console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await page.goto(host);
  const events = page.locator("#events");
  await expect(events).toContainText("ready", { timeout: 30000 });
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("canvas[data-ready]")).toBeVisible();
  console.log(
    "renderer:",
    await frame
      .locator("canvas[data-ready]")
      .evaluate((c: HTMLCanvasElement) => {
        const gl = c.getContext("webgl2")!;
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
      }),
  );
  await expect(frame.getByRole("status")).toHaveCount(0, { timeout: 30000 });

  const box = (await page.locator("iframe").boundingBox())!;
  const camera = new PerspectiveCamera(43, box.width / box.height, 0.1, 1000);
  function aim(pose: typeof venue.cameras.overview) {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
  }
  function screen(position: [number, number, number]) {
    const p = new Vector3(...position).project(camera);
    return {
      x: box.x + ((p.x + 1) / 2) * box.width,
      y: box.y + ((1 - p.y) / 2) * box.height,
    };
  }
  aim(venue.cameras.overview);

  lap("loaded");
  // Hover a stand: the tag shows its label.
  const target = bowl.blocks.find((b) => {
    if (b.tierId !== "lower" || b.standId !== "east") return false;
    const seats = bowl.seats.slice(b.seatStart, b.seatStart + b.seatCount);
    return seats.some((s) => s.row === 1 && !sold.has(s.id));
  })!;
  const east = venue.stands.find((s) => s.id === "east")!;
  const point = screen(target.centroid);
  await page.mouse.move(point.x, point.y);
  await expect(frame.locator("output")).toContainText(east.label);

  const remaining = bowl.seats.filter(
    (s) => s.standId === east.id && !sold.has(s.id),
  ).length;
  await expect(frame.locator("output")).toBeVisible();
  await expect(frame.locator("output")).toContainText(
    remaining.toLocaleString(venue.locale) + " left",
  );

  lap("stand hover");
  // Fly into the block.
  await page.mouse.click(point.x, point.y);
  const panel = frame.locator(".block-panel");
  await expect(panel).toBeVisible();
  const blockId = (await panel.locator("strong").innerText()).replace(
    "Block ",
    "",
  );
  const block = bowl.blocks.find((b) => b.id === blockId)!;
  aim(block.flyIn);

  lap("block");
  // Hover a free front-row seat: tooltip with a live thumbnail.
  const seat = bowl.seats
    .slice(block.seatStart, block.seatStart + block.seatCount)
    .find((s) => s.row === 1 && !sold.has(s.id))!;
  const p = screen(seat.position);
  await expect(async () => {
    await page.mouse.move(p.x + 2, p.y);
    await page.mouse.move(p.x, p.y);
    await expect(frame.locator(".seat-tooltip canvas")).toHaveAttribute(
      "data-seat",
      seat.id,
      { timeout: 2000 },
    );
  }).toPass({ timeout: 20000 });

  const tip = (await frame.locator(".seat-tooltip").boundingBox())!;
  expect(
    Math.min(Math.abs(tip.x - p.x), Math.abs(tip.x + tip.width - p.x)),
  ).toBeLessThan(30);
  expect(p.y).toBeGreaterThanOrEqual(tip.y);
  expect(p.y).toBeLessThanOrEqual(tip.y + tip.height);
  lap("seat hover");
  // Pick it: seat view and the ticket card with its snapshot.
  const ticket = frame.getByRole("region", { name: "Ticket", exact: true });
  await expect(async () => {
    await page.mouse.click(p.x, p.y);
    await expect(ticket).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000 });
  const payload = seatPayload(venue, seat);
  await expect(events).toContainText("seatSelected " + JSON.stringify(payload));
  await expect(ticket.locator("img")).toHaveJSProperty("naturalWidth", 800);

  lap("ticket");
  // Upgrade: the card flips to VIP, the camera enters the skybox.
  await ticket.getByRole("button", { name: /Upgrade/ }).click();
  const vip = frame.getByRole("region", { name: "VIP ticket" });
  await expect(vip).toHaveClass(/docked/);
  lap("vip card");
  await vip.getByRole("button", { name: /Choose your VIP seat/ }).click();
  const chair = vip
    .getByRole("group", { name: "Choose your VIP seat" })
    .locator("button:enabled")
    .first();
  const index = Number(await chair.textContent()) - 1;
  // The upgrade opens the free box nearest the seat; it is the pressed one.
  const boxLabel = await vip
    .getByRole("group", { name: "Box" })
    .getByRole("button", { pressed: true })
    .textContent();
  const skybox = venue.vipBoxes.find((b) => b.label === boxLabel)!;
  await chair.click();
  lap("chair");
  await vip.getByRole("button", { name: "Confirm ticket" }).click();
  lap("confirm click");
  // A VIP checkout carries the VIP seat only, never the standard seat's fields.
  const { checkoutId, ...checkout } = await lastEvent(events, "checkout");
  expect(checkoutId).toEqual(expect.any(String));
  expect(checkout).toEqual({
    venueId: venue.id,
    eventId: venue.event.id,
    seatId: vipSeatId(skybox.id, index),
    vip: true,
    boxId: skybox.id,
    vipSeatIndex: index,
    price: venue.pricing.vip.pricePerSeat,
    currency: venue.currency,
  });
  lap("vip checkout");
  await expect(frame.getByText("VIP seat confirmed")).toBeVisible();
  // SwiftShader (the headless default and CI) renders each snapshot slowly;
  // the 90 s budget applies on a real GPU.
  if (channel === "chrome") expect(Date.now() - started).toBeLessThan(90000);
});
