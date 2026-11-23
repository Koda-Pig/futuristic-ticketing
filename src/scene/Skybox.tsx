import { useState } from "react";
import { Vector3 } from "three";
import type { VenueConfig } from "../venue/schema";

export type VipBox = VenueConfig["vipBoxes"][number];
type Point = [number, number, number];

export function worldPoint(box: VipBox, point: Point): Point {
  return new Vector3(...point)
    .applyAxisAngle(new Vector3(0, 1, 0), box.rotationY)
    .add(new Vector3(...box.position))
    .toArray();
}
function chair(box: VipBox, i: number): Point {
  const cols = Math.ceil(box.seats / 2);
  const back = i >= cols;
  return [
    (((i % cols) + 0.5) / cols - 0.5) * box.size[0],
    back ? 0.32 : 0,
    box.size[2] * (back ? -0.12 : 0.27),
  ];
}
export function vipView(box: VipBox, index: number | null) {
  const [x, y, z] =
    index === null
      ? [0, box.size[1] * 0.83, -box.size[2] * 0.46]
      : chair(box, index);
  return {
    id: box.id + "/" + index,
    target:
      index === null
        ? worldPoint(box, [0, 0.8, box.size[2] * 0.15])
        : undefined,
    eye: worldPoint(box, [x, y + (index === null ? 0 : 1.06), z]),
  };
}
function Slab({ at, size, color }: { at: Point; size: Point; color: string }) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
/**
 * The box's two warm ceiling lights. Kept mounted (dark when `on` is false)
 * because adding lights to a scene recompiles every lit material in it.
 */
export function SkyboxLights({ box, on }: { box: VipBox; on: boolean }) {
  const [w, h] = box.size;
  return (
    <group position={box.position} rotation-y={box.rotationY}>
      {[-1, 1].map((side) => (
        <pointLight
          key={side}
          position={[side * w * 0.28, h * 0.88, 0]}
          color="#ffd59a"
          intensity={on ? 12 : 0}
          distance={9}
        />
      ))}
    </group>
  );
}
export function Skybox({
  box,
  index,
  available,
  accent,
  pick,
}: {
  box: VipBox;
  index: number | null;
  available: boolean[];
  accent: string;
  pick: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [w, h, d] = box.size;
  return (
    <group position={box.position} rotation-y={box.rotationY}>
      <Slab at={[0, -0.07, 0]} size={[w, 0.14, d]} color="#493628" />
      <Slab at={[0, h / 2, -d / 2]} size={[w, h, 0.12]} color="#594332" />
      <Slab
        at={[0, 0.45, -d * 0.43]}
        size={[w * 0.82, 0.9, 0.38]}
        color="#665749"
      />
      {[-1, 1].map((side) => (
        <Slab
          key={side}
          at={[(side * w) / 2, h / 2, 0]}
          size={[0.1, h, d]}
          color="#493628"
        />
      ))}
      <mesh position={[0, h / 2, d / 2]}>
        <boxGeometry args={[w, h, 0.035]} />
        <meshPhysicalMaterial
          color="#bddbef"
          roughness={0.05}
          transparent
          opacity={0.09}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: box.seats }, (_, i) => {
        const taken = !available[i];
        const color = index === i ? accent : taken ? "#453e3a" : "#27232b";
        return (
          <group
            key={i}
            position={chair(box, i)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(i);
            }}
            onPointerOut={() => setHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (index === null && !taken) pick(i);
            }}
          >
            <Slab at={[0, 0.36, 0]} size={[0.76, 0.34, 0.74]} color={color} />
            <Slab
              at={[0, 0.72, -0.34]}
              size={[0.76, 0.8, 0.17]}
              color={color}
            />
            {[-1, 1].map((side) => (
              <Slab
                key={side}
                at={[side * 0.4, 0.52, 0]}
                size={[0.12, 0.25, 0.8]}
                color={hover === i && !taken && index === null ? accent : color}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
