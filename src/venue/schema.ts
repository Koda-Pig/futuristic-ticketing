import { z } from "zod";

const name = z.string().trim().min(1);
const positive = z.number().positive();
const count = z.int().positive();
const position = z.tuple([z.number(), z.number(), z.number()]);
const sport = z.enum(["football", "rugby"]);
const price = z.number().nonnegative();
const ratio = z.number().min(0).max(1);
const color = z.string().regex(/^#[\da-f]{6}$/i);

export const venueSchema = z
  .strictObject({
    id: name,
    name,
    branding: z.strictObject({
      accent: color,
      accentOn: color,
      logoUrl: name.optional(),
    }),
    locale: name,
    currency: z.string().regex(/^[A-Z]{3}$/),
    event: z.strictObject({
      id: name,
      home: name,
      away: name,
      startsAt: z.iso.datetime({ offset: true }),
      sport,
    }),
    pitch: z.strictObject({ length: positive, width: positive, kind: sport }),
    // Superellipse |x/halfWidth|^n + |z/halfLength|^n = 1 through the centre
    // of the front row's tread. The pitch runs north-south, along Z. Rows are
    // offsets of this curve along its normal.
    outline: z.strictObject({
      halfLength: positive,
      halfWidth: positive,
      exponent: z.number().gt(1),
    }),
    tiers: z
      .array(
        z.strictObject({
          id: name,
          label: name,
          // Distance from the outline to this tier's front row, in metres.
          offset: z.number().nonnegative(),
          // Floor (tread) height of the tier's front row; seat pans sit above it.
          baseHeight: z.number(),
          rows: count,
          // Stands with a different row count, e.g. ends that rake further back.
          // 0 leaves the stand empty in this tier.
          rowsByStand: z.record(name, z.int().nonnegative()).optional(),
          rowDepth: positive,
          riser: positive,
          seatWidth: positive,
          gateLetter: name,
        }),
      )
      .min(1),
    stands: z
      .array(
        z.strictObject({
          id: name,
          label: name,
          // Polar angle in degrees: 0° = +X (east), 90° = +Z (south).
          from: z.number(),
          to: z.number(),
        }),
      )
      .min(1),
    blocks: z.strictObject({
      perStandPerTier: z.record(name, count),
      aisleWidth: positive,
      numbering: z.literal("stadium"),
    }),
    // Plan-view rectangles [minX, minZ, maxX, maxZ] that get no seats:
    // vomitories, stair landings and other gaps in the shell's terraces.
    voids: z
      .array(
        z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .refine(
            ([minX, minZ, maxX, maxZ]) => minX < maxX && minZ < maxZ,
            "Expected [minX, minZ, maxX, maxZ]",
          ),
      )
      .default([]),
    pricing: z.strictObject({
      tiers: z.record(name, z.record(name, price)),
      vip: z.strictObject({ pricePerSeat: price, label: name }),
    }),
    vipBoxes: z.array(
      z.strictObject({
        id: name,
        label: name,
        level: count,
        position,
        rotationY: z.number(),
        size: z.tuple([positive, positive, positive]),
        seats: count,
      }),
    ),
    shell: z
      .object({
        gltfUrl: name,
        position: position.optional(),
        rotationY: z.number().optional(),
        scale: positive.optional(),
      })
      .optional(),
    cameras: z.strictObject({
      overview: z.strictObject({ position, target: position }),
    }),
    availability: z.strictObject({
      seed: z.int(),
      soldRatio: z
        .tuple([ratio, ratio])
        .refine(
          ([low, high]) => low <= high,
          "Expected minimum before maximum",
        ),
    }),
    embed: z.strictObject({ allowedOrigins: z.array(z.url()) }),
  })
  .superRefine((venue, ctx) => {
    const unique = (ids: string[], path: string) => {
      ids.forEach((id, index) => {
        if (ids.indexOf(id) !== index)
          ctx.addIssue({
            code: "custom",
            path: [path, index, "id"],
            message: `Duplicate id "${id}"`,
          });
      });
    };
    unique(
      venue.tiers.map((tier) => tier.id),
      "tiers",
    );
    unique(
      venue.stands.map((stand) => stand.id),
      "stands",
    );
    unique(
      venue.vipBoxes.map((box) => box.id),
      "vipBoxes",
    );
    const standIds = new Set(venue.stands.map((stand) => stand.id));
    venue.tiers.forEach((tier, index) => {
      for (const standId of Object.keys(tier.rowsByStand ?? {}))
        if (!standIds.has(standId))
          ctx.addIssue({
            code: "custom",
            path: ["tiers", index, "rowsByStand", standId],
            message: "Unknown stand",
          });
    });
    const blocksPerTier = venue.stands.reduce(
      (sum, stand) => sum + (venue.blocks.perStandPerTier[stand.id] ?? 0),
      0,
    );
    if (blocksPerTier > 99)
      ctx.addIssue({
        code: "custom",
        path: ["blocks", "perStandPerTier"],
        message: `Block numbers have two digits per tier; ${blocksPerTier} blocks do not fit`,
      });
    venue.stands.forEach((stand, index) => {
      if (stand.to - stand.from > 360)
        ctx.addIssue({
          code: "custom",
          path: ["stands", index, "to"],
          message: "A stand spans at most 360°",
        });
      if (stand.to <= stand.from)
        ctx.addIssue({
          code: "custom",
          path: ["stands", index, "to"],
          message: "Expected to be greater than from",
        });
    });
    for (const stand of venue.stands) {
      if (!Object.hasOwn(venue.blocks.perStandPerTier, stand.id))
        ctx.addIssue({
          code: "custom",
          path: ["blocks", "perStandPerTier", stand.id],
          message: "Missing block count",
        });
      for (const tier of venue.tiers) {
        if (venue.pricing.tiers[tier.id]?.[stand.id] === undefined)
          ctx.addIssue({
            code: "custom",
            path: ["pricing", "tiers", tier.id, stand.id],
            message: "Missing seat price",
          });
      }
    }
  });

export type VenueConfig = z.infer<typeof venueSchema>;
