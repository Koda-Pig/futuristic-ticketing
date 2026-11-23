import type { Bowl } from "./generateBowl";
import type { VenueConfig } from "./schema";

export function mulberry32(seed: number) {
  return function random() {
    let n = (seed += 0x6d2b79f5);
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function soldSeats(
  bowl: Bowl,
  { seed, soldRatio }: VenueConfig["availability"],
) {
  const random = mulberry32(seed);
  const sold = new Set<string>();
  for (const block of bowl.blocks) {
    const band = soldRatio[1] - soldRatio[0];
    const sideline = Math.abs(block.centroid[0]) > Math.abs(block.centroid[2]);
    const middle = bowl.tiers.length > 2 && block.tierId === bowl.tiers[1].id;
    const ratio =
      soldRatio[0] +
      band * (random() * 0.7 + Number(sideline) * 0.2 + Number(middle) * 0.1);
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
      const rowChance = chance * (1.15 - (0.3 * seat.row) / block.rows);
      // Within a row, repeat the previous status 60% of the time.
      const probability =
        i > 0 && seats[i - 1].row === seat.row
          ? 0.4 * rowChance + (previousRow === seat.row ? 0.6 : 0)
          : rowChance;
      if (remaining > 0 && (chance >= 1 || random() < probability)) {
        sold.add(seat.id);
        remaining--;
        previousRow = seat.row;
      } else previousRow = 0;
    }
  }
  return sold;
}
