import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { PerspectiveCamera, SRGBColorSpace, WebGLRenderTarget } from "three";
import type { RefObject } from "react";
import type { Seat } from "../venue/generateBowl";

import { aimAtPitch } from "./SeatCamera";

export function SeatPreview({
  seat,
  canvas,
  snapshot,
}: {
  snapshot?: (url: string) => void;
  seat: Seat;
  canvas: RefObject<HTMLCanvasElement | null>;
}) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = snapshot ? document.createElement("canvas") : canvas.current;
      if (el && snapshot) {
        el.width = 800;
        el.height = 450;
      }
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      const { width, height } = el;
      const camera = new PerspectiveCamera(65, width / height, 0.1, 1000);
      if (snapshot) aimAtPitch(camera, seat);
      else {
        camera.position.set(...seat.eye);
        camera.lookAt(0, 0, 0);
      }
      const target = new WebGLRenderTarget(width, height);
      target.texture.colorSpace = SRGBColorSpace;
      const original = gl.getRenderTarget();
      const pixels = new Uint8Array(width * height * 4);
      try {
        gl.setRenderTarget(target);
        gl.render(scene, camera);
        gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      } finally {
        gl.setRenderTarget(original);
        target.dispose();
      }
      const frame = ctx.createImageData(width, height);
      const stride = width * 4;
      for (let y = 0; y < height; y++)
        frame.data.set(
          pixels.subarray(y * stride, (y + 1) * stride),
          (height - 1 - y) * stride,
        );
      ctx.putImageData(frame, 0, 0);
      el.dataset.seat = seat.id;
      if (snapshot) snapshot(el.toDataURL());
    }, 80);
    return () => clearTimeout(timer);
  }, [canvas, gl, scene, seat, snapshot]);
  return null;
}
