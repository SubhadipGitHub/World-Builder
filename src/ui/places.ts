// Airport name labels (requirements L-1, architecture §19 H11). Positions come from the airport
// plan's label anchors with the same ids.

export type PlaceId = 'terminalA' | 'tower' | 'runway' | 'garage' | 'hotel' | 'cellLot' | 'cargo' | 'fire' | 'fuelFarm';

export interface Place {
  readonly id: PlaceId;
  readonly name: string;
  /** Below every hub facility (M5 FACILITIES priorities are 1–6). */
  readonly priority: number;
  /** Camera distance when flying to it. */
  readonly distance: number;
}

export const PLACES: readonly Place[] = [
  { id: 'terminalA', name: 'Terminal A · Gates A1–A8', priority: 0.9, distance: 320 },
  { id: 'tower', name: 'Control Tower', priority: 0.8, distance: 220 },
  { id: 'runway', name: 'Runway 09/27', priority: 0.7, distance: 600 },
  { id: 'garage', name: 'Parking Garage', priority: 0.6, distance: 220 },
  { id: 'hotel', name: 'Gateway Hotel', priority: 0.5, distance: 220 },
  { id: 'cargo', name: 'Sunline Cargo', priority: 0.4, distance: 240 },
  { id: 'fire', name: 'Fire Station', priority: 0.3, distance: 200 },
  { id: 'fuelFarm', name: 'Fuel Farm', priority: 0.2, distance: 200 },
  { id: 'cellLot', name: 'Cell Phone Lot', priority: 0.1, distance: 200 },
];

/** A name-only label as rendered (no status). */
export interface PlaceLabel {
  readonly id: PlaceId;
  readonly name: string;
}
