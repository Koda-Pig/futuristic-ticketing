import { expect, it } from "vitest";
import config from "../public/venues/cape-point/venue.json";
import { venueSchema } from "../src/venue/schema";

it("loads Cape Point with a price and block count for every stand", () => {
  expect(venueSchema.parse(config).stands).toHaveLength(8);
});

it("identifies the missing stand price by field", () => {
  const broken = structuredClone(config);
  Reflect.deleteProperty(broken.pricing.tiers.lower, "east");
  const result = venueSchema.safeParse(broken);
  expect(result.error?.issues[0].path).toEqual([
    "pricing",
    "tiers",
    "lower",
    "east",
  ]);
});

it("rejects unknown fields so typos are not silently dropped", () => {
  const broken = { ...structuredClone(config), shel: config.shell };
  const result = venueSchema.safeParse(broken);
  expect(result.error?.issues[0].code).toBe("unrecognized_keys");
});

it("rejects duplicate stand ids", () => {
  const broken = structuredClone(config);
  broken.stands[1].id = broken.stands[0].id;
  const result = venueSchema.safeParse(broken);
  expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
    "stands",
    1,
    "id",
  ]);
});
