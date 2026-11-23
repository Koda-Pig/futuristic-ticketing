import { describe, expect, it } from "vitest";
import raw from "../public/venues/cape-point/venue.json";
import {
  generateBowl,
  rowsFor,
  SEAT_PAN_HEIGHT,
} from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

const config = venueSchema.parse(raw);
const groupBy = <T>(items: T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
};
const bowl = generateBowl(config);

describe("generateBowl on Cape Point", () => {
  it("is deterministic", () => {
    const again = generateBowl(config);
    expect(again.stats).toEqual(bowl.stats);
    expect(again.seats.map((seat) => seat.id)).toEqual(
      bowl.seats.map((seat) => seat.id),
    );
  });

  it("fits the shell's terraces: about 30k seats", () => {
    expect(bowl.stats.seats).toBeGreaterThan(29_000);
    expect(bowl.stats.seats).toBeLessThan(32_000);
    expect(bowl.stats.seatsByStand["east"]).toBeGreaterThan(0);
  });

  it("gives every seat a unique id that the index resolves", () => {
    expect(bowl.seatIndexById.size).toBe(bowl.seats.length);
    for (const seat of bowl.seats.slice(0, 500))
      expect(bowl.seats[bowl.seatIndexById.get(seat.id)!]).toBe(seat);
  });

  it("keeps seats in a row at least a seat width apart", () => {
    const rows = groupBy(bowl.seats, (seat) => `${seat.blockId}-${seat.row}`);
    for (const row of rows.values())
      // Straight-line spacing is a little under the arc spacing on corners.
      for (let i = 1; i < row.length; i++) {
        const [ax, , az] = row[i - 1].position;
        const [bx, , bz] = row[i].position;
        expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(
          config.tiers[0].seatWidth - 0.01,
        );
      }
  });

  it("faces every seat towards the pitch", () => {
    // Cape Point's bowl is nearly rectangular, so seats near a corner face
    // straight across rather than at the centre spot (docs/DECISIONS.md).
    for (const seat of bowl.seats) {
      const forward = [Math.sin(seat.yaw), Math.cos(seat.yaw)];
      const [x, , z] = seat.position;
      const cos = (forward[0] * -x + forward[1] * -z) / Math.hypot(x, z);
      expect(Math.acos(cos)).toBeLessThan((60 * Math.PI) / 180);
    }
  });

  it("raises the eye with each row and puts it above the pan", () => {
    const rows = groupBy(bowl.seats, (seat) => seat.blockId);
    for (const seats of rows.values()) {
      const eyeByRow = new Map(seats.map((seat) => [seat.row, seat.eye[1]]));
      const heights = [...eyeByRow]
        .sort((a, b) => a[0] - b[0])
        .map(([, y]) => y);
      for (let i = 1; i < heights.length; i++)
        expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
    const seat = bowl.seats[0];
    expect(seat.eye[1] - seat.position[1]).toBeCloseTo(1.15);
    expect(seat.position[1]).toBeCloseTo(
      config.tiers[0].baseHeight + SEAT_PAN_HEIGHT,
    );
  });

  it("numbers blocks 1xx, 2xx and 3xx by tier, in order", () => {
    config.tiers.forEach((tier, index) => {
      const ids = bowl.blocks
        .filter((block) => block.tierId === tier.id)
        .map((block) => block.id);
      expect(ids).toEqual(
        ids.map((_, n) => `${index + 1}${String(n + 1).padStart(2, "0")}`),
      );
    });
    expect(bowl.blocks.every((block) => block.seatCount > 0)).toBe(true);
  });

  it("follows per-stand row counts", () => {
    const maxRow = (tierId: string, standId: string) =>
      Math.max(
        0,
        ...bowl.seats
          .filter((s) => s.tierId === tierId && s.standId === standId)
          .map((s) => s.row),
      );
    for (const tier of config.tiers)
      for (const stand of config.stands)
        expect(maxRow(tier.id, stand.id)).toBe(rowsFor(tier, stand.id));
  });

  it("numbers seats left to right as seen from the seat", () => {
    const [first, second] = bowl.seats; // block 101, row 1
    expect(first.seat).toBe(1);
    // Facing the pitch, the viewer's right is forward × up.
    const right = [-Math.cos(first.yaw), Math.sin(first.yaw)];
    const step = [
      second.position[0] - first.position[0],
      second.position[2] - first.position[2],
    ];
    expect(right[0] * step[0] + right[1] * step[1]).toBeGreaterThan(0);
  });

  it("places the fly-in camera in front of and above each block", () => {
    for (const block of bowl.blocks) {
      const [cx, cy, cz] = block.centroid;
      const [px, py, pz] = block.flyIn.position;
      expect(Math.hypot(px, pz)).toBeLessThan(Math.hypot(cx, cz));
      expect(py).toBeGreaterThan(cy + 5);
      expect(block.hitMesh.indices.length % 6).toBe(0);
      expect(Math.max(...block.hitMesh.indices)).toBeLessThan(
        block.hitMesh.positions.length / 3,
      );
    }
  });
});

describe("generateBowl options", () => {
  it("leaves voids and zero-row stands empty", () => {
    const east = structuredClone(config);
    east.voids = [[-200, -200, 200, 0]];
    const half = generateBowl(east);
    expect(half.seats.every((seat) => seat.position[2] > 0)).toBe(true);
    expect(
      bowl.seats.some((s) => s.tierId === "middle" && s.standId === "east"),
    ).toBe(false);
  });

  it("handles a stand that crosses 0°", () => {
    const east = bowl.seats.filter(
      (seat) => seat.standId === "east" && seat.tierId === "lower",
    );
    expect(Math.min(...east.map((s) => s.position[2]))).toBeLessThan(-10);
    expect(Math.max(...east.map((s) => s.position[2]))).toBeGreaterThan(10);
  });
});
