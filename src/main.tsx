import { createRoot } from "react-dom/client";
import { z } from "zod";
import type { VenueConfig } from "./venue/schema";
import { MockDataSource } from "./venue/dataSource";
import { MatchHeader } from "./MatchHeader";
import { ErrorBoundary, ErrorCard, NoWebGL, hasWebGL2 } from "./notices";
import "./overview.css";
import { isInspectorMode } from "./inspectorMode";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

// The inspector reads the licensed source model in assets/ and calibration is
// an authoring tool, so both exist in the dev server only and are left out of
// production builds.
if (import.meta.env.DEV && isInspectorMode(location.search)) {
  const { default: markup } = await import("./inspector.html?raw");
  root.innerHTML = markup;
  document.title = "Cape Point Stadium · Model inspector";
  await import("./inspector.js");
} else {
  const app = createRoot(root);
  const query = new URLSearchParams(location.search);
  const calibrate = import.meta.env.DEV && query.has("calibrate");
  if (!calibrate && !hasWebGL2()) {
    app.render(<NoWebGL />);
  } else {
    const source = new MockDataSource();
    let failed = false;
    try {
      const [venue, render] = await Promise.all([
        source.getVenue(query.get("venue") ?? "cape-point").then((venue) => {
          if (failed) return venue;
          if (query.has("event") && query.get("event") !== venue.event.id)
            throw new Error("Unknown event");
          document.title = calibrate ? venue.name + " · Calibrate" : venue.name;
          app.render(
            <main className="overview">
              <MatchHeader venue={venue} />
              <div className="boot" role="status">
                <span className="spinner" aria-hidden="true" />
                Loading seat picker…
              </div>
            </main>,
          );
          return venue;
        }),
        import.meta.env.DEV && calibrate
          ? import("./dev/Calibrate").then(
              ({ Calibrate }) =>
                (venue: VenueConfig) => <Calibrate initial={venue} />,
            )
          : import("./stadium").then(({ renderStadium }) => renderStadium),
      ]);
      app.render(<ErrorBoundary>{await render(venue, source)}</ErrorBoundary>);
    } catch (error) {
      failed = true;
      app.render(
        <ErrorCard
          title="We couldn't load this venue"
          detail={
            error instanceof z.ZodError ? z.prettifyError(error) : String(error)
          }
        />,
      );
    }
  }
}
