import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { type ComponentProps, type ReactNode, Suspense } from "react";
import { ACESFilmicToneMapping } from "three";

import type { VenueConfig } from "../venue/schema";

type Props = {
  venue: VenueConfig;
  children: ReactNode;
  controls?: ComponentProps<typeof OrbitControls>;
};

/** Canvas, basic lights, a pitch and orbit controls. M3 replaces the look. */
export function Stage({ venue, children, controls }: Props) {
  const { position, target } = venue.cameras.overview;
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.5]}
      camera={{ position, fov: 43, near: 0.1, far: 1000 }}
      gl={{ toneMapping: ACESFilmicToneMapping }}
      aria-label="3D stadium"
      onCreated={({ gl }) => {
        gl.domElement.dataset.ready = "true";
      }}
    >
      <color attach="background" args={["#10151c"]} />
      <hemisphereLight args={["#c9d6ff", "#20242c", 1.2]} />
      <directionalLight position={[-60, 110, 55]} intensity={2.2} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <planeGeometry
          args={[venue.pitch.width + 12, venue.pitch.length + 12]}
        />
        <meshStandardMaterial color="#2f6b2a" roughness={0.95} />
      </mesh>
      <Suspense fallback={null}>{children}</Suspense>
      <OrbitControls
        makeDefault
        target={target}
        maxDistance={400}
        {...controls}
      />
    </Canvas>
  );
}
