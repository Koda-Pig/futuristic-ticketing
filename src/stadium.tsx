import { Canvas } from "@react-three/fiber";
import { createRoot } from "react-dom/client";

export function mount(root: HTMLElement) {
  createRoot(root).render(
    <main aria-label="Cape Point Stadium" style={{ height: "100dvh" }}>
      <Canvas
        frameloop="demand"
        aria-label="3D stadium"
        onCreated={({ gl }) => {
          gl.domElement.dataset.ready = "true";
        }}
      >
        <color attach="background" args={["#10151c"]} />
      </Canvas>
    </main>,
  );
}
