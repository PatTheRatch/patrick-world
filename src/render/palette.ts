// The Key. Every colour drawn on the sheet is one of these inks; nothing else is allowed.

import type { FeatureKind, Liveliness } from '../world/types';

export type RGB = readonly [number, number, number];

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const INK = {
  table: hex('#141714'),
  linen: hex('#d2cfc0'),
  linenShade: hex('#c9c5b4'),
  town: hex('#dedbcd'),
  slip: hex('#efeee9'),
  black: hex('#1c1a18'),
  sepia: hex('#7b6248'),
  graphite: hex('#5d6268'),
  water: hex('#a9c1c8'),
  waterLine: hex('#5f8fa6'),
  red: hex('#c2341d'),
} as const;

export const WASH: Record<FeatureKind, RGB> = {
  frontage: hex('#d7667f'),
  works: hex('#e2ad2f'),
  reservoir: hex('#3f78ad'),
  observatory: hex('#3f9b7c'),
  utility: hex('#7f8891'),
};

export const KIND_NAME: Record<FeatureKind, string> = {
  frontage: 'Frontage',
  works: 'Works',
  reservoir: 'Reservoir',
  observatory: 'Observatory',
  utility: 'Utility',
};

export const KIND_MEANING: Record<FeatureKind, string> = {
  frontage: 'What people see and touch',
  works: 'Logic, services, machinery',
  reservoir: 'Data, storage, pipelines',
  observatory: 'Intelligence, models, research',
  utility: 'Infrastructure and plumbing',
};

/** The same inks, handed to the stylesheet, so canvas and lettering can never disagree. */
export function inkVariables(): Record<string, string> {
  const h = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  return {
    '--table': h(INK.table),
    '--linen': h(INK.linen),
    '--linen-shade': h(INK.linenShade),
    '--slip': h(INK.slip),
    '--ink': h(INK.black),
    '--sepia': h(INK.sepia),
    '--red': h(INK.red),
    '--water-line': h(INK.waterLine),
  };
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const css = (c: RGB, alpha = 1): string =>
  alpha >= 1
    ? `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`
    : `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0} / ${alpha})`;

/** How age shows: ink browns, washes go chalky. */
export interface Aging {
  /** 0 = fresh black, 1 = full sepia. */
  inkFade: number;
  /** 1 = full wash, toward 0 = a stain. */
  washStrength: number;
}

export const AGING: Record<Liveliness, Aging> = {
  building: { inkFade: 0, washStrength: 1 },
  settled: { inkFade: 0, washStrength: 1 },
  quiet: { inkFade: 0.4, washStrength: 0.8 },
  dormant: { inkFade: 0.85, washStrength: 0.5 },
  // Roofless: the walls remain, the colour has gone.
  ruins: { inkFade: 1, washStrength: 0.02 },
};

export const agedInk = (a: Aging): RGB => mix(INK.black, INK.sepia, a.inkFade);
export const agedWash = (kind: FeatureKind, a: Aging): RGB =>
  mix(INK.linen, WASH[kind], 0.25 + 0.75 * a.washStrength);
