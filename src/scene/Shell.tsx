import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  type Material,
  type Mesh,
  MathUtils,
  Plane,
  Vector3,
  WebGLRenderTarget,
} from "three";

import { useQuality } from "../quality";
import type { VenueConfig } from "../venue/schema";
import { ShellLoader } from "./shellLoader";

// Shell surfaces that hide the seating bowl from above (docs/PLAN.md §9).
const ROOF_SURFACES = new Set(["roof", "membrane", "glass", "truss"]);
const ROOF_FADE = { low: 35, high: 90, minOpacity: 0.12 };

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
  // Zero normals from simplification are repaired by the processor
  // (scripts/process-stadium.mjs), which refuses to ship a GLB with any.
  const { scene } = useLoader(ShellLoader, shell.gltfUrl);
  // Each Shell gets its own materials, since opacity is set per instance.
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const copies = new Map<Material, Material>();
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
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

  // Compile the shell's shaders before it joins the scene, so its 15 lit,
  // shadowed, clipped materials don't stall one frame on arrival. Programs
  // depend on the target: post-processing renders the scene into a linear,
  // un-tone-mapped buffer, so compile for that whenever it's on.
  const camera = useThree((state) => state.camera);
  const root = useThree((state) => state.scene);
  const postprocessing = useQuality((q) => q.level > 0);
  const [compiled, setCompiled] = useState<typeof model | null>(null);
  useEffect(() => {
    let live = true;
    const target = postprocessing ? new WebGLRenderTarget(1, 1) : null;
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    // compileAsync reads the render target synchronously, then polls.
    const done = gl.compileAsync(model, camera, root);
    gl.setRenderTarget(previous);
    target?.dispose();
    done
      .catch(() => {}) // Drawing compiles anything left over.
      .then(() => {
        if (live) setCompiled(model);
      });
    return () => {
      live = false;
    };
    // Only for the first appearance: later quality changes recompile anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, model, camera, root]);

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

  if (compiled !== model) return null;
  return (
    <primitive
      object={model}
      position={shell.position ?? [0, 0, 0]}
      rotation-y={shell.rotationY ?? 0}
      scale={shell.scale ?? 1}
    />
  );
}
