import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Bloom,
  EffectComposer,
  SMAA,
  Vignette,
} from "@react-three/postprocessing";
import {
  CanvasTexture,
  Object3D,
  SRGBColorSpace,
  type InstancedMesh,
} from "three";
import type { VenueConfig } from "../venue/schema";
import { kickoff } from "../venue/format";
import { boardTexture } from "./Stand";
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

function precinct() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(512, 512, 200, 512, 512, 510);
  glow.addColorStop(0, "#46545b");
  glow.addColorStop(1, "#17212b");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = "#39454e";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.ellipse(512, 512, 360, 390, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (const x of [80, 862]) {
    ctx.fillStyle = "#242c34";
    ctx.fillRect(x, 390, 82, 244);
    ctx.strokeStyle = "#82908e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = 398; y < 630; y += 12) {
      ctx.moveTo(x + 4, y);
      ctx.lineTo(x + 28, y);
      ctx.moveTo(x + 54, y);
      ctx.lineTo(x + 78, y);
    }
    ctx.stroke();
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

export function MatchNight({ venue }: { venue: VenueConfig }) {
  const pitch = useMemo(() => turf(venue.pitch), [venue.pitch]);
  const quality = useQuality((q) => q.level);
  const apron = useMemo(precinct, []);
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
  const trees = useRef<InstancedMesh>(null);
  const x = venue.outline.halfWidth + 39,
    z = venue.outline.halfLength + 39;
  useLayoutEffect(() => {
    const tree = new Object3D();
    for (let i = 0; i < 160; i++) {
      const angle = i * 2.39996,
        ring = 1.4 + (i % 11) * 0.025;
      tree.position.set(
        Math.cos(angle) * x * ring,
        2,
        Math.sin(angle) * z * ring,
      );
      tree.scale.setScalar(0.8 + (i % 5) * 0.09);
      tree.updateMatrix();
      trees.current!.setMatrixAt(i, tree.matrix);
    }
    trees.current!.instanceMatrix.needsUpdate = true;
  }, [x, z]);
  return (
    <>
      <hemisphereLight args={["#94aada", "#1c2430", 0.65]} />
      {/* Keep the ground well below the apron; a 2 cm gap z-fought at overview distance. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.6} receiveShadow>
        <circleGeometry args={[600, 96]} />
        <meshStandardMaterial color="#17212b" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.48}>
        <planeGeometry args={[x * 3.7, z * 3.7]} />
        <meshStandardMaterial map={apron} />
      </mesh>
      <instancedMesh ref={trees} args={[undefined, undefined, 160]}>
        <coneGeometry args={[2.2, 6, 7]} />
        <meshStandardMaterial color="#204638" />
      </instancedMesh>
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
                intensity={1.05}
                color="#fff3db"
                castShadow={side === 1 && end === 1}
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-left={-95}
                shadow-camera-right={95}
                shadow-camera-top={95}
                shadow-camera-bottom={-95}
                shadow-normalBias={0.08}
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
          <Bloom luminanceThreshold={1} intensity={0.5} mipmapBlur />
          <Vignette darkness={0.36} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}
