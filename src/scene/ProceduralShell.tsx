import { useMemo } from "react";
import { DoubleSide } from "three";
import type { Bowl } from "../venue/generateBowl";

export function ProceduralShell({ bowl }: { bowl: Bowl }) {
  const { positions, indices, masts } = useMemo(() => {
    const positions: number[] = [],
      indices: number[] = [],
      masts: [number, number, number][] = [];
    for (const block of bowl.blocks) {
      const p = block.hitMesh.positions;
      const outer = !bowl.blocks.some(
        (b) => b.standId === block.standId && b.hitMesh.positions[4] > p[4],
      );
      const stride = outer ? 6 : 2;
      for (let i = 0; i < p.length; i += 6) {
        const [x, y, z, bx, by, bz] = p.subarray(i, i + 6);
        const start = positions.length / 3;
        positions.push(x, y - 0.46, z, bx, by - 0.46, bz);
        if (outer) {
          const top = by + 5;
          positions.push(
            bx,
            0,
            bz,
            bx,
            by,
            bz,
            bx,
            top,
            bz,
            bx + (x - bx) * 0.45,
            top + 0.6,
            bz + (z - bz) * 0.45,
          );
          if (i === 0) masts.push([bx, top / 2, bz]);
        }
        if (i === 0) continue;
        for (let j = 0; j < stride; j += 2) {
          const a = start + j,
            b = a - stride;
          indices.push(b, a, b + 1, b + 1, a, a + 1);
        }
      }
    }
    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
      masts,
    };
  }, [bowl]);
  return (
    <group>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="index" args={[indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial color="#657077" side={DoubleSide} />
      </mesh>
      {masts.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <cylinderGeometry args={[0.16, 0.25, y * 2, 6]} />
          <meshStandardMaterial color="#89959a" />
        </mesh>
      ))}
    </group>
  );
}
