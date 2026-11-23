import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  type ComponentRef,
  useRef,
  useState,
} from "react";
import { ACESFilmicToneMapping, Vector3 } from "three";

import type { VenueConfig } from "../venue/schema";

import { SeatCamera } from "./SeatCamera";
import type { Seat } from "../venue/generateBowl";

type Props = {
  venue: VenueConfig;
  children: ReactNode;
  seat?: Seat | null;
  overview?: boolean;
  blockPose?: VenueConfig["cameras"]["overview"];
  controls?: ComponentProps<typeof OrbitControls>;
};

export function Stage({
  venue,
  children,
  controls,
  blockPose,
  seat,
  overview = false,
}: Props) {
  const { position, target } = venue.cameras.overview;
  return (
    <Canvas
      frameloop={overview ? "always" : "demand"}
      shadows
      dpr={[1, 1.5]}
      // near=1: the camera never gets closer than 8 units, and 0.1 cost 10x depth precision.
      camera={{ position, fov: 43, near: 1, far: 1000 }}
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
      {seat && <SeatCamera seat={seat} />}
      {overview ? (
        <CameraDirector
          overview={venue.cameras.overview}
          blockPose={blockPose}
          seated={!!seat}
        />
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
  seated,
  overview,
  blockPose,
}: {
  seated: boolean;
  overview: VenueConfig["cameras"]["overview"];
  blockPose?: VenueConfig["cameras"]["overview"];
}) {
  const orbit = useRef<ComponentRef<typeof OrbitControls>>(null);
  const flight = useRef<{
    position: Vector3;
    target: Vector3;
    elapsed: number;
  } | null>(null);
  // Auto-rotate only while idle, and never for viewers who ask for less motion.
  const [still] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const pose = blockPose ?? overview;
  const previous = useRef<typeof overview | null>(overview);
  useLayoutEffect(() => {
    const control = orbit.current;
    if (!control) return;
    if (seated) {
      previous.current = null;
      flight.current = null;
      control.enabled = false;
      return;
    }
    if (previous.current === pose) return;
    previous.current = pose;
    flight.current = {
      position: control.object.position.clone(),
      target: control.target.clone(),
      elapsed: 0,
    };
    control.enabled = false;
  }, [pose, seated]);
  useFrame((_, delta) => {
    const move = flight.current,
      control = orbit.current;
    if (!move || !control) return;
    move.elapsed += delta;
    const t = still ? 1 : Math.min(1, move.elapsed / 1.4);
    const ease = t * t * (3 - 2 * t);
    control.minDistance = 0;
    control.maxDistance = Infinity;
    control.minAzimuthAngle = -Infinity;
    control.maxAzimuthAngle = Infinity;
    control.object.position.lerpVectors(
      move.position,
      new Vector3(...pose.position),
      ease,
    );
    control.target.lerpVectors(move.target, new Vector3(...pose.target), ease);
    control.update();
    if (t === 1) {
      const angle = control.getAzimuthalAngle();
      control.minAzimuthAngle = blockPose
        ? angle - (Math.PI * 25) / 180
        : -Infinity;
      control.maxAzimuthAngle = blockPose
        ? angle + (Math.PI * 25) / 180
        : Infinity;
      control.minDistance = blockPose ? 8 : 150;
      control.maxDistance = blockPose ? 45 : 400;
      control.enabled = true;
      flight.current = null;
    }
  });
  const [idle, setIdle] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <OrbitControls
      makeDefault
      ref={orbit}
      target={overview.target}
      enablePan={false}
      minDistance={150}
      maxDistance={400}
      minPolarAngle={Math.PI / 12}
      maxPolarAngle={(Math.PI * 70) / 180}
      autoRotate={idle && !still && !blockPose}
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
