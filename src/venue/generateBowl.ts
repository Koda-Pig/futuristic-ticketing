import type { VenueConfig } from "./schema";
import {
  arcAtAngle,
  type Curve,
  normalAt,
  offsetCurve,
  pointAt,
  superellipse,
} from "./superellipse";

export type Vec3 = [number, number, number];

/** Seat pan height above the row's tread. */
export const SEAT_PAN_HEIGHT = 0.45;
const EYE_HEIGHT = 1.15;
const EYE_FORWARD = 0.15;
const FLY_IN_DISTANCE = 18;
// 10 m (plan §8) puts upper-tier cameras inside Cape Point's roof; 7 m clears every block.
const FLY_IN_HEIGHT = 7;
const HIT_MESH_SPACING = 2;

export type Seat = {
  id: string;
  index: number;
  blockId: string;
  tierId: string;
  standId: string;
  /** 1 is nearest the pitch. */
  row: number;
  /** Runs left to right when facing the pitch from the seat. */
  seat: number;
  /** Seat pan centre. */
  position: Vec3;
  /** Rotation about +Y that turns +Z to face the pitch. */
  yaw: number;
  eye: Vec3;
};

export type Block = {
  id: string;
  tierId: string;
  standId: string;
  rows: number;
  /** Seats are `seats.slice(seatStart, seatStart + seatCount)`. */
  seatStart: number;
  seatCount: number;
  centroid: Vec3;
  flyIn: { position: Vec3; target: Vec3 };
  /** Quad strip over the block's rows, for raycasting and outlines. */
  hitMesh: { positions: Float32Array; indices: Uint32Array };
};

export type Bowl = {
  seats: Seat[];
  seatIndexById: Map<string, number>;
  blocks: Block[];
  tiers: VenueConfig["tiers"];
  stands: VenueConfig["stands"];
  stats: {
    seats: number;
    blocks: number;
    seatsByTier: Record<string, number>;
    seatsByStand: Record<string, number>;
  };
};

export function rowsFor(tier: VenueConfig["tiers"][number], standId: string) {
  return tier.rowsByStand?.[standId] ?? tier.rows;
}

export function generateBowl(config: VenueConfig): Bowl {
  const aisle = config.blocks.aisleWidth;
  const curveAt = curveFactory(config);
  const seats: Seat[] = [];
  const blocks: Block[] = [];
  const seatsByTier: Record<string, number> = {};
  const seatsByStand: Record<string, number> = {};

  config.tiers.forEach((tier, tierIndex) => {
    const curve = (row: number) => curveAt(tier.offset + row * tier.rowDepth);
    let blockNumber = 0;

    for (const stand of config.stands) {
      const rows = rowsFor(tier, stand.id);
      const blockCount = config.blocks.perStandPerTier[stand.id];
      const step = (stand.to - stand.from) / blockCount;
      for (let b = 0; b < blockCount && rows > 0; b++) {
        const from = stand.from + b * step;
        const to = from + step;
        const id = `${tierIndex + 1}${String(blockNumber + 1).padStart(2, "0")}`;
        const seatStart = seats.length;

        for (let row = 0; row < rows; row++) {
          const c = curve(row);
          const [start, end] = arcRange(c, from, to);
          const usable = end - start - aisle;
          const count = Math.max(0, Math.floor(usable / tier.seatWidth));
          const margin = (end - start - count * tier.seatWidth) / 2;
          const floor = tier.baseHeight + row * tier.riser;
          let number = 0;
          for (let n = 0; n < count; n++) {
            // Seat 1 is at the high-angle end: the left, seen from the seat.
            const s = end - margin - (n + 0.5) * tier.seatWidth;
            const [x, z] = pointAt(c, s);
            if (inVoid(config.voids, x, z)) continue;
            number++;
            const [nx, nz] = normalAt(c, s);
            const y = floor + SEAT_PAN_HEIGHT;
            const index = seats.length;
            seats.push({
              id: `${id}-R${row + 1}-S${number}`,
              index,
              blockId: id,
              tierId: tier.id,
              standId: stand.id,
              row: row + 1,
              seat: number,
              position: [x, y, z],
              yaw: Math.atan2(-nx, -nz),
              eye: [x - nx * EYE_FORWARD, y + EYE_HEIGHT, z - nz * EYE_FORWARD],
            });
          }
        }

        const seatCount = seats.length - seatStart;
        if (seatCount === 0) continue;
        blockNumber++;
        seatsByTier[tier.id] = (seatsByTier[tier.id] ?? 0) + seatCount;
        seatsByStand[stand.id] = (seatsByStand[stand.id] ?? 0) + seatCount;

        const centroid: Vec3 = [0, 0, 0];
        for (let i = seatStart; i < seats.length; i++)
          for (let k = 0; k < 3; k++)
            centroid[k] += seats[i].position[k] / seatCount;
        const midRow = Math.floor((rows - 1) / 2);
        const mid = curve(midRow);
        const [s0, s1] = arcRange(mid, from, to);
        const [nx, nz] = normalAt(mid, (s0 + s1) / 2);
        const midHeight =
          tier.baseHeight + midRow * tier.riser + SEAT_PAN_HEIGHT;

        blocks.push({
          id,
          tierId: tier.id,
          standId: stand.id,
          rows,
          seatStart,
          seatCount,
          centroid,
          flyIn: {
            position: [
              centroid[0] - nx * FLY_IN_DISTANCE,
              midHeight + FLY_IN_HEIGHT,
              centroid[2] - nz * FLY_IN_DISTANCE,
            ],
            target: centroid,
          },
          hitMesh: hitMesh(curveAt, tier, rows, from, to, aisle),
        });
      }
    }
  });

  return {
    seats,
    seatIndexById: new Map(seats.map((seat) => [seat.id, seat.index])),
    blocks,
    tiers: config.tiers,
    stands: config.stands,
    stats: {
      seats: seats.length,
      blocks: blocks.length,
      seatsByTier,
      seatsByStand,
    },
  };
}

const inVoid = (voids: VenueConfig["voids"], x: number, z: number) =>
  voids.some(
    ([minX, minZ, maxX, maxZ]) =>
      x >= minX && x <= maxX && z >= minZ && z <= maxZ,
  );

/** Arc-length interval between two polar angles, with `end > start`. */
function arcRange(curve: Curve, from: number, to: number): [number, number] {
  const start = arcAtAngle(curve, from);
  let end = arcAtAngle(curve, to);
  while (end <= start) end += curve.length;
  return [start, end];
}

/** Row curves: the outline moved out along its normal by the row's offset. */
function curveFactory(config: VenueConfig) {
  const outline = superellipse(
    config.outline.halfWidth,
    config.outline.halfLength,
    config.outline.exponent,
  );
  const cache = new Map<number, Curve>();
  return (offset: number) => {
    let curve = cache.get(offset);
    if (!curve) {
      curve = offsetCurve(outline, offset);
      cache.set(offset, curve);
    }
    return curve;
  };
}

/**
 * A strip from the front edge of the first row to the back edge of the last,
 * sloping with the rake. Points on offset curves share their normals, so
 * both edges are stepped out from the middle row along it.
 */
function hitMesh(
  curveAt: (offset: number) => Curve,
  tier: VenueConfig["tiers"][number],
  rows: number,
  from: number,
  to: number,
  aisle: number,
) {
  const front = tier.offset - tier.rowDepth / 2;
  const back = tier.offset + (rows - 0.5) * tier.rowDepth;
  const frontY = tier.baseHeight + SEAT_PAN_HEIGHT;
  const backY = tier.baseHeight + (rows - 1) * tier.riser + SEAT_PAN_HEIGHT;
  // Trim the aisles on the middle row, then map back to the outline.
  const midOffset = (front + back) / 2;
  const mid = curveAt(midOffset);
  const [s0, s1] = arcRange(mid, from, to);
  const start = s0 + aisle / 2;
  const end = Math.max(start, s1 - aisle / 2);
  const steps = Math.max(1, Math.ceil((end - start) / HIT_MESH_SPACING));
  const positions = new Float32Array((steps + 1) * 6);
  const indices = new Uint32Array(steps * 6);
  for (let i = 0; i <= steps; i++) {
    const s = start + ((end - start) * i) / steps;
    const [mx, mz] = pointAt(mid, s);
    const [nx, nz] = normalAt(mid, s);
    positions.set(
      [
        mx + nx * (front - midOffset),
        frontY,
        mz + nz * (front - midOffset),
        mx + nx * (back - midOffset),
        backY,
        mz + nz * (back - midOffset),
      ],
      i * 6,
    );
    if (i < steps) {
      const a = i * 2;
      // Counter-clockwise seen from above and from the pitch.
      indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
    }
  }
  return { positions, indices };
}
