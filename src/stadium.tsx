import { createRoot } from "react-dom/client";
import { useMemo } from "react";
import { z } from "zod";

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
  return (
    <main aria-label={venue.name} style={{ height: "100dvh" }}>
      <Stage venue={venue}>
        {venue.shell && <Shell shell={venue.shell} />}
        <Bowl bowl={bowl} accent={venue.branding.accent} />
      </Stage>
    </main>
  );
}
