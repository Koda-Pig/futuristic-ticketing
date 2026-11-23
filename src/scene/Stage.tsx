import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  type ComponentRef,
  type RefObject,
  useRef,
  useState,
} from "react";
import { ACESFilmicToneMapping, MathUtils, Vector3 } from "three";

import { DPR, useQuality } from "../quality";

import type { VenueConfig } from "../venue/schema";

import { SeatCamera } from "./SeatCamera";
import type { Seat } from "../venue/generateBowl";

type Props = {
  venue: VenueConfig;
  children: ReactNode;
  seat?: Pick<Seat, "eye"> | null;
  entry?: Seat["eye"];
  duration?: number;
  overview?: boolean;
  blockPose?: VenueConfig["cameras"]["overview"];
  controls?: ComponentProps<typeof OrbitControls>;
  /** `?debug`: receives FPS, draw calls, triangles and the quality level. */
  stats?: RefObject<HTMLElement | null>;
  /** Called after the first frame is on screen. */
  onReady?: () => void;
};

export function Stage({
  venue,
  children,
  controls,
  blockPose,
  seat,
  entry,
  duration,
  stats,
  onReady,
  overview = false,
}: Props) {
  const { position, target } = venue.cameras.overview;
  const level = useQuality((q) => q.level);
  return (
    <Canvas
      frameloop={overview ? "always" : "demand"}
      shadows
      dpr={[1, overview ? DPR[level] : 1.5]}
      // near=1: the camera never gets closer than 8 units, and 0.1 cost 10x depth precision.
      camera={{ position, fov: 43, near: 1, far: 1000 }}
      gl={{ toneMapping: ACESFilmicToneMapping }}
      aria-label="3D stadium"
      onCreated={({ gl }) => {
        gl.domElement.dataset.ready = "true";
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
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
      {overview && <AdaptiveQuality />}
      {overview && <CachedShadows />}
      {stats && <DebugProbe out={stats} />}
      {seat && <SeatCamera seat={seat} entry={entry} duration={duration} />}
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

/** Steps quality down when the frame rate sags, and back up when it recovers. */
function AdaptiveQuality() {
  const set = useQuality((q) => q.set);
  return (
    <PerformanceMonitor
      // Below 50 fps (on a 60 Hz display) for most of ~2.5 s steps down; above 58 steps up.
      bounds={(refresh) => (refresh > 90 ? [80, 110] : [50, 58])}
      flipflops={4}
      onDecline={() => {
        const { level } = useQuality.getState();
        if (level > 0) set((level - 1) as 0 | 1);
      }}
      onIncline={() => {
        const { level } = useQuality.getState();
        if (level < 2) set((level + 1) as 1 | 2);
      }}
      // After too many flips, settle on the middle level.
      onFallback={() => set(1)}
    />
  );
}

/**
 * Only the camera moves, so the floodlight shadow map (shell + bowl, ~800k
 * triangles) doesn't need redrawing every frame. Refreshing a few times a second
 * still picks up the shell once it streams in and any newly mounted seats.
 */
function CachedShadows() {
  const gl = useThree((state) => state.gl);
  const frame = useRef(0);
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    if (++frame.current % 20 === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/** Totals every render in the frame (post-processing passes and thumbnails too). */
function DebugProbe({ out }: { out: RefObject<HTMLElement | null> }) {
  const gl = useThree((state) => state.gl);
  const sample = useRef({ frames: 0, time: 0 });
  useLayoutEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, delta) => {
    const s = sample.current;
    s.frames++;
    s.time += delta;
    const { calls, triangles } = gl.info.render;
    if (s.time >= 0.5 && out.current) {
      out.current.textContent =
        `${Math.round(s.frames / s.time)} fps · ${calls} draws · ` +
        `${(triangles / 1000).toFixed(0)}k tris · quality ${useQuality.getState().level} · ` +
        `DPR ${gl.getPixelRatio()}`;
      s.frames = s.time = 0;
    }
    gl.info.reset();
  });
  return null;
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
    duration: number;
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
    const from = control.object.position.clone();
    flight.current = {
      position: from,
      target: control.target.clone(),
      elapsed: 0,
      // Longer hops take longer, but a short one never feels sluggish.
      duration: MathUtils.clamp(
        from.distanceTo(new Vector3(...pose.position)) / 140,
        1.1,
        1.9,
      ),
    };
    control.enabled = false;
  }, [pose, seated]);
  useFrame((_, delta) => {
    const move = flight.current,
      control = orbit.current;
    if (!move || !control) return;
    move.elapsed += delta;
    const t = still ? 1 : Math.min(1, move.elapsed / move.duration);
    // Cubic ease-in-out: a gentler launch and landing than smoothstep.
    const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
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
