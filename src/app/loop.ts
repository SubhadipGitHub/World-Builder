export interface FrameAdvance {
  /** Fixed simulation steps to run this frame. */
  readonly steps: number;
  /** Interpolation factor in [0, 1) between the previous and current snapshot. */
  readonly alpha: number;
}

/** Fixed-step accumulator (architecture A3). */
export interface Accumulator {
  /**
   * Adds a frame's wall time. Non-finite or negative input counts as 0.
   * At most maxStepsPerFrame steps are returned; time beyond that is dropped
   * (no spiral of death after a tab was in the background).
   */
  push(frameDtSec: number): FrameAdvance;
}

export function createAccumulator(stepSec: number, maxStepsPerFrame: number): Accumulator {
  let acc = 0;
  return {
    push(frameDtSec) {
      if (Number.isFinite(frameDtSec) && frameDtSec > 0) acc += frameDtSec;
      let steps = Math.floor(acc / stepSec + 1e-9);
      acc -= steps * stepSec;
      if (steps > maxStepsPerFrame) {
        steps = maxStepsPerFrame;
        acc %= stepSec;
      }
      acc = Math.max(0, acc);
      return { steps, alpha: Math.min(acc / stepSec, 1 - 1e-9) };
    },
  };
}
