import { brand } from './brand';

// Building signs (requirements B-1, approved 2026-10-12). Fictional brand only (N-7).

export type SignFace = 'north' | 'south' | 'east' | 'west' | 'roof';

export interface BuildingSign {
  /** hub.buildings id. */
  readonly building: string;
  readonly text: string;
  /** Faces the sign is shown on; 'roof' is a two-sided sign standing on the roof. */
  readonly faces: readonly SignFace[];
  /** Letter height in metres (legibility from the hub camera, risk §18.6). */
  readonly letterHeight: number;
  /** Height of the sign's centre above the ground. */
  readonly y: number;
}

export const buildingSigns: readonly BuildingSign[] = [
  { building: 'terminal', text: brand.company, faces: ['roof'], letterHeight: 3, y: 15 },
  { building: 'terminal', text: brand.counterName, faces: ['east'], letterHeight: 0.9, y: 5 },
  { building: 'canopy', text: 'Rental Car Return', faces: ['west', 'east'], letterHeight: 1, y: 7.6 },
  { building: 'wash', text: 'Express Wash', faces: ['west', 'east'], letterHeight: 0.9, y: 6.6 },
  { building: 'service', text: 'Service Center', faces: ['west'], letterHeight: 1, y: 7.2 },
  { building: 'evHub', text: 'EV Fast Charge', faces: ['north', 'south'], letterHeight: 0.9, y: 5.6 },
  { building: 'fuel', text: 'Fuel', faces: ['north', 'south'], letterHeight: 0.9, y: 5.6 },
  { building: 'gates', text: `Exit · Thank you for choosing ${brand.company.split(' ')[0] ?? brand.company}`, faces: ['east'], letterHeight: 0.6, y: 4.6 },
  { building: 'depot', text: 'Tow Depot', faces: ['north'], letterHeight: 0.8, y: 5.4 },
];

/** Every string drawn into the text atlas: building signs, the pylon, gantries, direction signs and ground text. */
export const PYLON_TEXT = brand.company;
export const SECURITY_TEXT = `${brand.company.split(' ')[0] ?? brand.company} Security`;
