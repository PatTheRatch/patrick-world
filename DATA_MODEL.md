# Data model

Source of truth: `src/world/types.ts`. This document explains it. If the two disagree, the
code is right and this file is stale.

## Layers

| Layer | Lives in | Stored? | Purpose |
|---|---|---|---|
| Events | `WorldEvent[]` | **Yes: the only stored thing** | Facts, with date and source |
| Catalogue | `MethodDef[]`, `RegionDef[]` | Yes, static | Vocabulary the events refer to |
| World state | `WorldState` | No: derived per edition date | What the facts mean |
| Plans | `CityPlan`, `Terrain` | No: derived, cached | Geometry |

## Events

Every event has:

```ts
interface EventBase {
  id: string;        // unique, stable
  at: string;        // ISO date (day precision is enough)
  source: Source;    // 'fixture' | 'manual' | 'github' | 'patrick-os' | 'deploy' | 'analytics'
}
```

| Event | Carries | Means |
|---|---|---|
| `place.founded` | place id, name, region, position, note, `near?` | A new place exists. Position is fixed here. |
| `place.noted` | place, note | A further thought about a place. Turns a spark into a site. |
| `place.renamed` | place, name | The name changed. Old names stay in history. |
| `place.abandoned` | place, note | A decision to stop. |
| `feature.proposed` | place, feature id, name, kind, `ward?`, methods, note | "I want this to have authentication." |
| `feature.staged` | place, feature, stage | The feature reached a stage. |
| `work.logged` | place, `feature?`, commits, `hours?` | Work happened in the week ending `at`. |
| `release.shipped` | place, name, `feature?` | Something went out. Makes a landmark. |
| `traction.measured` | place, users, `revenue?` | A measurement, not a running total. |
| `link.formed` | a, b, kind, `carries?` | Two places are connected. |

`work.logged` is deliberately coarse: one event per place (or feature) per week. Individual
commits are a source's business, not the world's. An adapter aggregates before emitting.

### Enumerations

- `FeatureStage`: `concept` → `planned` → `designed` → `building` → `working` → `mature`
- `FeatureKind`: `frontage` · `works` · `reservoir` · `observatory` · `utility`
- `LinkKind`: `related` · `shares` · `feeds` · `split-from`
- `Rank`: `spark` · `site` · `outpost` · `settlement` · `town` · `city` · `major`
- `Liveliness`: `building` · `settled` · `quiet` · `dormant` · `ruins`
- `MethodLevel`: `unknown` · `noted` · `practised` · `fluent` · `mastered`

## Derived state

```ts
derive(events: WorldEvent[], catalogue: Catalogue, asOf: string): WorldState
```

Pure and deterministic. Events after `asOf` are ignored, which is all time travel is.

`WorldState` holds, per place: name, region, position, rank, liveliness, heat, founding date,
last work date, totals (commits, active weeks), users, its features (each with stage, storeys,
progress, last work date, heat, build order), its releases, and a monthly work series for the
history strip. It also holds the derived links (with a build-out level) and methods (with level,
evidence, and the places that used them).

## The adapter boundary

Everything outside the world reaches it through one interface:

```ts
interface WorldSource {
  readonly id: Source;
  readonly label: string;
  /** All events this source knows about. Idempotent: same ids every call. */
  load(): Promise<WorldEvent[]>;
  /** Optional: push events as they happen. Returns an unsubscribe function. */
  subscribe?(onEvents: (events: WorldEvent[]) => void): () => void;
}
```

The app merges every registered source into one log, de-duplicates by event id, sorts by date,
and derives. Two sources exist today:

- `FixtureSource`: the synthetic world.
- `ManualSource`: what Patrick adds in the app, kept in the browser's local storage.

### What a Patrick OS adapter would do

Patrick OS is expected to hold entities (projects, ideas, notes) and events about them. An
adapter's whole job is translation:

| Patrick OS has | Adapter emits |
|---|---|
| A new idea or project entity | `place.founded` (position chosen by the layout helper, then stored) |
| A note attached to one | `place.noted` |
| A planned capability | `feature.proposed` |
| A status change it observed | `feature.staged` |

Three things an adapter must respect:

1. **Stable ids.** The same real-world fact must produce the same event id every time, or it
   will be double counted.
2. **Positions are permanent.** A founding event's position is assigned once and stored on the
   Patrick OS side (or in a small position ledger here). The world never re-lays-out.
3. **Facts, not conclusions.** The adapter must not compute rank or liveliness. If Patrick OS
   thinks a project is "stalled", that is not an event; the absence of work events already
   says it.

### What a GitHub adapter would do

Read commit history per repository, bucket by week, emit `work.logged`. Map paths or labels to
features where a mapping exists; otherwise log work against the place alone. Tags and releases
become `release.shipped`. It needs a small mapping file (repository → place, path prefix →
feature), which is the only configuration the model anticipates.

## Storage today

Nothing is persisted except manual events, in local storage under one key. The fixture world is
generated in code. There is no server.

## Known gaps

- No `place.merged` event yet. The plan: emit it with `into`, after which the absorbed place
  stops accepting work and its buildings are redrawn as an annexed ward of the surviving city.
- No event for moving a feature between places.
- No schema version on events. Add one before any real data is written.
