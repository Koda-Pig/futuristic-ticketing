import { useFrame } from "@react-three/fiber";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { useEffect, useMemo } from "react";
import { Matrix4, Uniform } from "three";

const fragment = /* glsl */ `
  uniform mat4 previousClip;
  uniform float shutter;
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    outputColor = inputColor;
    if (shutter == 0.0) return;
    vec4 p = previousClip * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    if (p.w <= 0.0) return;
    vec2 travel = (p.xy / p.w * 0.5 + 0.5 - uv) * shutter;
    float len = length(travel);
    // Slow moves such as the idle auto-rotate stay sharp; blur fades in above that.
    if (len < 0.002) return;
    travel *= min(1.0, 0.035 / len);
    vec4 blurred = inputColor;
    for (int i = 1; i <= 4; ++i)
      blurred += texture2D(inputBuffer, uv + travel * (float(i) * 0.25));
    outputColor = mix(inputColor, blurred * 0.2, smoothstep(0.002, 0.006, len));
  }
`;

export function CameraMotionBlur() {
  const state = useMemo(() => {
    const previousClip = new Uniform(new Matrix4());
    const shutter = new Uniform(0);
    const effect = new Effect("CameraMotionBlur", fragment, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["previousClip", previousClip],
        ["shutter", shutter],
      ]),
    });
    return {
      effect,
      previousClip,
      shutter,
      current: new Matrix4(),
      previous: new Matrix4(),
      projection: new Matrix4(),
      ready: false,
    };
  }, []);
  useEffect(() => () => state.effect.dispose(), [state]);
  // The flight advances at priority 0 and the composer draws at priority 1.
  useFrame(({ camera }, delta) => {
    camera.updateMatrixWorld();
    state.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    state.previousClip.value
      .copy(state.current)
      .invert()
      .premultiply(state.previous);
    // A lens change (seat view's wider FOV, a resize) is not camera motion.
    const lensChanged = !state.projection.equals(camera.projectionMatrix);
    state.shutter.value =
      state.ready &&
      delta > 0 &&
      !lensChanged &&
      !state.previous.equals(state.current)
        ? Math.min(1, 1 / (90 * delta))
        : 0;
    state.previous.copy(state.current);
    state.projection.copy(camera.projectionMatrix);
    state.ready = true;
  }, 0.5);
  return <primitive object={state.effect} />;
}
