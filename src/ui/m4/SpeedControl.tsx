import type { JSX } from 'preact';

/** Simulation speed (S-18, W9): 0 = paused, then 1, 2 or 3 simulation steps per tick (15×, 30×, 45× hub clock; D30). */
export type Speed = 0 | 1 | 2 | 3;

export const SPEEDS: readonly { readonly value: Speed; readonly label: string }[] = [
  { value: 0, label: 'Pause' },
  { value: 1, label: '15×' },
  { value: 2, label: '30×' },
  { value: 3, label: '45×' },
];

export interface SpeedControlProps {
  readonly speed: Speed;
  readonly onSpeed: (speed: Speed) => void;
}

/** A segmented control: role="group", aria-label "Simulation speed", one button per SPEEDS entry with aria-pressed. */
export function SpeedControl({ speed, onSpeed }: SpeedControlProps): JSX.Element {
  return (
    <div role="group" aria-label="Simulation speed" class="segmented speed-control">
      {SPEEDS.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={speed === s.value ? 'true' : 'false'}
          onClick={() => {
            onSpeed(s.value);
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
