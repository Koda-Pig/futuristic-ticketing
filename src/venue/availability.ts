import type { Bowl } from "./generateBowl";
import type { VenueConfig } from "./schema";

export function soldSeats(
  bowl: Bowl,
  { seed, soldRatio }: VenueConfig["availability"],
) {
  function random() {
    let n = (seed += 0x6d2b79f5);
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
  const sold = new Set<string>();
  for (const block of bowl.blocks) {
    const ratio = soldRatio[0] + random() * (soldRatio[1] - soldRatio[0]);
    const seats = bowl.seats.slice(
      block.seatStart,
      block.seatStart + block.seatCount,
    );
    let remaining = Math.min(
      Math.round(seats.length * ratio),
      seats.length - 5,
    );
    let previousRow = 0;
    for (const [i, seat] of seats.entries()) {
      const chance = remaining / (seats.length - i);
      if (
        remaining > 0 &&
        (chance >= 1 ||
          random() < chance + (previousRow === seat.row ? 0.08 : -0.08))
      ) {
        sold.add(seat.id);
        remaining--;
        previousRow = seat.row;
      } else previousRow = 0;
    }
  }
  return sold;
}
