/** Seeded PRNG (sfc32). The only source of randomness in src/sim (A9). */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p (p <= 0 never, p >= 1 always). */
  chance(p: number): boolean;
  /** Uniform element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  normal(mean: number, sd: number): number;
  exponential(mean: number): number;
  /** Poisson-distributed count with mean lambda. */
  poisson(lambda: number): number;
}

/** cyrb128: hashes a string into four 32-bit seed words. */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: number | string): Rng {
  let [a, b, c, d] = hashSeed(typeof seed === 'number' ? `n:${String(seed)}` : `s:${seed}`);

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };

  // Discard the first outputs so similar seeds diverge immediately.
  for (let i = 0; i < 15; i++) next();

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => (p <= 0 ? false : p >= 1 ? true : next() < p),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() from an empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    normal: (mean, sd) => {
      // Box-Muller; 1 - next() keeps the log argument in (0, 1].
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    exponential: (mean) => -mean * Math.log(1 - next()) || Number.MIN_VALUE,
    poisson: (lambda) => {
      if (lambda <= 0) return 0;
      if (lambda > 30) return Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
      // Knuth's method; fine for the small rates used per step.
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = next();
      while (p > limit) {
        k++;
        p *= next();
      }
      return k;
    },
  };
  return rng;
}
