// Simulation modifiers per weather mode (X-1; fog and thunderstorm FE-6). Visual parameters live in render/environment.
export const weatherModes = ['clear', 'overcast', 'fog', 'rain', 'storm', 'heatwave'] as const;
export type WeatherMode = (typeof weatherModes)[number];

export interface WeatherSim {
  readonly label: string;
  readonly speedFactor: number;
  readonly demandFactor: number;
  readonly chargeFactor: number;
}

export const weather: Record<WeatherMode, WeatherSim> = {
  clear: { label: 'Clear / sunny', speedFactor: 1, demandFactor: 1, chargeFactor: 1 },
  rain: { label: 'Heavy rain / slick', speedFactor: 0.8, demandFactor: 1, chargeFactor: 1 },
  overcast: { label: 'Overcast', speedFactor: 1, demandFactor: 1, chargeFactor: 1 },
  // −10% (D60; −15% backed the wash up past the morning peak), between overcast and rain.
  fog: { label: 'Fog', speedFactor: 0.9, demandFactor: 1, chargeFactor: 1 },
  storm: { label: 'Thunderstorm', speedFactor: 0.75, demandFactor: 1, chargeFactor: 1 },
  heatwave: { label: 'Heatwave / high demand', speedFactor: 1, demandFactor: 1.4, chargeFactor: 0.85 },
};
