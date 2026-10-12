import type { BufferGeometry } from 'three';
import { assemble, paint, place } from '../kit/assemble';
import { blob, capsule, roundedBox } from '../kit/shapes';

export type PersonRole = 'customer' | 'staff';

/**
 * Pixar-style person (V-5), facing +x, feet on y = 0, centred:
 *  - clothing: shirt and trousers in white, tinted per instance; staff bake a gold hi-vis vest
 *  - skin: head, hands and hair, untinted vertex colours
 * The union must fit the pedestrian footprint (P10) and stand 1.5–1.9 m tall.
 */
export interface PersonAsset {
  readonly clothing: BufferGeometry;
  readonly skin: BufferGeometry;
}

const WHITE = '#FFFFFF';
const SKIN = '#E8B48F';
const HAIR = '#4A3424';
const VEST = '#F2B33D';

export function personAsset(role: PersonRole): PersonAsset {
  const clothing: BufferGeometry[] = [];
  // Legs (trousers), torso (shirt) and arms (sleeves): big friendly proportions.
  for (const z of [0.085, -0.085]) clothing.push(place(paint(capsule(0.075, 0.6, 6), WHITE), { y: 0.375, z }));
  clothing.push(place(paint(capsule(0.17, 0.3, 8), WHITE), { y: 1.05 }));
  // Arms angle slightly in towards the hips (rotX swings each arm's lower end inward).
  for (const z of [0.195, -0.195]) clothing.push(place(paint(capsule(0.055, 0.38, 6), WHITE), { y: 1.02, z, rotX: z > 0 ? 0.1 : -0.1 }));
  if (role === 'staff') clothing.push(place(paint(roundedBox(0.36, 0.42, 0.37, 0.12, 1), VEST), { y: 1.1 }));

  const skin: BufferGeometry[] = [
    place(paint(blob(0.15, 1), SKIN), { y: 1.52 }),
    place(paint(blob(0.155, 0), HAIR), { y: 1.6, x: -0.02, scale: [1, 0.62, 1] }),
  ];
  for (const z of [0.17, -0.17]) skin.push(place(paint(blob(0.05, 0), SKIN), { y: 0.78, z }));

  return { clothing: assemble(clothing), skin: assemble(skin) };
}

export interface WalkPose {
  /** Vertical bounce in metres. */
  readonly lift: number;
  /** Side-to-side lean in radians. */
  readonly sway: number;
}

const MAX_LIFT = 0.06;
const MAX_SWAY = 0.08;
const FULL_SPEED = 1.6;

/**
 * Simple walk bob (V-5): two bounces per stride cycle, amplitude growing with speed
 * (lift ≤ 0.06 m, |sway| ≤ 0.08 rad). Standing still (speed < 0.1 m/s) → no motion.
 * `phase` (radians) de-synchronises walkers.
 */
export function walkBob(timeSec: number, speed: number, phase: number): WalkPose {
  if (speed < 0.1) return { lift: 0, sway: 0 };
  const amp = Math.min(1, speed / FULL_SPEED);
  const angle = Math.PI * 1.8 * timeSec + phase;
  return { lift: MAX_LIFT * amp * Math.abs(Math.sin(angle)), sway: MAX_SWAY * amp * Math.sin(angle) };
}
