import { useLayoutEffect, useRef, useMemo } from "react";
import { BoxGeometry, Color, InstancedMesh, Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Block, Bowl, Seat } from "../venue/generateBowl";

const chair = mergeGeometries([
  new BoxGeometry(0.43, 0.09, 0.4),
  new BoxGeometry(0.43, 0.42, 0.07).translate(0, 0.18, -0.18),
  ...[-0.22, 0.22].map((x) =>
    new BoxGeometry(0.04, 0.06, 0.32).translate(x, 0.15, 0),
  ),
]);

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
                ? "#586473"
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
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}
