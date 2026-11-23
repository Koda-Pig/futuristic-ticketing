import { describe, expect, it } from "vitest";
import raw from "../public/venues/cape-point/venue.json";
import { soldSeats } from "../src/venue/availability";
import { generateBowl } from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

const venue = venueSchema.parse(raw);
const bowl = generateBowl(venue);
const sold = soldSeats(bowl, venue.availability);

describe("soldSeats", () => {
  it("is deterministic for a seed and changes with it", () => {
    expect([...soldSeats(bowl, venue.availability)]).toEqual([...sold]);
    const other = soldSeats(bowl, {
      ...venue.availability,
      seed: venue.availability.seed + 1,
    });
    expect([...other]).not.toEqual([...sold]);
  });

  it("does not mutate the config seed", () => {
    const availability = { ...venue.availability };
    soldSeats(bowl, availability);
    expect(availability).toEqual(venue.availability);
  });

  it("sells each block within the ratio and leaves at least 5 seats", () => {
    const [min, max] = venue.availability.soldRatio;
    for (const block of bowl.blocks) {
      const seats = bowl.seats.slice(
        block.seatStart,
        block.seatStart + block.seatCount,
      );
      const count = seats.filter((seat) => sold.has(seat.id)).length;
      expect(seats.length - count).toBeGreaterThanOrEqual(
        Math.min(5, seats.length),
      );
      expect(count).toBeLessThanOrEqual(Math.round(seats.length * max));
      expect(count).toBeGreaterThanOrEqual(
        Math.min(Math.round(seats.length * min), seats.length - 5),
      );
    }
  });

  it("only returns generated seat IDs", () => {
    for (const id of sold) expect(bowl.seatIndexById.has(id)).toBe(true);
  });
});
