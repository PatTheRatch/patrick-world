// Ways: the tracks between places that share how they were built.
//
// A declared link is a fact someone stated. A way is an inference: two places that both have
// real work and use some of the same methods are joined, each to its nearest such neighbour,
// so the country gets a sparse road network instead of a line from everything to everything.
// Ways are marked as inferred (their id starts with `way:`) and never graded above a track
// unless both ends have grown and share a good deal.

import type { LinkState, PlaceState } from './types';

const worked = (p: PlaceState) => p.commits > 0 && p.liveliness !== 'ruins';
const grown = (p: PlaceState) => p.rank === 'town' || p.rank === 'city' || p.rank === 'major';

function shared(a: PlaceState, b: PlaceState): string[] {
  const mine = new Set(a.features.flatMap((f) => f.methods));
  const out = new Set<string>();
  for (const f of b.features) for (const m of f.methods) if (mine.has(m)) out.add(m);
  return [...out].sort();
}

/**
 * A minimum spanning forest over places that share at least one method, by distance.
 * Deterministic, and it skips any pair that already has a declared link.
 */
export function inferWays(places: PlaceState[], declared: LinkState[]): LinkState[] {
  const nodes = places.filter(worked).sort((a, b) => (a.id < b.id ? -1 : 1));
  const linked = new Set(declared.map((l) => (l.a < l.b ? `${l.a}~${l.b}` : `${l.b}~${l.a}`)));
  const edges: { a: PlaceState; b: PlaceState; d: number; methods: string[] }[] = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const methods = shared(a, b);
      if (methods.length === 0) continue;
      const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      // The more two places have in common, the shorter the road feels.
      edges.push({ a, b, d: d / (1 + 0.15 * (methods.length - 1)), methods });
    }
  edges.sort((x, y) => x.d - y.d || (x.a.id < y.a.id ? -1 : 1) || (x.b.id < y.b.id ? -1 : 1));

  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  // Declared links already join their ends.
  for (const l of declared) {
    if (parent.has(l.a) && parent.has(l.b)) parent.set(find(l.a), find(l.b));
  }

  const ways: LinkState[] = [];
  for (const e of edges) {
    const ra = find(e.a.id);
    const rb = find(e.b.id);
    if (ra === rb) continue;
    const key = `${e.a.id}~${e.b.id}`;
    if (linked.has(key)) continue;
    parent.set(ra, rb);
    ways.push({
      id: `way:${key}`,
      a: e.a.id,
      b: e.b.id,
      kinds: ['related'],
      grade: grown(e.a) && grown(e.b) && e.methods.length >= 3 ? 'road' : 'track',
      formedAt: e.a.foundedAt > e.b.foundedAt ? e.a.foundedAt : e.b.foundedAt,
      sharedMethods: e.methods,
    });
  }
  return ways;
}

export const isWay = (link: { id: string }) => link.id.startsWith('way:');
