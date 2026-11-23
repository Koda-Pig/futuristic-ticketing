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
function frame(referrer: string) {
  const parent = { postMessage: vi.fn() };
  let listener: (event: Partial<MessageEvent>) => void = () => {};
  vi.stubGlobal("window", {
    parent,
    addEventListener: (_: string, fn: typeof listener) => (listener = fn),
  });
  vi.stubGlobal("location", {
    search: "?embed=1",
    origin: "https://stadium.example",
  });
  vi.stubGlobal("document", { referrer });
  return {
    postMessage: parent.postMessage,
    receive: (origin: string, data: unknown) =>
      listener({ source: parent as unknown as Window, origin, data }),
  };
}

it("only sends to an exact allowlisted parent origin in embed mode", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(config)));
  const venue = await new MockDataSource().getVenue("riverside");
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // An origin outside the allowlist hears nothing but the origin-less hello.
  let host = frame("http://localhost:5174/host");
  embedBridge(venue)?.send("ready", {});
  expect(host.postMessage.mock.calls).toEqual([[{ type: "hello" }, "*"]]);
  host.receive("http://localhost:5174", { type: "hello" });
  expect(host.postMessage).toHaveBeenCalledTimes(1);

  host = frame("http://localhost:5173/host");
  embedBridge(venue)?.send("ready", {});
  expect(host.postMessage).toHaveBeenCalledWith(
    { type: "ready", payload: {} },
    "http://localhost:5173",
  );
});

it("learns the host's origin from embed.js when the referrer is hidden", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(config)));
  const venue = await new MockDataSource().getVenue("riverside");
  const host = frame("");
  const bridge = embedBridge(venue)!;
  bridge.send("ready", { id: 1 });
  expect(host.postMessage.mock.calls).toEqual([[{ type: "hello" }, "*"]]);
  host.receive("http://localhost:5173", { type: "hello" });
  expect(host.postMessage).toHaveBeenLastCalledWith(
    { type: "ready", payload: { id: 1 } },
    "http://localhost:5173",
  );
  const reset = vi.fn();
  bridge.onReset(reset);
  host.receive("http://localhost:5173", { type: "reset" });
  expect(reset).toHaveBeenCalledOnce();
});
