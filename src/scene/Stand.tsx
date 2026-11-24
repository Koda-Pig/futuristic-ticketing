import { type Dispatch, type SetStateAction, useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  CanvasTexture,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { SEAT_PAN_HEIGHT, type Block } from "../venue/generateBowl";
import { money } from "../venue/format";
import type { VenueConfig } from "../venue/schema";

export function boardTexture(label: string, accent: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#082530";
  ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 88, 1024, 8);
  ctx.font = "bold 54px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label.toUpperCase(), 512, 66, 980);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
}

export function Stand({
  blocks,
  venue,
  active,
  onHover,
  onEnter,
}: {
  blocks: Block[];
  venue: VenueConfig;
  active: boolean;
  onEnter?: (block: Block) => void;
  onHover: Dispatch<SetStateAction<string | null>>;
}) {
  const surfaces = useMemo(() => {
    const points: number[] = [],
      indices: number[] = [],
      edges: number[] = [];
    const faceOwners: Block[] = [];
    const ribbons = venue.tiers.flatMap((tier) => {
      const band: number[] = [],
        uv: number[] = [],
        faces: number[] = [];
      for (const block of blocks.filter((b) => b.tierId === tier.id)) {
        const { positions: p, indices: i } = block.hitMesh;
        for (let face = 0; face < i.length; face += 3) faceOwners.push(block);
        const start = points.length / 3;
        points.push(...p);
        indices.push(...i.map((n) => n + start));
        const base = band.length / 3;
        let distance = 0;
        for (let j = 0; j < p.length; j += 6) {
          if (j > 0)
            distance += Math.hypot(p[j] - p[j - 6], p[j + 2] - p[j - 4]);
          // The fascia faces the pitch, below the first tread.
          const dx = p[j] - p[j + 3];
          const dz = p[j + 2] - p[j + 5];
          const inset = 0.45 / Math.hypot(dx, dz);
          const x = p[j] + dx * inset;
          const z = p[j + 2] + dz * inset;
          const top = p[j + 1] - SEAT_PAN_HEIGHT;
          band.push(x, top, z, x, top - 0.85, z);
          uv.push(distance, 1, distance, 0);
          if (j === 0 || j + 6 === p.length) edges.push(...p.slice(j, j + 6));
          if (j + 6 < p.length) {
            const a = base + j / 3;
            faces.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            for (const side of [0, 3])
              edges.push(
                ...p.slice(j + side, j + side + 3),
                ...p.slice(j + side + 6, j + side + 9),
              );
          }
        }
        // End each panel on a complete price, including short corner blocks.
        const repeats = Math.max(1, Math.round(distance / 14));
        for (let u = base * 2; u < uv.length; u += 2)
          uv[u] *= repeats / (distance || 1);
      }
      if (!band.length) return [];
      const geometry = surface(band, faces);
      geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
      const price = venue.pricing.tiers[tier.id][blocks[0].standId];
      return [
        {
          geometry,
          texture: boardTexture(
            tier.label + " · FROM " + money(venue, price),
            tier.seatColor ?? venue.branding.accent,
          ),
        },
      ];
    });
    return {
      faceOwners,
      hit: surface(points, indices),
      edges: surface(edges),
      ribbons,
    };
  }, [blocks, venue]);
  useEffect(
    () => () => {
      surfaces.hit.dispose();
      surfaces.edges.dispose();
      for (const r of surfaces.ribbons) {
        r.geometry.dispose();
        r.texture.dispose();
      }
    },
    [surfaces],
  );
  return (
    <>
      {venue.shell &&
        blocks
          .filter((block) => block.tierId === "premium-suites")
          .map((block) => (
            <mesh key={block.id} position-y={-SEAT_PAN_HEIGHT} receiveShadow>
              <bufferGeometry
                onUpdate={(geometry) => geometry.computeVertexNormals()}
              >
                <bufferAttribute
                  attach="attributes-position"
                  args={[block.hitMesh.positions, 3]}
                />
                <bufferAttribute
                  attach="index"
                  args={[block.hitMesh.indices, 1]}
                />
              </bufferGeometry>
              <meshStandardMaterial color="#45414a" side={DoubleSide} />
            </mesh>
          ))}
      <mesh
        geometry={surfaces.hit}
        position-y={0.35}
        visible={!!onEnter}
        {...(!onEnter && { raycast: () => {} })}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta < 5 && e.faceIndex != null)
            onEnter?.(surfaces.faceOwners[e.faceIndex]);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(blocks[0].standId);
        }}
        onPointerOut={() =>
          onHover((id) => (id === blocks[0].standId ? null : id))
        }
      >
        <meshBasicMaterial
          transparent
          color="#ff782e"
          opacity={active ? 0.67 : 0}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {active && (
        <lineSegments geometry={surfaces.edges} position-y={0.4}>
          <lineBasicMaterial color="#ffb06a" />
        </lineSegments>
      )}
      {surfaces.ribbons.map(({ geometry, texture }, i) => (
        <mesh key={i} geometry={geometry}>
          <meshBasicMaterial
            map={texture}
            color={[2, 2, 2]}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}
function surface(points: number[], indices?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  if (indices) geometry.setIndex(indices);
  return geometry;
}
