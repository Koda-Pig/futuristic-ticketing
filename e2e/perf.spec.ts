import { expect, test } from "@playwright/test";

import { soldSeats } from "../src/venue/availability";
import { generateBowl } from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

// `GPU=1 pnpm e2e perf` samples the ?debug overlay in each phase at 1440p,
// DPR 1.5 (docs/PLAN.md §13). Numbers go in docs/PERF.md.
test.skip(({ channel }) => channel !== "chrome", "needs a real GPU (GPU=1)");
test.use({ viewport: { width: 1707, height: 960 }, deviceScaleFactor: 1.5 });

for (const venueId of ["cape-point", "riverside"])
  test(`perf: ${venueId}`, async ({ page }) => {
    test.setTimeout(120000);
    const venue = venueSchema.parse(
      await (await page.request.get(`/venues/${venueId}/venue.json`)).json(),
    );
    const bowl = generateBowl(venue);
    const sold = soldSeats(bowl, venue.availability);
    const seat = bowl.seats.find((s) => s.row === 1 && !sold.has(s.id))!;
    const box = venue.vipBoxes[0]?.id;
    const phases: Record<string, string> = {
      overview: "",
      block: `&block=${seat.blockId}`,
      seat: `&seat=${seat.id}`,
      ...(box && { vip: `&seat=${seat.id}&box=${box}` }),
    };
    const rows = [];
    for (const [phase, query] of Object.entries(phases)) {
      await page.goto(`/?debug&venue=${venueId}${query}`);
      await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30000 });
      // Let the fly-in, shadows and quality settle, then sample for 5 s.
      await page.waitForTimeout(4000);
      const samples: string[] = [];
      for (let i = 0; i < 10; i++) {
        samples.push((await page.locator(".debug span").textContent()) ?? "");
        await page.waitForTimeout(500);
      }
      const fps = samples.map((s) => Number(s.match(/^(\d+) fps/)?.[1]));
      const sorted = [...samples].sort(
        (a, b) =>
          Number(a.match(/(\d+)k tris/)?.[1]) -
          Number(b.match(/(\d+)k tris/)?.[1]),
      );
      rows.push(
        `${venueId} | ${phase} | min ${Math.min(...fps)} / median ${[...fps].sort((a, b) => a - b)[5]} fps | ${sorted[0]} | ${sorted.at(-1)}`,
      );
    }
    console.log(rows.join("\n"));
  });
