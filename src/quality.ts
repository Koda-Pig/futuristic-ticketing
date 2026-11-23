import { create } from "zustand";

/**
 * Render quality, stepped down by `AdaptiveQuality` when the frame rate drops.
 * 2: DPR up to 1.5, bloom, SMAA. 1: DPR 1, bloom, SMAA. 0: DPR 1, no post-processing.
 */
export type Quality = 0 | 1 | 2;

export const useQuality = create<{ level: Quality; set: (q: Quality) => void }>(
  (set) => ({
    level: 2,
    set: (level) => set({ level }),
  }),
);

export const DPR: Record<Quality, number> = { 0: 1, 1: 1, 2: 1.5 };
