import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  Euler,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import type { Seat } from "../venue/generateBowl";

export type Viewpoint = Pick<Seat, "eye"> & { target?: Seat["eye"] };

export function aimAtPitch(camera: PerspectiveCamera, seat: Viewpoint) {
  camera.position.set(...seat.eye);
  if (seat.target) camera.lookAt(...seat.target);
  else camera.lookAt(seat.eye[0] * 0.08, 0, seat.eye[2] * 0.08);
}

export function SeatCamera({
  seat,
  entry,
  duration = 1.2,
}: {
  seat: Viewpoint;
  entry?: Seat["eye"];
  duration?: number;
}) {
  const { camera, gl } = useThree();
  const step = useRef<(delta: number) => void>(() => {});
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const start = camera.position.clone();
    const rotation = camera.quaternion.clone();
    const destination = camera.clone();
    aimAtPitch(destination, seat);
    const base = new Euler().setFromQuaternion(destination.quaternion, "YXZ");
    const look = new Quaternion();
    const angles = new Euler(0, 0, 0, "YXZ");
    const eye = new Vector3(...seat.eye);
    const element = gl.domElement;
    const near = camera.near,
      fov = camera.fov;
    camera.near = 0.05;
    camera.fov = 65;
    camera.updateProjectionMatrix();
    let elapsed = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 3
      : 0;
    let yaw = 0,
      pitch = 0;
    let drag: { id: number; x: number; y: number } | undefined;
    function down(e: PointerEvent) {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      element.setPointerCapture(e.pointerId);
    }
    function move(e: PointerEvent) {
      if (drag?.id !== e.pointerId) return;
      yaw = MathUtils.clamp(yaw - (e.clientX - drag.x) * 0.22, -70, 70);
      pitch = MathUtils.clamp(pitch - (e.clientY - drag.y) * 0.22, -25, 25);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
    function end(e: PointerEvent) {
      if (drag?.id === e.pointerId) drag = undefined;
    }
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("lostpointercapture", end);
    const outside = entry && new Vector3(...entry);
    step.current = (delta) => {
      elapsed += delta;
      const t = MathUtils.smoothstep(
        elapsed,
        entry ? 1.3 : 0,
        entry ? 2 : duration,
      );
      if (outside && elapsed < 1.3) {
        const u = MathUtils.smoothstep(elapsed, 0, 0.9);
        camera.position.lerpVectors(start, outside, u);
        camera.position.y += 12 * Math.sin(Math.PI * u);
        camera.lookAt(eye);
        rotation.copy(camera.quaternion);
        return;
      }
      camera.position.lerpVectors(outside || start, eye, t);
      look.setFromEuler(
        angles.set(
          base.x + MathUtils.degToRad(pitch),
          base.y + MathUtils.degToRad(yaw),
          0,
        ),
      );
      camera.quaternion.slerpQuaternions(rotation, look, t);
    };
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("lostpointercapture", end);
      camera.near = near;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
  }, [camera, gl, seat, entry, duration]);
  useFrame((_, delta) => step.current(delta));
  return null;
}
