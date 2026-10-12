import type { AgentView, Metrics, ResourceView, Snapshot } from '../../../src/sim/world';

export const agent = (overrides: Partial<AgentView> = {}): AgentView => ({
  id: 'GL-PGW-04817',
  kind: 'fleet',
  cls: 'ev',
  x: 145,
  z: 40,
  heading: 0,
  speed: 0,
  length: 4.75,
  width: 1.92,
  parked: true,
  state: 'washing',
  stage: 'inspected',
  plate: '8ABC123',
  agreementNo: null,
  fuelPct: null,
  socPct: 64.2,
  odometerMi: 12_345,
  task: 'Washing at wash2',
  etaSimSec: 190,
  parentId: null,
  ...overrides,
});

export const resource = (overrides: Partial<ResourceView> = {}): ResourceView => ({
  id: 'wash2',
  kind: 'wash',
  occupantId: null,
  queueLength: 0,
  progress: null,
  ...overrides,
});

export const snapshot = (agents: AgentView[] = [], resources: ResourceView[] = [], overrides: Partial<Snapshot> = {}): Snapshot => ({
  tick: 1,
  simTimeSec: 3_600,
  clockHours: 9.5,
  weather: 'clear',
  timeScale: 20,
  agents,
  resources,
  ...overrides,
});

export const metrics = (overrides: Partial<Metrics> = {}): Metrics => ({
  turnaroundMin: 54.4,
  utilisation: 0.65,
  readyEvSocPct: 86.2,
  counts: { total: 120, onRent: 78, ready: 18, inTurnaround: 24 },
  stageCounts: { returned: 3, inspected: 5, washed: 4, energised: 6, staged: 18, dispatched: 0 },
  ...overrides,
});
