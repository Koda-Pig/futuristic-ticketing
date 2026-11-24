import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { DoubleSide, Color, type InstancedMesh, Object3D } from "three";

import type { Bowl as BowlData } from "../venue/generateBowl";

import { seatShell } from "./seatShell";

// Eight triangles per distant chair, instanced once per tier.
const geometry = seatShell(false);

type Props = {
  bowl: BowlData;
  accent: string;
  muted?: boolean;
  /** Blocks drawn elsewhere (the detailed seats near the camera). */
  hidden?: ReadonlySet<string>;
};

const NONE: ReadonlySet<string> = new Set();

export function Bowl({ bowl, accent, muted = false, hidden = NONE }: Props) {
  // Tiers get slightly different shades of the accent so they read apart.
  const colors = useMemo(
    () =>
      bowl.tiers.map((tier, index) =>
        tier.seatColor && !muted
          ? new Color(tier.seatColor)
          : new Color(accent).offsetHSL(0, 0, (index - 1) * -0.08),
      ),
    [bowl.tiers, accent, muted],
  );
  return bowl.tiers.map((tier, index) => (
    <TierSeats
      key={tier.id}
      bowl={bowl}
      tierId={tier.id}
      color={colors[index]}
      hidden={hidden}
    />
  ));
}

function TierSeats({
  bowl,
  tierId,
  color,
  hidden,
}: {
  bowl: BowlData;
  tierId: string;
  color: Color;
  hidden: ReadonlySet<string>;
}) {
  const ref = useRef<InstancedMesh>(null);
  // generateBowl emits each tier's seats, and each block's, contiguously.
  const { start, count, blocks } = useMemo(() => {
    const blocks = bowl.blocks.filter((b) => b.tierId === tierId);
    const start = blocks[0]?.seatStart ?? 0;
    const count = blocks.reduce((n, b) => n + b.seatCount, 0);
    return { start, count, blocks };
  }, [bowl, tierId]);
  // Every seat's matrix, computed once; hiding a block zeroes its range.
  const matrices = useMemo(() => {
    const out = new Float32Array(count * 16);
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      const seat = bowl.seats[start + i];
      dummy.position.set(...seat.position);
      dummy.rotation.set(0, seat.yaw, 0);
      dummy.updateMatrix();
      dummy.matrix.toArray(out, i * 16);
    }
    return out;
  }, [bowl, start, count]);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [count, color, invalidate]);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const array = mesh.instanceMatrix.array as Float32Array;
    array.set(matrices);
    for (const block of blocks)
      if (hidden.has(block.id))
        array.fill(
          0,
          (block.seatStart - start) * 16,
          (block.seatStart - start + block.seatCount) * 16,
        );
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [matrices, blocks, start, hidden, invalidate]);
  return (
    <instancedMesh
      // A new mesh when the count changes; instanced buffers are fixed-size.
      key={count}
      ref={ref}
      args={[geometry, undefined, count]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial roughness={0.44} side={DoubleSide} />
    </instancedMesh>
  );
}
