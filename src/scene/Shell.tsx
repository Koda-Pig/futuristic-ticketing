import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  type BufferGeometry,
  type Material,
  type Mesh,
  MathUtils,
  Plane,
  Vector3,
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

type Box = Pick<
  NonNullable<Props["opening"]>,
  "position" | "rotationY" | "size"
>;
/** A box no camera can see, so planes around it clip nothing visible. */
const NOWHERE: Box = { position: [0, -1e4, 0], rotationY: 0, size: [0, 0, 0] };

/** Points `planes` (six, reused) at the faces of `box`, 0.2 m outside them. */
function placeBox(planes: Plane[], box: Box) {
  const center = new Vector3(...box.position);
  center.y += box.size[1] / 2;
  const up = new Vector3(0, 1, 0);
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].forEach((axis, i) =>
    [-1, 1].forEach((sign, j) => {
      const normal = new Vector3()
        .fromArray(axis)
        .applyAxisAngle(up, box.rotationY)
        .multiplyScalar(sign);
      planes[i * 2 + j].setFromNormalAndCoplanarPoint(
        normal,
        center.clone().addScaledVector(normal, box.size[i] / 2 + 0.2),
      );
    }),
  );
}

type Props = {
  opening?: VenueConfig["vipBoxes"][number];
  shell: NonNullable<VenueConfig["shell"]>;
  /** Overall opacity, e.g. 0.5 while calibrating. */
  opacity?: number;
  /** Fade the roof as the camera rises so the stands stay visible. */
  roofFade?: boolean;
};

export function Shell({ shell, opening, opacity = 1, roofFade = true }: Props) {
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
  // The copies are this instance's own; the cached GLB keeps the originals.
  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );

  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  // Clipping is on from the start with six planes that cut nothing (a tiny
  // box far below the ground). Opening a skybox only moves the planes:
  // toggling clipping instead would recompile every shell material, which
  // froze the upgrade for over a minute in software rendering.
  const planes = useMemo(
    () => Array.from({ length: 6 }, () => new Plane()),
    [],
  );
  useLayoutEffect(() => {
    const previous = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    for (const material of materials) {
      material.clippingPlanes = planes;
      material.clipIntersection = true;
      material.needsUpdate = true;
    }
    return () => {
      gl.localClippingEnabled = previous;
      for (const material of materials) {
        material.clippingPlanes = null;
        material.clipIntersection = false;
        material.needsUpdate = true;
      }
    };
  }, [gl, materials, planes]);
  useLayoutEffect(() => {
    placeBox(planes, opening ?? NOWHERE);
    invalidate();
  }, [planes, opening, invalidate]);

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
