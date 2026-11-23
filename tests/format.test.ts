import { expect, it } from "vitest";
import config from "../public/venues/cape-point/venue.json";
import { kickoff, money } from "../src/venue/format";
import { venueSchema } from "../src/venue/schema";

const venue = venueSchema.parse(config);

it("keeps kick-off on the venue's calendar day and clock", () => {
  const late = {
    ...venue,
    event: { ...venue.event, startsAt: "2027-03-14T23:30:00+02:00" },
  };
  expect(kickoff(late).time).toBe("23:30");
  expect(kickoff(late).day).toMatch(/14/);
});

it("formats whole-rand prices", () => {
  expect(money(venue, 1250)).toMatch(/^R\s?1[\s,]?250$/);
});
