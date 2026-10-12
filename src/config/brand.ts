// All user-visible brand strings and colours (D5, N-7). Fictional brand only.
export const brand = {
  company: 'GoldLane Rentals',
  appName: 'GoldLane Hub',
  hubName: 'Pacific Gateway Fleet Ops',
  airport: 'Pacific Gateway International Airport',
  counterName: 'GoldLane Express',
  idPrefix: 'GL',
  hubCode: 'PGW',
  agreementPrefix: 'RA',
  tiers: ['Gold', 'Platinum'],
  timeZone: 'America/Los_Angeles',
  colors: {
    accent: '#F2B33D',
    dark: { bg: '#1E1E24', text: '#F4F5F8' },
    light: { bg: '#F4F5F8', text: '#1E1E24' },
  },
} as const;

export type Brand = typeof brand;
export type Tier = Brand['tiers'][number];
