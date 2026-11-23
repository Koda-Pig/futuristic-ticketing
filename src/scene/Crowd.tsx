import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, InstancedMesh, Object3D } from "three";
import type { Seat } from "../venue/generateBowl";

// Each atlas cell contains a seated spectator with a distinct head and shoulders.
function silhouettes() {
  const atlas = document.createElement("canvas");
  atlas.width = 512;
  atlas.height = 64;
  const ctx = atlas.getContext("2d")!;
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.translate(i * 32, 0);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(16 + (i % 3) - 1, 11, 5 + (i % 2), 7, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(3 + (i % 4), 19, 26 - (i % 4), 33, [10, 10, 4, 4]);
    ctx.fill();
    ctx.fillRect(6, 45, 8, 16);
    ctx.fillRect(18, 45, 8, 16);
    ctx.restore();
  }
  return atlas;
}
export function Crowd({
  seats,
  sold,
  accent,
}: {
  seats: Seat[];
  sold: Set<string>;
  accent: string;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const uniforms = useMemo(
    () => ({ atlas: { value: new CanvasTexture(silhouettes()) } }),
    [],
  );
  useEffect(() => () => uniforms.atlas.value.dispose(), [uniforms]);
  useLayoutEffect(() => {
    const actor = new Object3D(),
      color = new Color();
    let index = 0;
    for (const seat of seats) {
      if (!sold.has(seat.id)) continue;
      actor.position.set(...seat.position);
      actor.updateMatrix();
      mesh.current!.setMatrixAt(index, actor.matrix);
      mesh.current!.setColorAt(
        index,
        color.set([accent, "#b9c7d3", "#364958", "#79574a"][seat.index % 4]),
      );
      index++;
    }
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor)
      mesh.current!.instanceColor.needsUpdate = true;
  }, [seats, sold, accent]);
  return (
    <instancedMesh
      args={[undefined, undefined, sold.size]}
      ref={mesh}
      frustumCulled={false}
      raycast={() => {}}
    >
      <planeGeometry />
      <shaderMaterial
        transparent={false}
        vertexShader={`
      varying vec2 vUv; varying vec3 tint;
      void main(){
        vUv=vec2((float(gl_InstanceID%16)+uv.x)/16.,uv.y); tint=instanceColor;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=vec2(position.x*.46,(position.y+.47)*1.05);
        gl_Position=projectionMatrix*center;
      }`}
        fragmentShader={`
      uniform sampler2D atlas; varying vec2 vUv; varying vec3 tint;
      void main(){if(texture2D(atlas,vUv).a<.5) discard;
      gl_FragColor=vec4(vUv.y>.72?vec3(.33,.21,.16):tint,1.);
      #include <colorspace_fragment>
      }`}
        uniforms={uniforms}
      />
    </instancedMesh>
  );
}
