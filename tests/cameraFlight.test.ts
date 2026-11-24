import { Vector3 } from "three";
import { expect, it } from "vitest";
import raw from "../public/venues/cape-point/venue.json";
import {
  aerialDive,
  aerialPullback,
  boxApproach,
} from "../src/scene/cameraFlight";
import { generateBowl } from "../src/venue/generateBowl";
import { venueSchema } from "../src/venue/schema";

const venue = venueSchema.parse(raw);
const bowl = generateBowl(venue);
const aerial = new Vector3(...venue.cameras.overview.position);

it("clears the lower-tier rail and approaches the box along its front axis", () => {
  const start = new Vector3(...bowl.seats[0].eye);
  const box = venue.vipBoxes[0];
  const front = new Vector3(
    Math.sin(box.rotationY),
    0,
    Math.cos(box.rotationY),
  );
  const eye = new Vector3(...box.position);
  eye.y += 2;
  const entry = eye.clone().addScaledVector(front, box.size[2] / 2 + 5);
  const path = boxApproach(start, entry, eye);
  expect(path.getPoint(0)).toEqual(start);
  const lift = path.getPoint(0.005).sub(start);
  expect(lift.y).toBeGreaterThan(0);
  expect(Math.hypot(lift.x, lift.z)).toBeCloseTo(0);
  expect(path.getTangent(1).dot(front)).toBeCloseTo(-1);
  expect(path.getPoint(1).distanceTo(entry)).toBeLessThan(0.001);
});

it("passes above the selected block and ends the pullback at the overview", () => {
  const block = bowl.blocks[0];
  const landing = new Vector3(...block.flyIn.position);
  const dive = aerialDive(aerial, landing);
  expect(
    dive
      .getPoints(64)
      .some(
        (p) =>
          p.y > landing.y + 50 &&
          Math.hypot(p.x - landing.x, p.z - landing.z) < 1,
      ),
  ).toBe(true);
  expect(dive.getPoint(1).distanceTo(landing)).toBeLessThan(0.001);
  const start = new Vector3(...venue.vipBoxes[0].position);
  const pullback = aerialPullback(start, aerial);
  expect(pullback.getPoint(0)).toEqual(start);
  expect(pullback.getPoint(1).distanceTo(aerial)).toBeLessThan(0.001);
});
