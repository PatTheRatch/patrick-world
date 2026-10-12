// Where build events meet the world. The world is derived from its own log first; this then
// lays each feature's build state over it. A feature with a plan takes its stage from the
// plan and from what builders reported, and no longer from an inferred stage event.

import { deriveBuild, type BuildEvent, type BuildStage, type BuildState } from './build';
import type { FeatureStage, FeatureState, PlaceState, WorldState } from './types';

/** How a build stage is drawn, in the drawing vocabulary the map already has. */
const DRAWN_AS: Record<BuildStage, FeatureStage> = {
  idea: 'concept',
  specified: 'planned',
  planned: 'designed',
  ready: 'designed',
  building: 'building',
  verifying: 'building',
  done: 'working',
};

const STANDING: readonly FeatureStage[] = ['working', 'mature'];
const dayOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

export const featureRef = (place: string, feature: string) => `${place}/${feature}`;

/** Build events up to the end of the edition's day, in the order they happened. */
export function eventsAsOf(events: readonly BuildEvent[], asOf: string): BuildEvent[] {
  return events.filter((e) => e.at.slice(0, 10) <= asOf).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}

export function overlayBuilds(world: WorldState, events: readonly BuildEvent[], asOf = world.asOf): WorldState {
  const live = eventsAsOf(events, asOf);
  if (live.length === 0) return world;
  const byFeature = new Map<string, BuildEvent[]>();
  for (const e of live) {
    const ref = featureRef(e.place, e.feature);
    const list = byFeature.get(ref);
    if (list) list.push(e);
    else byFeature.set(ref, [e]);
  }

  // What a dependency needs to be: standing by inference, or done by its own plan. Plans can
  // depend on each other, so settle in a few passes.
  const standing = new Set<string>();
  for (const p of world.places) for (const f of p.features) if (STANDING.includes(f.stage)) standing.add(featureRef(p.id, f.id));
  let states = new Map<string, BuildState>();
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map<string, BuildState>();
    const isDone = (ref: string) => {
      const planned = states.get(ref);
      return planned ? planned.stage === 'done' : standing.has(ref) && !byFeature.has(ref);
    };
    for (const [ref, list] of byFeature) next.set(ref, deriveBuild(list, isDone));
    const settled = [...next].every(([ref, s]) => states.get(ref)?.stage === s.stage);
    states = next;
    if (settled) break;
  }

  const today = dayOf(asOf);
  const places = world.places.map((place): PlaceState => {
    let touched = false;
    let lastBuild: string | undefined;
    const features = place.features.map((f): FeatureState => {
      const ref = featureRef(place.id, f.id);
      const build = states.get(ref);
      if (!build) return f;
      touched = true;
      const list = byFeature.get(ref)!;
      const last = list[list.length - 1]!.at.slice(0, 10);
      if (!lastBuild || last > lastBuild) lastBuild = last;
      const stage: FeatureStage = build.stage === 'done' && f.stage === 'mature' ? 'mature' : DRAWN_AS[build.stage];
      const progress = build.stage === 'done' || build.stage === 'verifying' ? 1 : build.stage === 'building' ? Math.min(0.95, Math.max(0.05, build.progress)) : 0;
      const lastWorkAt = !f.lastWorkAt || last > f.lastWorkAt ? last : f.lastWorkAt;
      // Builder activity is work: it keeps the paper under a building fresh.
      const age = today - dayOf(last);
      const heat = Math.max(f.heat, age <= 21 ? Math.pow(0.5, age / 21) * 0.6 : 0);
      return { ...f, stage, progress, lastWorkAt, heat, build };
    });
    if (!touched) return place;
    const lastWorkAt = lastBuild && (!place.lastWorkAt || lastBuild > place.lastWorkAt) ? lastBuild : place.lastWorkAt;
    const recent = lastBuild !== undefined && today - dayOf(lastBuild) <= 21;
    const liveliness = recent && place.liveliness !== 'ruins' ? 'building' : place.liveliness;
    return { ...place, features, lastWorkAt, liveliness, heat: recent ? Math.max(place.heat, 0.5) : place.heat };
  });
  return { ...world, places };
}
