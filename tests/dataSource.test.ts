import { afterEach, expect, it, vi } from "vitest";
import config from "../public/venues/riverside/venue.json";
import { MockDataSource } from "../src/venue/dataSource";
import { generateBowl } from "../src/venue/generateBowl";
import { embedBridge } from "../src/embed/bridge";

afterEach(() => vi.unstubAllGlobals());
it("loads Riverside and supplies repeatable standard and VIP availability", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(config))),
  );
  const source = new MockDataSource();
  const venue = await source.getVenue("riverside");
  expect(fetch).toHaveBeenCalledWith("/venues/riverside/venue.json");
  const bowl = generateBowl(venue);
  const map = await source.getAvailability(venue.event.id, bowl);
  expect(map.size).toBe(bowl.seats.length);
  expect(await source.getAvailability(venue.event.id, bowl)).toEqual(map);
  const ratio = [...map.values()].filter((s) => s === "sold").length / map.size;
  expect(ratio).toBeGreaterThanOrEqual(venue.availability.soldRatio[0]);
  expect(ratio).toBeLessThanOrEqual(venue.availability.soldRatio[1]);
  const seats = await source.getVipAvailability(
    venue.event.id,
    venue.vipBoxes[0].id,
  );
  expect(seats.filter((s) => !s).length).toBeGreaterThanOrEqual(2);
  expect(seats.filter((s) => !s).length).toBeLessThanOrEqual(4);
  expect(
    await source.getVipAvailability(venue.event.id, venue.vipBoxes[0].id),
  ).toEqual(seats);
});
it("only sends to an exact allowlisted parent origin in embed mode", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(config)));
  const venue = await new MockDataSource().getVenue("riverside");
  const postMessage = vi.fn();
  vi.stubGlobal("window", { parent: { postMessage } });
  vi.stubGlobal("location", { search: "?embed=1" });
  vi.stubGlobal("document", { referrer: "http://localhost:5174/host" });
  embedBridge(venue)?.send("ready", {});
  expect(postMessage).not.toHaveBeenCalled();
  vi.stubGlobal("document", { referrer: "http://localhost:5173/host" });
  embedBridge(venue)?.send("ready", {});
  expect(postMessage).toHaveBeenCalledWith(
    { type: "ready", payload: {} },
    "http://localhost:5173",
  );
});
