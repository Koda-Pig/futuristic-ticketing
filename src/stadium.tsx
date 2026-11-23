import { createRoot } from "react-dom/client";
import { useMemo, useRef, useState, Suspense } from "react";
import { z } from "zod";

import { Stand } from "./scene/Stand";
import { kickoff, money } from "./venue/format";
import { MatchNight } from "./scene/MatchNight";
import "./overview.css";
import { Bowl } from "./scene/Bowl";
import { Shell } from "./scene/Shell";
import { Stage } from "./scene/Stage";
import { generateBowl } from "./venue/generateBowl";
import { type VenueConfig, venueSchema } from "./venue/schema";

export const VENUE_URL = "/venues/cape-point/venue.json";

export async function loadVenue(url = VENUE_URL) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Venue request returned HTTP ${response.status}`);
  return venueSchema.parse(await response.json());
}

/** Loads the venue, then renders `render(venue)` or a developer error. */
export async function mountVenue(
  root: HTMLElement,
  render: (venue: VenueConfig) => React.ReactNode,
) {
  const reactRoot = createRoot(root);
  let venue: VenueConfig;
  try {
    venue = await loadVenue();
  } catch (error) {
    const message =
      error instanceof z.ZodError ? z.prettifyError(error) : String(error);
    reactRoot.render(
      <main role="alert">
        <h1>Could not load venue</h1>
        <pre>{message}</pre>
      </main>,
    );
    return;
  }
  reactRoot.render(render(venue));
}

export const mount = (root: HTMLElement) =>
  mountVenue(root, (venue) => <Stadium venue={venue} />);

function Stadium({ venue }: { venue: VenueConfig }) {
  const bowl = useMemo(() => generateBowl(venue), [venue]);
  const groups = useMemo(
    () =>
      venue.stands
        .map((stand) => ({
          stand,
          blocks: bowl.blocks.filter((b) => b.standId === stand.id),
        }))
        .filter((group) => group.blocks.length),
    [bowl, venue],
  );
  const [hover, setHover] = useState<string | null>(null);
  const tag = useRef<HTMLOutputElement>(null);
  const active = groups.find((group) => group.stand.id === hover);
  const { day, time } = kickoff(venue);
  return (
    <main
      className="overview"
      aria-label={venue.name}
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => {
        if (tag.current) {
          tag.current.style.left =
            Math.min(e.clientX + 16, innerWidth - 190) + "px";
          tag.current.style.top =
            Math.min(e.clientY + 16, innerHeight - 80) + "px";
        }
      }}
    >
      <Stage venue={venue} overview>
        <MatchNight venue={venue} />
        {venue.shell && (
          <Suspense fallback={null}>
            <Shell shell={venue.shell} />
          </Suspense>
        )}
        <Bowl bowl={bowl} accent={venue.branding.accent} />
        {groups.map(({ stand, blocks }) => (
          <Stand
            key={stand.id}
            venue={venue}
            blocks={blocks}
            active={stand.id === hover}
            onHover={setHover}
          />
        ))}
      </Stage>
      <header
        className="matchbar"
        style={{ borderColor: venue.branding.accent }}
      >
        <strong>{venue.name}</strong>
        <h1>
          {venue.event.home} <small>vs</small> {venue.event.away}
        </h1>
        <time dateTime={venue.event.startsAt}>
          {day} · {time}
        </time>
      </header>
      <output ref={tag} hidden={!active} className="stand-tag">
        {active && (
          <>
            <small>From</small>
            <strong>{active.stand.label}</strong>
            <span style={{ color: venue.branding.accent }}>
              {money(
                venue,
                Math.min(
                  ...active.blocks.map(
                    (b) => venue.pricing.tiers[b.tierId][b.standId],
                  ),
                ),
              )}
            </span>
          </>
        )}
      </output>
      <footer>Drag to orbit · Scroll to zoom</footer>
      {venue.shell?.credit && <aside>{venue.shell.credit}</aside>}
    </main>
  );
}
