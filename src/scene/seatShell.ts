import { BufferGeometry, Float32BufferAttribute } from "three";

// Cross-sections from the rolled front lip through the pan to the backrest.
// Raised sides cup the pan and wrap the backrest toward the sitter.
export function seatShell(detailed: boolean) {
  const sections = detailed
    ? [
        // half width, height, depth, side lift, side wrap
        [0.18, -0.025, 0.19, 0.015, -0.02],
        [0.21, 0.014, 0.21, 0.025, -0.02],
        [0.22, 0.0, 0.11, 0.045, 0],
        [0.21, -0.014, -0.09, 0.05, 0.025],
        [0.2, 0.035, -0.15, 0.04, 0.045],
        [0.19, 0.15, -0.17, 0.01, 0.05],
        [0.21, 0.34, -0.205, -0.01, 0.05],
        [0.18, 0.41, -0.22, -0.025, 0.04],
        [0.18, 0.4, -0.24, -0.025, 0.04],
      ]
    : [
        [0.2, 0, 0.2, 0.025, 0],
        [0.2, 0, -0.13, 0.04, 0.02],
        [0.19, 0.4, -0.22, -0.025, 0.04],
      ];
  const columns = detailed ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1];
  const positions: number[] = [],
    indices: number[] = [];
  for (const [width, y, z, lift, wrap] of sections) {
    for (const u of columns) {
      const i = positions.length / 3;
      positions.push(u * width, y + u * u * lift, z + u * u * wrap);
      const prev = i - columns.length;
      if (prev >= 0 && u !== -1)
        indices.push(prev - 1, prev, i, prev - 1, i, i - 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
