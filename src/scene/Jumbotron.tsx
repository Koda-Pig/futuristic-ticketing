import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { kickoff } from "../venue/format";
import type { VenueConfig } from "../venue/schema";

export function Jumbotrons({ venue }: { venue: VenueConfig }) {
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    const { day, time } = kickoff(venue);
    ctx.fillStyle = "#101b28";
    ctx.fillRect(0, 0, 1024, 384);
    ctx.textAlign = "center";
    ctx.font = "bold 100px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(venue.event.home.toUpperCase(), 512, 110, 950);
    ctx.fillText(venue.event.away.toUpperCase(), 512, 263, 950);
    ctx.fillStyle = venue.branding.accent;
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("VS", 512, 171);
    ctx.fillRect(60, 154, 384, 3);
    ctx.fillRect(580, 154, 384, 3);
    ctx.fillRect(0, 302, 1024, 82);
    ctx.fillStyle = venue.branding.accentOn;
    ctx.fillText(day.toUpperCase() + "  ·  " + time, 512, 356, 950);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [venue]);
  useEffect(() => () => screen.dispose(), [screen]);

  const distance = venue.endScreen?.distance ?? venue.outline.halfLength + 18;
  const height = venue.endScreen?.height ?? 24;
  return [-1, 1].map((end) => (
    <group
      key={end}
      position={[0, 0, end * distance]}
      rotation-y={end === 1 ? Math.PI : 0}
    >
      {!venue.endScreen &&
        [-9, 9].map((x) => (
          <mesh key={x} position={[x, 12, -0.5]}>
            <boxGeometry args={[0.55, 24, 0.55]} />
            <meshStandardMaterial color="#485767" />
          </mesh>
        ))}
      <mesh position-y={height}>
        <boxGeometry args={[25, 9.7, 1.1]} />
        <meshStandardMaterial color="#242c35" />
      </mesh>
      <mesh position={[0, height, 0.56]}>
        <planeGeometry args={[24, 9]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
    </group>
  ));
}
