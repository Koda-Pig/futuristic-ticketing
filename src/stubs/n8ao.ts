/**
 * Stand-in for the `n8ao` package. @react-three/postprocessing imports it at
 * the top of its single entry file, so its ~43 kB (minified) of ambient
 * occlusion code shipped even though the app never uses <N8AO>. Aliased in
 * vite.config.ts; using <N8AO> would throw.
 */
export class N8AOPostPass {
  constructor() {
    throw new Error("n8ao is stubbed out; see src/stubs/n8ao.ts");
  }
}
