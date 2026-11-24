import { useEffect, useMemo } from "react";
import {
  Bloom,
  EffectComposer,
  SMAA,
  Vignette,
} from "@react-three/postprocessing";
import {
  type Box3,
  CanvasTexture,
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
  SRGBColorSpace,
} from "three";
import type { VenueConfig } from "../venue/schema";
import { superellipse } from "../venue/superellipse";
import { kickoff } from "../venue/format";
import { boardTexture } from "./Stand";
import { CameraMotionBlur } from "./CameraMotionBlur";
import { useQuality } from "../quality";

function turf({ width, length, kind }: VenueConfig["pitch"]) {
  const canvas = document.createElement("canvas");
  canvas.width = (width + 8) * 12;
  canvas.height = (length + 8) * 12;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(12, 12);
  ctx.fillStyle = "#205138";
  ctx.fillRect(0, 0, width + 8, length + 8);
  ctx.translate(4, 4);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? "#398150" : "#327248";
    ctx.fillRect(0, (length * i) / 16, width, length / 16);
  }
  ctx.strokeStyle = "#dcecdc";
  ctx.lineWidth = 0.15;
  ctx.strokeRect(0, 0, width, length);
  ctx.beginPath();
  ctx.moveTo(0, length / 2);
  ctx.lineTo(width, length / 2);
  ctx.stroke();
  if (kind === "football") {
    ctx.beginPath();
    ctx.arc(width / 2, length / 2, 9.15, 0, Math.PI * 2);
    ctx.stroke();
    for (const end of [0, length])
      for (const [w, d] of [
        [40.32, 16.5],
        [18.32, 5.5],
      ])
        ctx.strokeRect((width - w) / 2, end, w, end ? -d : d);
  } else {
    for (const z of [22, length - 22]) ctx.strokeRect(0, z, width, 0);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

// A narrow illuminated plinth 4 m outside the last seating row, or outside
// `clear` (a shell model's footprint) when that reaches further.
function plinth(venue: VenueConfig, clear?: Box3) {
  const { halfWidth, halfLength } = venue.outline;
  const offset =
    Math.max(
      ...venue.tiers.map(
        (t) =>
          t.offset +
          t.rowDepth * Math.max(t.rows, ...Object.values(t.rowsByStand ?? {})),
      ),
      ...(clear
        ? [
            clear.max.x - halfWidth,
            -clear.min.x - halfWidth,
            clear.max.z - halfLength,
            -clear.min.z - halfLength,
          ]
        : []),
    ) + 4;
  const curve = superellipse(
    venue.outline.halfWidth,
    venue.outline.halfLength,
    venue.outline.exponent,
    256,
  );
  const vertices: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < curve.arc.length; i++) {
    for (const d of [offset, offset + 0.45]) {
      vertices.push(
        curve.points[2 * i] + d * curve.normals[2 * i],
        -0.42,
        curve.points[2 * i + 1] + d * curve.normals[2 * i + 1],
      );
    }
    const a = 2 * i,
      b = 2 * ((i + 1) % curve.arc.length);
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function Perimeter({
  venue,
  clear,
}: {
  venue: VenueConfig;
  clear?: Box3;
}) {
  const rim = useMemo(() => plinth(venue, clear), [venue, clear]);
  useEffect(() => () => rim.dispose(), [rim]);
  return (
    <mesh geometry={rim}>
      <meshBasicMaterial
        color={venue.branding.accent}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function floorGlow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(512, 512, 200, 512, 512, 510);
  glow.addColorStop(0, "#02050a");
  glow.addColorStop(0.36, "#112935");
  glow.addColorStop(1, "#03070d");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 1024);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

export function MatchNight({ venue }: { venue: VenueConfig }) {
  const pitch = useMemo(() => turf(venue.pitch), [venue.pitch]);
  const quality = useQuality((q) => q.level);
  const apron = useMemo(floorGlow, []);
  useEffect(() => () => apron.dispose(), [apron]);
  const screen = useMemo(() => {
    const { day, time } = kickoff(venue);
    return boardTexture(
      `${venue.event.home} vs ${venue.event.away} · ${day} ${time}`,
      venue.branding.accent,
    );
  }, [venue]);
  useEffect(
    () => () => {
      pitch.dispose();
      screen.dispose();
    },
    [pitch, screen],
  );
  const x = venue.outline.halfWidth + 39,
    z = venue.outline.halfLength + 39;
  return (
    <>
      <hemisphereLight args={["#cedffc", "#354452", 0.95]} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.6}>
        <planeGeometry args={[x * 3.7, z * 3.7]} />
        <meshBasicMaterial map={apron} toneMapped={false} />
      </mesh>
      {/* A shell venue draws its own, outside the model (stadium.tsx). */}
      {!venue.shell && <Perimeter venue={venue} />}
      <mesh rotation-x={-Math.PI / 2} position-y={0.04} receiveShadow>
        <planeGeometry args={[venue.pitch.width + 8, venue.pitch.length + 8]} />
        <meshStandardMaterial map={pitch} />
      </mesh>
      {[-1, 1].map((end) => (
        <group key={end}>
          <group position={[0, 0, (venue.pitch.length / 2) * end]}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 3.66, 1.22, 0]}>
                <boxGeometry args={[0.13, 2.44, 0.13]} />
                <meshBasicMaterial />
              </mesh>
            ))}
            <mesh position-y={2.44}>
              <boxGeometry args={[7.45, 0.13, 0.13]} />
              <meshBasicMaterial />
            </mesh>
          </group>
          <mesh
            position={[0, 24, end * (z - 8)]}
            rotation-y={end === 1 ? Math.PI : 0}
          >
            <planeGeometry args={[28, 3.5]} />
            <meshBasicMaterial map={screen} color={[2, 2, 2]} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <directionalLight
                position={[side * x, 55, end * z]}
                intensity={side === end ? (side === 1 ? 3.1 : 1.8) : 0.28}
                color={side === 1 && end === 1 ? "#fff2d8" : "#8abfff"}
                castShadow={side === 1 && end === 1}
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-left={-95}
                shadow-camera-right={95}
                shadow-camera-top={95}
                shadow-camera-bottom={-95}
                shadow-normalBias={0.025}
              />
              <mesh position={[side * x, 18, end * z]}>
                <cylinderGeometry args={[0.28, 0.5, 36, 8]} />
                <meshStandardMaterial color="#465260" />
              </mesh>
              <mesh position={[side * x, 36, end * z]}>
                <boxGeometry args={[7, 1.4, 1]} />
                <meshBasicMaterial color={[5, 5, 4]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* The lowest quality level drops post-processing (bloom, vignette, SMAA). */}
      {quality > 0 && (
        <EffectComposer multisampling={0}>
          {!matchMedia("(prefers-reduced-motion: reduce)").matches && (
            <CameraMotionBlur />
          )}
          <Bloom luminanceThreshold={1} intensity={0.5} mipmapBlur />
          <Vignette darkness={0.36} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}
