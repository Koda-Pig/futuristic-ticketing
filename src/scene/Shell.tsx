import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import {
  type BufferGeometry,
  type Material,
  type Mesh,
  MathUtils,
} from "three";

import type { VenueConfig } from "../venue/schema";

// Shell surfaces that hide the seating bowl from above (docs/PLAN.md §9).
const ROOF_SURFACES = new Set(["roof", "membrane", "glass", "truss"]);
const ROOF_FADE = { low: 35, high: 90, minOpacity: 0.12 };

/**
 * Simplification leaves zero-area triangles whose rebuilt normals are (0,0,0).
 * normalize() turns those into NaN pixels, which Bloom's blur spreads into a
 * fully black frame, so the view flickers while the camera moves. A zero normal
 * only belongs to a zero-area face, so any unit vector is safe there.
 */
function repairNormals(geometry: BufferGeometry) {
  const normal = geometry.getAttribute("normal");
  if (!normal) return;
  let repaired = false;
  for (let i = 0; i < normal.count; i++)
    if (!normal.getX(i) && !normal.getY(i) && !normal.getZ(i)) {
      normal.setXYZ(i, 0, 1, 0);
      repaired = true;
    }
  if (repaired) normal.needsUpdate = true;
}

type Props = {
  shell: NonNullable<VenueConfig["shell"]>;
  /** Overall opacity, e.g. 0.5 while calibrating. */
  opacity?: number;
  /** Fade the roof as the camera rises so the stands stay visible. */
  roofFade?: boolean;
};

export function Shell({ shell, opacity = 1, roofFade = true }: Props) {
  const { scene } = useGLTF(shell.gltfUrl);
  // Each Shell gets its own materials, since opacity is set per instance.
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const copies = new Map<Material, Material>();
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      repairNormals(mesh.geometry);
      const source = mesh.material as Material;
      if (!copies.has(source)) {
        const copy = source.clone();
        copy.userData.baseOpacity = source.opacity;
        copy.userData.roof = ROOF_SURFACES.has(source.name);
        copies.set(source, copy);
      }
      mesh.material = copies.get(source)!;
      mesh.castShadow = mesh.receiveShadow = true;
      if (ROOF_SURFACES.has(source.name)) mesh.castShadow = false;
    });
    return { model, materials: [...copies.values()] };
  }, [scene]);

  const setOpacity = (roof: number) => {
    for (const material of materials) {
      const value =
        material.userData.baseOpacity *
        opacity *
        (material.userData.roof ? roof : 1);
      const transparent = value < 1 || material.userData.baseOpacity < 1;
      if (material.transparent !== transparent) material.needsUpdate = true;
      material.transparent = transparent;
      material.depthWrite = value > 0.99;
      material.opacity = value;
    }
  };
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    setOpacity(1);
    // The GLB arrives after the first frame; draw it with frameloop="demand".
    invalidate();
  });
  useFrame(({ camera }) => {
    if (!roofFade) return;
    const t = MathUtils.smoothstep(
      camera.position.y,
      ROOF_FADE.low,
      ROOF_FADE.high,
    );
    setOpacity(MathUtils.lerp(1, ROOF_FADE.minOpacity, t));
  });

  return (
    <primitive
      object={model}
      position={shell.position ?? [0, 0, 0]}
      rotation-y={shell.rotationY ?? 0}
      scale={shell.scale ?? 1}
    />
  );
}
