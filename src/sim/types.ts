export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export type VehicleClass = 'economy' | 'sedan' | 'luxury' | 'suv' | 'minivan' | 'pickup' | 'ev';
export type AgentKind = 'fleet' | 'shuttle' | 'cart' | 'tow' | 'van' | 'pedestrian';
