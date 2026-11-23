import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { ACESFilmicToneMapping } from "three";

import type { VenueConfig } from "../venue/schema";

type Props = {
  venue: VenueConfig;
  children: ReactNode;
  overview?: boolean;
  controls?: ComponentProps<typeof OrbitControls>;
};

export function Stage({ venue, children, controls, overview = false }: Props) {
  const { position, target } = venue.cameras.overview;
  return (
    <Canvas
      frameloop={overview ? "always" : "demand"}
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
      {!overview && (
        <>
          <hemisphereLight args={["#c9d6ff", "#20242c", 1.2]} />
          <directionalLight position={[-60, 110, 55]} intensity={2.2} />
          <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
            <planeGeometry
              args={[venue.pitch.width + 12, venue.pitch.length + 12]}
            />
            <meshStandardMaterial color="#2f6b2a" roughness={0.95} />
          </mesh>
        </>
      )}
      <Suspense fallback={null}>{children}</Suspense>
      {overview ? (
        <CameraDirector target={target} />
      ) : (
        <OrbitControls
          makeDefault
          target={target}
          maxDistance={400}
          {...controls}
        />
      )}
    </Canvas>
  );
}

function CameraDirector({
  target,
}: {
  target: VenueConfig["cameras"]["overview"]["target"];
}) {
  // Auto-rotate only while idle, and never for viewers who ask for less motion.
  const [still] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [idle, setIdle] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <OrbitControls
      makeDefault
      target={target}
      enablePan={false}
      minDistance={150}
      maxDistance={400}
      minPolarAngle={Math.PI / 12}
      maxPolarAngle={(Math.PI * 70) / 180}
      autoRotate={idle && !still}
      autoRotateSpeed={0.35}
      onStart={() => {
        clearTimeout(timer.current);
        setIdle(false);
      }}
      onEnd={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setIdle(true), 8000);
      }}
    />
  );
}
