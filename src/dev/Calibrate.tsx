// ?calibrate: fit the generated bowl to the venue's shell (docs/PLAN.md M2).
import { useThree } from "@react-three/fiber";
import { button, folder, Leva, useControls } from "leva";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { Bowl } from "../scene/Bowl";
import { Shell } from "../scene/Shell";
import { Stage } from "../scene/Stage";
import { generateBowl, rowsFor } from "../venue/generateBowl";
import { type VenueConfig, venueSchema } from "../venue/schema";

type Pose = {
  position: [number, number, number];
  target: [number, number, number];
};
type Values = Record<string, number | boolean>;

/** Fixed views for judging the fit; Sideline matches the shell inspector's. */
export const CALIBRATION_VIEWS = (
  venue: VenueConfig,
): Record<string, Pose> => ({
  Overview: venue.cameras.overview,
  Sideline: { position: [-42, 5, 8], target: [38, 10, -5] },
  "End, from the pitch": { position: [0, 6, -20], target: [0, 10, 80] },
  Corner: { position: [10, 30, 20], target: [55, 8, 75] },
});

const TIER_FIELDS = {
  offset: { min: 0, max: 60, step: 0.05 },
  baseHeight: { min: -2, max: 40, step: 0.05 },
  rows: { min: 1, max: 60, step: 1 },
  rowDepth: { min: 0.5, max: 2, step: 0.01 },
  riser: { min: 0.1, max: 1, step: 0.01 },
  seatWidth: { min: 0.4, max: 0.8, step: 0.01 },
} as const;

function controlSchema(
  venue: VenueConfig,
  actions: Record<string, () => void>,
) {
  const tiers = Object.fromEntries(
    venue.tiers.map((tier) => [
      tier.label,
      folder(
        {
          ...Object.fromEntries(
            Object.entries(TIER_FIELDS).map(([field, range]) => [
              `${tier.id}_${field}`,
              {
                value: tier[field as keyof typeof TIER_FIELDS],
                label: field,
                ...range,
              },
            ]),
          ),
          [`${tier.label} rows by stand`]: folder(
            Object.fromEntries(
              venue.stands.map((stand) => [
                `${tier.id}_rows_${stand.id}`,
                {
                  value: rowsFor(tier, stand.id),
                  min: 0,
                  max: 60,
                  step: 1,
                  label: stand.id,
                },
              ]),
            ),
            { collapsed: true },
          ),
        },
        { collapsed: true },
      ),
    ]),
  );
  const stands = Object.fromEntries(
    venue.stands.flatMap((stand) => [
      [
        `${stand.id}_from`,
        {
          value: stand.from,
          min: -180,
          max: 360,
          step: 0.5,
          label: `${stand.id} from`,
        },
      ],
      [
        `${stand.id}_to`,
        {
          value: stand.to,
          min: -180,
          max: 360,
          step: 0.5,
          label: `${stand.id} to`,
        },
      ],
      [
        `${stand.id}_blocks`,
        {
          value: venue.blocks.perStandPerTier[stand.id],
          min: 1,
          max: 12,
          step: 1,
          label: `${stand.id} blocks`,
        },
      ],
    ]),
  );
  return {
    Views: folder(
      Object.fromEntries(
        Object.entries(actions).map(([label, run]) => [label, button(run)]),
      ),
    ),
    Shell: folder({
      shellVisible: { value: true, label: "visible" },
      shellOpacity: {
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        label: "opacity",
      },
    }),
    Outline: folder({
      halfWidth: {
        value: venue.outline.halfWidth,
        min: 20,
        max: 120,
        step: 0.05,
      },
      halfLength: {
        value: venue.outline.halfLength,
        min: 20,
        max: 120,
        step: 0.05,
      },
      exponent: { value: venue.outline.exponent, min: 1.5, max: 64, step: 0.5 },
    }),
    ...tiers,
    Stands: folder(
      {
        aisleWidth: {
          value: venue.blocks.aisleWidth,
          min: 0.2,
          max: 4,
          step: 0.05,
        },
        ...stands,
      },
      { collapsed: true },
    ),
  };
}

/** The initial venue with the panel's values applied. */
export function applyValues(venue: VenueConfig, values: Values): VenueConfig {
  const number = (key: string) => values[key] as number;
  return {
    ...venue,
    outline: {
      ...venue.outline,
      halfWidth: number("halfWidth"),
      halfLength: number("halfLength"),
      exponent: number("exponent"),
    },
    tiers: venue.tiers.map((tier) => {
      const rows = number(`${tier.id}_rows`);
      const rowsByStand: Record<string, number> = {};
      for (const stand of venue.stands) {
        const value = number(`${tier.id}_rows_${stand.id}`);
        // Untouched stands follow the tier's row count.
        if (tier.rowsByStand?.[stand.id] !== undefined || value !== tier.rows)
          rowsByStand[stand.id] = value;
      }
      const { rowsByStand: _previous, ...rest } = tier;
      void _previous;
      return {
        ...rest,
        offset: number(`${tier.id}_offset`),
        baseHeight: number(`${tier.id}_baseHeight`),
        rows,
        ...(Object.keys(rowsByStand).length ? { rowsByStand } : {}),
        rowDepth: number(`${tier.id}_rowDepth`),
        riser: number(`${tier.id}_riser`),
        seatWidth: number(`${tier.id}_seatWidth`),
      };
    }),
    stands: venue.stands.map((stand) => ({
      ...stand,
      from: number(`${stand.id}_from`),
      to: number(`${stand.id}_to`),
    })),
    blocks: {
      ...venue.blocks,
      aisleWidth: number("aisleWidth"),
      perStandPerTier: Object.fromEntries(
        venue.stands.map((stand) => [stand.id, number(`${stand.id}_blocks`)]),
      ),
    },
  };
}

function download(venue: VenueConfig) {
  const json = JSON.stringify(venue, null, 2) + "\n";
  void navigator.clipboard?.writeText(json).catch(() => {});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  link.download = "venue.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function CameraPose({ pose }: { pose: Pose | null }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as {
    target: { set(x: number, y: number, z: number): void };
    update(): void;
  } | null;
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!pose || !controls) return;
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    controls.update();
    invalidate();
  }, [pose, camera, controls, invalidate]);
  return null;
}

export function Calibrate({ initial }: { initial: VenueConfig }) {
  const views = CALIBRATION_VIEWS(initial);
  const [pose, setPose] = useState<Pose | null>(null);
  const latest = useRef<VenueConfig | null>(null);
  const actions = {
    ...Object.fromEntries(
      Object.entries(views).map(([label, view]) => [
        label,
        () => setPose({ ...view }),
      ]),
    ),
    "Export JSON": () => latest.current && download(latest.current),
  };
  const [values] = useControls(() => controlSchema(initial, actions));
  const venue = useMemo(
    () => applyValues(initial, values as unknown as Values),
    [initial, values],
  );
  const parsed = useMemo(() => venueSchema.safeParse(venue), [venue]);
  latest.current = parsed.success ? parsed.data : null;
  const bowl = useMemo(
    () => (parsed.success ? generateBowl(parsed.data) : null),
    [parsed],
  );

  return (
    <main
      aria-label={`${initial.name} calibration`}
      style={{ height: "100dvh" }}
    >
      <Leva titleBar={{ title: "Calibrate" }} />
      <Stage venue={initial} controls={{ maxDistance: 600 }}>
        <CameraPose pose={pose} />
        {initial.shell && values.shellVisible && (
          <Shell
            shell={initial.shell}
            opacity={values.shellOpacity as number}
            roofFade={false}
          />
        )}
        {bowl && <Bowl bowl={bowl} accent={initial.branding.accent} />}
      </Stage>
      <output
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          padding: "8px 12px",
          font: "12px/1.5 ui-monospace, monospace",
          color: "#e8edf5",
          background: "rgb(16 21 28 / 80%)",
          borderRadius: 8,
          whiteSpace: "pre",
        }}
      >
        {bowl
          ? [
              `${bowl.stats.seats.toLocaleString()} seats · ${bowl.stats.blocks} blocks`,
              ...Object.entries(bowl.stats.seatsByTier).map(
                ([tier, seats]) => `${tier}: ${seats.toLocaleString()}`,
              ),
            ].join("\n")
          : z.prettifyError(parsed.error!)}
      </output>
    </main>
  );
}
