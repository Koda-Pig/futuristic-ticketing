import { expect, test } from "@playwright/test";

import { lastEvent, nextEvent } from "./events";
import { budget } from "./timeouts";
import { PerspectiveCamera, Vector3 } from "three";

import { vipSeatId } from "../src/embed/bridge";
import { soldSeats } from "../src/venue/availability";
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
  test.setTimeout(budget(90000));
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

for (const tier of ["lower", "upper"])
  test(`picks a ${tier} seat, previews its view and rejects taken seats`, async ({
    page,
  }) => {
    test.setTimeout(budget(tier === "lower" ? 180000 : 120000));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 960, height: 640 });
    await page.goto("/");
    await expect(page.locator("canvas[data-ready]")).toBeVisible();
    // The loader covers the canvas until the first frame (and shows the shell's progress).
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30000 });
    const venue = venueSchema.parse(
      await (await page.request.get("/venues/cape-point/venue.json")).json(),
    );
    const bowl = generateBowl(venue);
    const camera = new PerspectiveCamera(43, 1.5, 0.1, 1000);
    function aim(pose: typeof venue.cameras.overview) {
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
    }
    function screen(position: [number, number, number]) {
      const p = new Vector3(...position).project(camera);
      return { x: (p.x + 1) * 480, y: (1 - p.y) * 320 };
    }
    aim(venue.cameras.overview);
    const sold = soldSeats(bowl, venue.availability);
    const candidate = bowl.blocks.find((b) => {
      if (b.tierId !== tier || b.standId !== "east") return false;
      const seats = bowl.seats.slice(b.seatStart, b.seatStart + b.seatCount);
      return (
        seats.some(
          (s) => s.row === (tier === "lower" ? 1 : b.rows) && !sold.has(s.id),
        ) && seats.some((s) => sold.has(s.id))
      );
    })!;
    const point = screen(candidate.centroid);
    await page.mouse.click(point.x, point.y);
    const panel = page.locator(".block-panel");
    await expect(panel).toBeVisible();
    const blockId = (await panel.locator("strong").innerText()).replace(
      "Block ",
      "",
    );
    const block = bowl.blocks.find((b) => b.id === blockId)!;
    expect(block.tierId).toBe(tier);
    aim(block.flyIn);

    const seats = bowl.seats.slice(
      block.seatStart,
      block.seatStart + block.seatCount,
    );
    for (const taken of [true, false]) {
      const row = tier === "lower" ? 1 : block.rows;
      const seat = seats.find((s) =>
        taken
          ? sold.has(s.id) && s.row >= block.rows / 2
          : s.row === row && !sold.has(s.id),
      )!;
      const p = screen(seat.position);
      await expect(async () => {
        await page.mouse.move(p.x + 2, p.y);
        await page.mouse.move(p.x, p.y);
        await expect(page.locator(".seat-tooltip canvas")).toHaveAttribute(
          "data-seat",
          seat.id,
          { timeout: 2000 },
        );
      }).toPass({ timeout: 20000 });
      await page.mouse.click(p.x, p.y);
      if (taken)
        await expect(page.locator(".seat-tooltip")).toContainText("Taken");
      else {
        const ticket = page.getByRole("region", {
          name: "Ticket",
          exact: true,
        });
        await expect(ticket.locator("img")).toHaveJSProperty(
          "naturalWidth",
          800,
        );
        await expect(ticket.locator("dd").nth(0)).toHaveText(String(seat.row));
        await expect(ticket.locator("dd").nth(1)).toHaveText(String(seat.seat));
        await page.screenshot({
          path: test.info().outputPath("seat-view.png"),
        });
        await test.info().attach("seat-view", {
          path: test.info().outputPath("seat-view.png"),
          contentType: "image/png",
        });
        if (tier === "lower") {
          const originalPrice = await ticket
            .locator(".ticket-price strong")
            .innerText();
          await ticket.getByRole("button", { name: /Upgrade/ }).click();
          const vip = page.getByRole("region", { name: "VIP ticket" });
          await expect(vip.getByRole("img")).toHaveJSProperty(
            "naturalWidth",
            800,
          );
          await page.screenshot({
            path: test.info().outputPath("vip-exterior.png"),
          });
          await expect(page.locator(".block-panel")).toContainText("VIP");
          await vip
            .getByRole("button", { name: /Choose your VIP seat/ })
            .click();
          const chairs = vip.getByRole("group", {
            name: "Choose your VIP seat",
          });
          await expect(
            chairs.locator("button:disabled").first(),
          ).toBeDisabled();
          await expect(vip.getByRole("img")).toHaveJSProperty(
            "naturalWidth",
            800,
          );
          await page.screenshot({
            path: test.info().outputPath("vip-picker.png"),
          });
          // Cape Point has four boxes; the card can switch between them.
          await expect(
            vip.getByRole("group", { name: "Box" }).getByRole("button"),
          ).toHaveCount(4);
          await chairs.locator("button:enabled").first().click();
          await expect(
            vip.getByRole("heading", { name: "Another view" }),
          ).toBeVisible();
          await expect(vip.getByRole("img")).toHaveJSProperty(
            "naturalWidth",
            800,
          );
          await page.screenshot({
            path: test.info().outputPath("vip-review.png"),
          });
          await vip
            .getByRole("button", { name: "Choose another seat" })
            .click();
          await chairs.locator("button:enabled").last().click();
          await vip.getByRole("button", { name: "Confirm ticket" }).click();
          await expect(page.getByText("VIP seat confirmed")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(vip.getByText("Confirm ticket")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(chairs).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(chairs).toBeHidden();
          await expect(
            vip.getByRole("button", { name: /Choose your VIP seat/ }),
          ).toBeVisible();
          await vip.getByText("Back to standard seat").click();
          await expect(ticket.locator(".ticket-price strong")).toHaveText(
            originalPrice,
          );
          await expect(ticket.locator("dd").nth(1)).toHaveText(
            String(seat.seat),
          );
        }
        await ticket.getByText("Choose another seat").click();
        await expect(ticket).toBeHidden();
        await expect(async () => {
          await page.mouse.click(p.x, p.y);
          await expect(ticket).toBeVisible({ timeout: 1000 });
        }).toPass();
        await ticket.getByText("Keep my seat").click();
        await expect(page.getByText("Seat confirmed")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(ticket).toBeVisible();
      }
    }
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Back" }).click();
    await expect(panel).toBeHidden();
  });

test("Riverside embed restores a seat, hands off both checkout prices and resets", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(budget(120000));
  const host = "http://localhost:5173/embed-test.html";
  const html = await (await page.request.get("/embed-test.html")).text();
  await page.route(host, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: html.replace('src="/embed.js"', `src="${baseURL}/embed.js"`),
    }),
  );
  const venue = venueSchema.parse(
    await (await page.request.get("/venues/riverside/venue.json")).json(),
  );
  const bowl = generateBowl(venue);
  const sold = soldSeats(bowl, venue.availability);
  const seat = bowl.seats.find((s) => !sold.has(s.id))!;
  await page.context().grantPermissions(["local-network-access"], {
    origin: new URL(host).origin,
  });
  await page.goto(host);
  const events = page.locator("#events");
  await expect(events).toContainText("ready", { timeout: 30000 });
  const frame = page.frames().find((f) => f.parentFrame())!;
  const url = new URL(frame.url());
  const renderErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /shader/i.test(message.text()))
      renderErrors.push(message.text());
  });
  url.searchParams.set("debug", "");
  url.searchParams.set("seat", seat.id);
  await frame.goto(url.href, { referer: host });
  const payload = {
    venueId: venue.id,
    eventId: venue.event.id,
    seatId: seat.id,
    block: seat.blockId,
    row: seat.row,
    seat: seat.seat,
    tier: seat.tierId,
    stand: seat.standId,
    gate: "L1",
    price: venue.pricing.tiers[seat.tierId][seat.standId],
    currency: "GBP",
  };
  await expect(events).toContainText("seatSelected " + JSON.stringify(payload));
  await frame.getByRole("button", { name: "Keep my seat" }).click();
  const standard = await lastEvent(events, "checkout");
  expect(standard).toEqual({
    ...payload,
    vip: false,
    checkoutId: expect.any(String),
  });
  await expect(frame.getByText("Continuing to checkout…")).toBeVisible();
  // Changing your mind after a checkout sends a new one with a new ID.
  await frame.getByRole("button", { name: "Back", exact: true }).click();
  await frame.getByRole("button", { name: /Upgrade/ }).click();
  await frame.getByRole("button", { name: /Choose your VIP seat/ }).click();
  const chair = frame
    .getByRole("group", { name: "Choose your VIP seat" })
    .locator("button:enabled")
    .first();
  const index = Number(await chair.textContent()) - 1;
  await chair.click();
  await frame.getByRole("button", { name: "Confirm ticket" }).click();
  const box = venue.vipBoxes[0].id;
  const vip = await nextEvent(events, "checkout", 1);
  expect(vip).toEqual({
    venueId: venue.id,
    eventId: venue.event.id,
    seatId: vipSeatId(box, index),
    vip: true,
    boxId: box,
    vipSeatIndex: index,
    price: venue.pricing.vip.pricePerSeat,
    currency: "GBP",
    checkoutId: expect.any(String),
  });
  expect(vip.checkoutId).not.toBe(standard.checkoutId);
  await expect(frame.locator(".debug")).toContainText(
    `camera height ${venue.cameras.overview.position[1].toFixed(1)} m`,
    { timeout: 30000 },
  );
  expect(renderErrors).toEqual([]);
  await page.getByRole("button", { name: "Reset selection" }).click();
  await expect(frame.locator(".block-panel")).toHaveCount(0);
  // The URL follows the reset in an effect, after the panel has gone.
  await expect
    .poll(() => new URL(frame.url()).searchParams.has("seat"))
    .toBe(false);
});
