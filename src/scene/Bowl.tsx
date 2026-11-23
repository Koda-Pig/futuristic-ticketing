import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type InstancedMesh, Object3D } from "three";

import type { Bowl as BowlData } from "../venue/generateBowl";

// Far LOD: one small box per seat, one draw call per tier (docs/PLAN.md §6.5).
const geometry = new BoxGeometry(0.44, 0.5, 0.42);
geometry.translate(0, -0.2, 0); // seat position is the pan; the box sits on the tread

type Props = { bowl: BowlData; accent: string };

export function Bowl({ bowl, accent }: Props) {
  // Tiers get slightly different shades of the accent so they read apart.
  const colors = useMemo(
    () =>
      bowl.tiers.map((_, index) =>
        new Color(accent).offsetHSL(0, 0, (index - 1) * -0.08),
      ),
    [bowl.tiers, accent],
  );
  return bowl.tiers.map((tier, index) => (
    <TierSeats
      key={tier.id}
      bowl={bowl}
      tierId={tier.id}
      color={colors[index]}
    />
  ));
}

function TierSeats({
  bowl,
  tierId,
  color,
}: {
  bowl: BowlData;
  tierId: string;
  color: Color;
}) {
  const ref = useRef<InstancedMesh>(null);
  const seats = useMemo(
    () => bowl.seats.filter((seat) => seat.tierId === tierId),
    [bowl, tierId],
  );
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const dummy = new Object3D();
    seats.forEach((seat, i) => {
      dummy.position.set(...seat.position);
      dummy.rotation.set(0, seat.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [seats, color, invalidate]);
  return (
    <instancedMesh
      // A new mesh when the count changes; instanced buffers are fixed-size.
      key={seats.length}
      ref={ref}
      args={[geometry, undefined, seats.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}
