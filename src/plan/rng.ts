// Seeded randomness. Nothing in the plan may call Math.random: the same world must
// always draw the same map.

/** 32-bit hash of a string (FNV-1a with a final avalanche). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A stateless 0–1 value for a string key: handy when one number is all that is needed. */
export function hash01(s: string): number {
  return hashString(s) / 4294967296;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [a, b). */
  range(a: number, b: number): number;
  /** Integer in [a, b], both inclusive. */
  int(a: number, b: number): number;
  pick<T>(arr: readonly T[]): T;
  /** Standard normal. */
  gauss(): number;
}

export function rng(seed: string | number): Rng {
  let a = (typeof seed === 'number' ? hashString(String(seed)) : hashString(seed)) >>> 0;
  const next = (): number => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const self: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('rng.pick: empty array');
      return arr[Math.floor(next() * arr.length)] as T;
    },
    gauss: () => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return self;
}

export type Noise2 = (x: number, y: number) => number;

const GRAD: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071, 0.7071],
  [-0.7071, 0.7071],
  [0.7071, -0.7071],
  [-0.7071, -0.7071],
];

/** Seeded 2D gradient noise, roughly -1..1, smooth, with unit feature size. */
export function noise2(seed: string | number): Noise2 {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    const t = p[i] as number;
    p[i] = p[j] as number;
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255] as number;

  const dot = (ix: number, iy: number, dx: number, dy: number): number => {
    const g = GRAD[(perm[(ix & 255) + (perm[iy & 255] as number)] as number) & 7] as readonly [
      number,
      number,
    ];
    return g[0] * dx + g[1] * dy;
  };

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = dot(x0, y0, fx, fy);
    const b = dot(x0 + 1, y0, fx - 1, fy);
    const c = dot(x0, y0 + 1, fx, fy - 1);
    const d = dot(x0 + 1, y0 + 1, fx - 1, fy - 1);
    const top = a + (b - a) * u;
    const bot = c + (d - c) * u;
    const n = (top + (bot - top) * v) * 1.5;
    return n < -1 ? -1 : n > 1 ? 1 : n;
  };
}

/** Fractal sum of a noise, normalised back to roughly -1..1. */
export function fbm(
  noise: Noise2,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // Offset each octave so their lattices do not line up.
    sum += amp * noise(x * freq + o * 17.3, y * freq - o * 9.1);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
