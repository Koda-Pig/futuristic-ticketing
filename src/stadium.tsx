import { Canvas } from "@react-three/fiber";
import { createRoot } from "react-dom/client";
import { z } from "zod";

import { type VenueConfig, venueSchema } from "./venue/schema";

export async function mount(root: HTMLElement) {
  const reactRoot = createRoot(root);
  let config: VenueConfig;
  try {
    config = await loadVenue("/venues/cape-point/venue.json");
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
  reactRoot.render(<Stadium name={config.name} />);
}

async function loadVenue(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Venue request returned HTTP ${response.status}`);
  return venueSchema.parse(await response.json());
}

function Stadium({ name }: { name: string }) {
  return (
    <main aria-label={name} style={{ height: "100dvh" }}>
      <Canvas
        frameloop="demand"
        aria-label="3D stadium"
        onCreated={({ gl }) => {
          gl.domElement.dataset.ready = "true";
        }}
      >
        <color attach="background" args={["#10151c"]} />
      </Canvas>
    </main>
  );
}
