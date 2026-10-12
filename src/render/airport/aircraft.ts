import type { BufferGeometry } from 'three';
import type { Airline } from '../../airport/flights';
import { assemble, paint, place } from '../kit/assemble';
import { capsule, cylinder, roundedBox, slab } from '../kit/shapes';

// Procedural airliner (requirements F-3, architecture §19 H9): about 38 m long, 36 m span, nose
// along +x, wheels on y = 0, split into instanceable parts.
//   body:    white fuselage, wings, stabilisers, grey engines
//   livery:  tail fin and cheatline in white, tinted per airline by instance colour
//   windows: the dark passenger band and cockpit (scaled to zero for the freighter)
//   gear:    wheels and legs (scaled vertically by gear extension)
//   lights:  red left wingtip, green right wingtip, white tail, red beacon, landing lights

export interface JetParts {
  readonly body: BufferGeometry;
  readonly livery: BufferGeometry;
  readonly windows: BufferGeometry;
  readonly gear: BufferGeometry;
  readonly lights: BufferGeometry;
}

export const AIRLINE_COLOUR: Readonly<Record<Airline, string>> = {
  pacificGateway: '#1F3A68',
  coastline: '#17A398',
  sunlineCargo: '#F28C28',
};

const WHITE = '#F4F5F7';
const GREY = '#9AA1AC';
const DARK = '#1E2430';
/** Fuselage centre height with the gear down. */
const BODY_Y = 3.4;
const RADIUS = 2;

export function jetParts(): JetParts {
  const body = assemble([
    // Fuselage along x (capsule is along y: rotate onto x).
    place(paint(capsule(RADIUS, 32, 12), WHITE), { y: BODY_Y, rotZ: -Math.PI / 2 }),
    // Swept wings, low on the fuselage.
    place(paint(roundedBox(7, 0.45, 17, 0.2, 1), WHITE), { x: -1.5, y: BODY_Y - 1.2, z: 9.2, rotY: 0.42 }),
    place(paint(roundedBox(7, 0.45, 17, 0.2, 1), WHITE), { x: -1.5, y: BODY_Y - 1.2, z: -9.2, rotY: -0.42 }),
    // Horizontal stabilisers.
    place(paint(roundedBox(3.2, 0.3, 6.5, 0.12, 1), WHITE), { x: -16.5, y: BODY_Y + 0.6, z: 3.6, rotY: 0.5 }),
    place(paint(roundedBox(3.2, 0.3, 6.5, 0.12, 1), WHITE), { x: -16.5, y: BODY_Y + 0.6, z: -3.6, rotY: -0.5 }),
    // Engines under the wings.
    place(paint(cylinder(1.1, 0.95, 4.2, 12), GREY), { x: 1.6, y: BODY_Y - 2.2, z: 6.2, rotZ: Math.PI / 2 }),
    place(paint(cylinder(1.1, 0.95, 4.2, 12), GREY), { x: 1.6, y: BODY_Y - 2.2, z: -6.2, rotZ: Math.PI / 2 }),
  ]);
  const livery = assemble([
    // Tail fin, swept back.
    place(paint(roundedBox(5.5, 7, 0.4, 0.18, 1), WHITE), { x: -15.6, y: BODY_Y + 4.6, rotZ: 0.42 }),
    // Cheatline along both sides.
    place(paint(slab(27, 0.45, 0.06), WHITE), { x: 0.5, y: BODY_Y - 0.55, z: RADIUS + 0.01 }),
    place(paint(slab(27, 0.45, 0.06), WHITE), { x: 0.5, y: BODY_Y - 0.55, z: -RADIUS - 0.01 }),
  ]);
  const windows = assemble([
    place(paint(slab(25, 0.32, 0.05), DARK), { x: 0, y: BODY_Y + 0.55, z: RADIUS * 0.96 }),
    place(paint(slab(25, 0.32, 0.05), DARK), { x: 0, y: BODY_Y + 0.55, z: -RADIUS * 0.96 }),
    place(paint(roundedBox(1.0, 0.55, 2.6, 0.2, 1), DARK), { x: 16.2, y: BODY_Y + 0.75 }),
  ]);
  const gear = assemble([
    place(paint(cylinder(0.12, 0.12, BODY_Y - RADIUS + 0.2, 6), GREY), { x: 12.5, y: (BODY_Y - RADIUS) / 2 }),
    place(paint(cylinder(0.45, 0.45, 0.4, 10), DARK), { x: 12.5, y: 0.45, rotX: Math.PI / 2 }),
    ...[3, -3].flatMap((z) => [
      place(paint(cylinder(0.18, 0.18, BODY_Y - RADIUS + 0.3, 6), GREY), { x: -1, y: (BODY_Y - RADIUS) / 2, z }),
      place(paint(cylinder(0.6, 0.6, 0.9, 10), DARK), { x: -1, y: 0.6, z, rotX: Math.PI / 2 }),
    ]),
  ]);
  const lights = assemble([
    // Port (left, −z) red, starboard (right, +z) green, tail white, beacon red on top, landing lights.
    place(paint(slab(0.4, 0.25, 0.25), '#FF2D2D'), { x: -5.1, y: BODY_Y - 1.1, z: -17.6 }),
    place(paint(slab(0.4, 0.25, 0.25), '#2DFF6A'), { x: -5.1, y: BODY_Y - 1.1, z: 17.6 }),
    place(paint(slab(0.3, 0.3, 0.3), '#FFFFFF'), { x: -18.7, y: BODY_Y + 0.4 }),
    place(paint(slab(0.35, 0.2, 0.35), '#FF3B30'), { x: -2, y: BODY_Y + RADIUS + 0.05 }),
    place(paint(slab(0.2, 0.3, 0.5), '#FFF6D8'), { x: 1.5, y: BODY_Y - 1.0, z: 3.4 }),
    place(paint(slab(0.2, 0.3, 0.5), '#FFF6D8'), { x: 1.5, y: BODY_Y - 1.0, z: -3.4 }),
  ]);
  return { body, livery, windows, gear, lights };
}
