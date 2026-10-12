// A scale test: the fixture history copied many times over, scattered across the sheet.
// Only used with `?stress=N`. It makes a crowded, meaningless world on purpose.

import type { Catalogue, WorldEvent } from '../types';

export function stressEvents(base: WorldEvent[], copies: number, catalogue: Catalogue): WorldEvent[] {
  const out: WorldEvent[] = [];
  let s = 0x9e3779b9;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const { width, height } = catalogue.size;
  for (let c = 1; c <= copies; c++) {
    const tag = `~${c}`;
    const moved = new Map<string, { x: number; y: number }>();
    for (const e of base) {
      const copy = { ...e, id: e.id + tag } as WorldEvent;
      if ('place' in copy) copy.place += tag;
      if ('feature' in copy && copy.feature) copy.feature += tag;
      if (copy.type === 'link.formed') {
        copy.a += tag;
        copy.b += tag;
      }
      if (copy.type === 'place.founded') {
        const at = { x: 300 + rand() * (width - 600), y: 300 + rand() * (height - 600) };
        moved.set(copy.place, at);
        copy.position = at;
        copy.name = `${copy.name} ${c + 1}`;
      }
      out.push(copy);
    }
  }
  return out;
}
