import { expect, it } from "vitest";
import config from "../public/venues/riverside/venue.json";
import {
  allowedOrigins,
  checkoutPayload,
  seatPayload,
  vipSeatId,
} from "../src/embed/bridge";
import { generateBowl } from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

const venue = venueSchema.parse(config);
const seat = generateBowl(venue).seats[0];

it("hands off a standard checkout with the seat and its own ID", () => {
  expect(checkoutPayload(venue, seat, null, "c1")).toEqual({
    ...seatPayload(venue, seat),
    vip: false,
    checkoutId: "c1",
  });
});

it("describes a VIP checkout by the VIP seat alone", () => {
  const box = venue.vipBoxes[0];
  const payload = checkoutPayload(
    venue,
    seat,
    { boxId: box.id, index: 2 },
    "c2",
  );
  expect(payload).toEqual({
    venueId: venue.id,
    eventId: venue.event.id,
    seatId: vipSeatId(box.id, 2),
    vip: true,
    boxId: box.id,
    vipSeatIndex: 2,
    price: venue.pricing.vip.pricePerSeat,
    currency: venue.currency,
    checkoutId: "c2",
  });
  // Nothing a host could mistake for the standard seat.
  for (const key of ["block", "row", "seat", "stand", "gate", "tier"])
    expect(payload).not.toHaveProperty(key);
});

it("lets the site embed itself on top of the venue's allowlist", () => {
  const origins = allowedOrigins(
    { ...venue, embed: { allowedOrigins: ["https://tickets.example"] } },
    "https://stadium.example",
  );
  expect([...origins]).toEqual([
    "https://tickets.example",
    "https://stadium.example",
  ]);
});
