import type { AreaId } from '../layout/hub';

// Kiosk auto-tour timing (requirements SH-9, SH-10; architecture §21 J6). Wall-time driven and pure.

export interface KioskOptions {
  readonly areas: readonly AreaId[];
  /** Seconds spent on each area. */
  readonly dwellSec: number;
  /** Seconds without input before a paused tour resumes. */
  readonly idleSec: number;
}

export interface KioskState {
  readonly phase: 'touring' | 'paused' | 'exited';
  /** The area being shown (the first area at the start). */
  readonly area: AreaId;
  /** Seconds left on the current area (frozen while paused). */
  readonly dwellLeftSec: number;
  /** Seconds until a paused tour resumes; null unless paused. */
  readonly resumeInSec: number | null;
}

export interface KioskScheduler {
  /** Advances wall time; returns the area to fly to now (dwell ended, or the tour resumed), else null. */
  tick(dtSec: number): AreaId | null;
  /** Any viewer input: pauses the tour and restarts the idle countdown. */
  input(): void;
  /** Leaves kiosk mode for good. */
  exit(): void;
  state(): KioskState;
}

export const KIOSK_AREAS: readonly AreaId[] = ['overview', 'return', 'wash', 'energy', 'lot', 'airport'];
export const KIOSK_DWELL_SEC = 20;
export const KIOSK_IDLE_SEC = 60;

export function createKioskScheduler(options: KioskOptions): KioskScheduler {
  const { areas, dwellSec, idleSec } = options;
  if (areas.length === 0) throw new Error('A kiosk tour needs at least one area');
  let phase: KioskState['phase'] = 'touring';
  let index = 0;
  let dwellLeft = dwellSec;
  let resumeIn: number | null = null;
  const area = (): AreaId => areas[index] as AreaId;

  /** Next area with a full dwell: a long frame's overshoot is not carried over. */
  const advance = (): AreaId => {
    index = (index + 1) % areas.length;
    dwellLeft = dwellSec;
    return area();
  };

  return {
    tick(dtSec) {
      if (phase === 'exited' || !(dtSec > 0) || !Number.isFinite(dtSec)) return null;
      if (phase === 'paused') {
        resumeIn = (resumeIn ?? idleSec) - dtSec;
        if (resumeIn > 0) return null;
        phase = 'touring';
        resumeIn = null;
        return advance();
      }
      dwellLeft -= dtSec;
      return dwellLeft <= 0 ? advance() : null;
    },
    input() {
      if (phase === 'exited') return;
      phase = 'paused';
      resumeIn = idleSec;
    },
    exit() {
      phase = 'exited';
      resumeIn = null;
    },
    state: () => ({ phase, area: area(), dwellLeftSec: dwellLeft, resumeInSec: resumeIn }),
  };
}
