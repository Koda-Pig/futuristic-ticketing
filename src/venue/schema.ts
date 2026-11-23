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
          offset: z.number().nonnegative(),
          baseHeight: z.number(),
          rows: count,
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
    venue.stands.forEach((stand, index) => {
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
