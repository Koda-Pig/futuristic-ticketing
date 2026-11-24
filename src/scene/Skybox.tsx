import { useState } from "react";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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
export function boxExterior(box: VipBox) {
  const [w, h, d] = box.size;
  return {
    id: box.id + "/exterior",
    eye: worldPoint(box, [w * 0.28, h * 0.8, d / 2 + w * 0.82]),
    target: worldPoint(box, [0, h * 0.48, d * 0.24]),
  };
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
// All recliners share the same rounded moulding at different scales.
const cushion = new RoundedBoxGeometry(1, 1, 1, 3, 0.18);
function Pad({
  at,
  size,
  color,
  tilt = 0,
}: {
  at: Point;
  size: Point;
  color: string;
  tilt?: number;
}) {
  return (
    <mesh geometry={cushion} position={at} scale={size} rotation-x={tilt}>
      <meshStandardMaterial color={color} roughness={0.36} />
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
  pick?: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [w, h, d] = box.size;
  const highlighted =
    index ??
    (hover !== null && available[hover] ? hover : available.indexOf(true));
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
      <Slab at={[0, h, 0]} size={[w + 0.16, 0.14, d + 0.16]} color="#333c41" />
      <Slab at={[0, 0.68, d / 2]} size={[w, 0.045, 0.07]} color="#8a9190" />
      {[-0.5, -0.25, 0, 0.25, 0.5].map((offset) => (
        <Slab
          key={offset}
          at={[w * offset, h / 2, d / 2]}
          size={[0.045, h, 0.09]}
          color="#455461"
        />
      ))}
      <mesh position={[0, h / 2, d / 2]}>
        <boxGeometry args={[w, h, 0.035]} />
        <meshPhysicalMaterial
          color="#bddbef"
          roughness={0.05}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: box.seats }, (_, i) => {
        const taken = !available[i];
        const color =
          highlighted === i ? accent : taken ? "#393637" : "#513c36";
        return (
          <group
            key={i}
            position={chair(box, i)}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (pick) setHover(i);
            }}
            onPointerOut={() => setHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (!taken) pick?.(i);
            }}
          >
            <Pad at={[0, 0.2, 0]} size={[0.73, 0.32, 0.82]} color="#242328" />
            <Pad at={[0, 0.43, 0.04]} size={[0.75, 0.23, 0.78]} color={color} />
            <Pad
              at={[0, 0.77, -0.34]}
              size={[0.78, 0.81, 0.25]}
              tilt={-0.18}
              color={color}
            />
            <Pad
              at={[0, 1.13, -0.39]}
              size={[0.64, 0.24, 0.26]}
              color={color}
            />
            <Pad
              at={[0, 0.23, 0.46]}
              size={[0.72, 0.35, 0.15]}
              tilt={-0.28}
              color={color}
            />
            {[-1, 1].map((side) => (
              <Pad
                key={side}
                at={[side * 0.44, 0.55, 0.025]}
                size={[0.18, 0.32, 0.81]}
                color={color}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
