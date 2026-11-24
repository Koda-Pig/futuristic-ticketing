import { useLayoutEffect, useRef, useMemo } from "react";
import { Color, DoubleSide, InstancedMesh, Object3D } from "three";
import type { Block, Bowl, Seat } from "../venue/generateBowl";

import { seatShell } from "./seatShell";

const chair = seatShell(true);

export function BlockSeats({
  bowl,
  block,
  accent,
  sold,
  hover,
  selected,
  onHover,
  onPick,
  interactive,
}: {
  bowl: Bowl;
  block: Block;
  accent: string;
  sold: Set<string>;
  hover: Seat | null;
  selected: Seat | null;
  onHover: (seat: Seat | null) => void;
  onPick: (seat: Seat) => void;
  interactive: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const seats = useMemo(
    () => bowl.seats.slice(block.seatStart, block.seatStart + block.seatCount),
    [bowl, block],
  );
  useLayoutEffect(() => {
    const object = new Object3D();
    seats.forEach((seat, i) => {
      object.position.set(...seat.position);
      object.rotation.y = seat.yaw;
      object.updateMatrix();
      mesh.current!.setMatrixAt(i, object.matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [seats]);
  useLayoutEffect(() => {
    const color = new Color();
    seats.forEach((seat, i) =>
      mesh.current!.setColorAt(
        i,
        color.set(
          seat === selected
            ? "#ff6a2b"
            : seat === hover
              ? "white"
              : sold.has(seat.id)
                ? "#242b36"
                : accent,
        ),
      ),
    );
    if (mesh.current!.instanceColor)
      mesh.current!.instanceColor.needsUpdate = true;
  }, [seats, accent, sold, hover, selected]);
  return (
    <instancedMesh
      ref={mesh}
      castShadow
      receiveShadow
      args={[chair, undefined, seats.length]}
      onPointerMove={
        interactive
          ? (e) => {
              e.stopPropagation();
              if (e.instanceId != null) onHover(seats[e.instanceId]);
            }
          : undefined
      }
      onPointerOut={interactive ? () => onHover(null) : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              if (e.delta < 5 && e.instanceId != null)
                onPick(seats[e.instanceId]);
            }
          : undefined
      }
    >
      <meshStandardMaterial roughness={0.3} side={DoubleSide} />
    </instancedMesh>
  );
}
