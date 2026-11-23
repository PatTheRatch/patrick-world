# Data model

Source of truth: `src/world/types.ts`. This document explains it. If the two disagree, the
code is right and this file is stale.

## Layers

| Layer | Lives in | Stored? | Purpose |
|---|---|---|---|
| Events | `WorldEvent[]`, `BuildEvent[]` | **Yes: the only stored thing** | Facts, with date and source. Plans are carried in events. |
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
| `place.founded` | place id, name, region, position, note | A new place exists. Position is fixed here. |
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

## Build events

Defined in `src/world/build.ts`. They join the same log and are derived the same way. Build
events carry a date-time, not a day: a session is a matter of minutes.

| Event | Carries | Means |
|---|---|---|
| `plan.written` | the whole plan, its revision, author, `accepted` | A plan was drafted or revised. Only an accepted revision is the plan. |
| `blocker.raised` / `blocker.cleared` | blocker id, reason / resolution | Something stands in the way, or no longer does. |
| `session.started` / `session.ended` | session id, builder, plan revision / outcome | A builder began or stopped work. |
| `step.started` / `step.completed` | session, step id | Progress through the plan. |
| `file.changed` | session, path, lines added and removed | Effort, and a check against what the plan predicted. |
| `test.run` | session, command, passed, failed | A test run was observed. Not a verdict on a criterion. |
| `agent.message` | session, text | Something the builder said. Kept for the record; changes nothing. |
| `verification.started` | session | Checking has begun. |
| `criterion.checked` | criterion id, revision, `passed`, evidence, who checked | A verdict on one acceptance criterion. The only thing that can make a feature done. |
| `build.completed` | session | The builder believes it is finished. A report, not a conclusion. |
| `scaffold.written` | place, the scaffold, author, `accepted` | An idea was worked up. |
| `idea.pursued` | place, which MVP entries to stake | Patrick decided to build it. Stakes lots. |

The brief's event names map onto these: `session_started`, `task_started` (`step.started`),
`task_completed` (`step.completed`), `file_changed`, `test_run`, `test_passed` and `test_failed`
(one `test.run` with counts), `blocker` (`blocker.raised`), `agent_message`,
`verification_started`, `build_completed`.

### The plan

```ts
interface BuildPlan {
  place: string; feature: string; revision: number;
  objective: string;
  criteria: { id; statement; verification: { kind: 'command' | 'manual' | 'review'; how } }[];
  steps: { id; title; detail?; after?: string[]; touches?: string[] }[];
  dependsOn: string[];        // 'place/feature', may cross places
  verification?: string[];    // checks beyond the criteria
  notes?: string;
}
```

Completion state is not a field. It is `deriveBuild(events, isDone)`, which returns the stage,
steps finished, criteria passed and failed, open blockers, outstanding dependencies, the active
session, and a plain sentence saying why the stage is what it is.

### Where build events live today

`src/app/builds.ts` keeps recorded build events per sheet in local storage and is also the
manual builder. `src/world/buildlog.ts` (`overlayBuilds`) lays build state over the derived
world for any edition. The specimen's scripted build is `src/world/fixtures/builds.ts`.

### Stage migration

The prototype's `FeatureStage` (concept, planned, designed, building, working, mature) predates
this. The mapping when the two are joined:

| Prototype | Build model |
|---|---|
| concept | idea |
| planned | specified |
| designed | planned / ready |
| building | building |
| (none) | verifying |
| working | done |
| mature | done, plus the derived "mature" quality |

`feature.staged` then stops being a way to move a feature and remains only as an **inferred**
stage for features with no plan, emitted by adapters that cannot see plans (GitHub).

## The builder boundary

```ts
interface BuilderAdapter {
  readonly id: BuilderId;                // 'manual' | 'claude-code' | 'codex' | 'cursor' | …
  readonly label: string;
  available(): Promise<{ ok: boolean; why?: string }>;
  start(brief: BuildBrief, report: (e: ExecutionEvent) => void): Promise<BuildSession>;
  resume?(session: string, report: (e: ExecutionEvent) => void): Promise<BuildSession | null>;
}
```

An adapter translates one tool's output into `ExecutionEvent`s and nothing else. What each
would do:

| Builder | Starts work by | Reports from |
|---|---|---|
| Manual | Opening a checklist in the building's note | Patrick ticking steps and recording checks |
| Claude Code | Launching the CLI headless with the brief as its prompt | Its streamed JSON: tool calls become `file.changed` and `test.run`; a small reporting tool or hook gives `step.*` |
| Codex | Launching its CLI the same way | Its event stream, mapped the same way |
| Cursor | Opening the workspace with the brief written to a file | File-system watching and git, plus whatever its agent exposes |

Rules an adapter must keep:

1. **Report, never conclude.** It may emit `build.completed`. It may not emit a passing
   `criterion.checked` for a `manual` or `review` criterion on work it did itself.
2. **Command criteria are run by the world, not taken on trust.** The world runs the command (or
   has a neutral runner do it) and records the verdict with the output as evidence.
3. **Stable event ids,** so a resumed or replayed session never double counts.
4. **No state of its own that matters.** If the adapter's process dies, the log still says
   exactly where the build stands.

## The Patrick OS boundary

Two directions, both explicit, neither a shared database:

| Direction | Mechanism | Carries |
|---|---|---|
| Patrick OS → World | A `WorldSource` (see above) | Suggested sparks (`place.founded` with origin `patrick-os`), notes, context for a scaffold or a brief |
| World → Patrick OS | A `WorldObserver`: a subscriber to the event log, filtered to meaningful events | Places founded and pursued, plans accepted, sessions started and ended, features done, places abandoned |

A suggestion from Patrick OS enters as a spark like any other and can be ignored. An observer
receives events after they are recorded and cannot veto or alter them. Either product can be
replaced, or absent, without the other noticing more than silence.

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

### The GitHub adapter

Built. Three parts, so that fetching, meaning and drawing stay apart:

| Part | Does |
|---|---|
| `scripts/github-fetch.mjs` (`npm run sync:github`) | Reads repositories, commits, languages, releases and per-directory history through the `gh` CLI, read-only, and writes `public/data/github.json`. No interpretation. The file is git-ignored and stripped from production builds. A repository nothing has been pushed to since the last record is taken from that record, so a large sync stopped by the rate limit resumes on the next run. |
| `scripts/local-fetch.mjs` (`npm run sync:local`) | Writes the same record from clones on this machine, through git alone, for repositories on any host or none. No token, no network. The owner is known by name and e-mail, not by account; e-mail addresses are not recorded. A clone has no description, issues or archived flag. |
| `src/world/sources/github/transform.ts` | A pure function from that record to events. Every rule is a named constant at the top of the file. |
| `src/world/sources/github.ts` | A `WorldSource` that loads the record. When it is present the world is GitHub plus manual marks; the specimen is never mixed in. `?world=specimen` shows the fiction. |

What it infers, and how far to trust it:

| Thing | Rule | Trust |
|---|---|---|
| A place | One per repository owned; with `--orgs` and `--repos`, one per repository named | High |
| Work | Commits by the owner, and by coding agents in the owner's repositories, per week. Each commit is logged against one feature only. In a record made with `--everyone` (a team's map), every person's commits; bots never count. | High |
| A feature | A directory inside a source root, or at the top level | **Low.** A directory is not a capability. |
| `building` | The feature's first commit | Medium |
| `working` | Enough commits over enough weeks, and then a release, a three-week pause, or simply sustained work | **Low.** "Stopped" and "busy for three weeks" both count. |
| `mature` | Returned to in three separate bursts over six months | Low |
| Region | Keywords in the name, description and topics | **Low.** To be replaced by where he puts it. |
| Methods | The repository's languages, on every feature | Low |
| Links | Not inferred. Drawn only where a city's own definition declares them (below). | |
| Users | Not inferred. GitHub does not evidence them. | |

Every inferred stage is a stand-in until the feature has a build plan. The cartouche says so.

### A city's own definition

Built. A repository may carry `patrick-world.json` at its root, and where it does the two
low-trust rows above (features, stages) and the region guess are set aside for that repository.
The format and its reader are `src/world/definition.ts`; this repository's own file is the
worked example.

| The file says | Which replaces |
|---|---|
| `id` | Nothing: it is the handle other cities' links point at. The place id stays `gh-owner-repo`. |
| `name`, `what` | The humanised repository name and its GitHub description |
| `region` | The keyword guess, when the map has that region |
| `features[]`: `id`, `name`, `kind`, `stage`, `paths`, `ward`, `methods`, `note` | Directories as features. A feature with no `paths` is intended and has no code. An empty list keeps the directory guess. |
| `links[]`: `to`, `kind`, `carries` | Nothing was inferred. `to` is another city's `id`, or failing that its repository name. `kind` is one of the world's, or `fed-by`: `feeds` told from the receiving end. |

Three rules hold it together:

- **Fact beats claim, claim beats inference** (`settleStage`). Commits on a feature's paths are
  a fact, so a feature the file still calls planned is drawn as building. Whether work amounts
  to `working` or `mature` is only ever inferred, so there the file wins in both directions.
- **The file's git history is the plan's history.** The sync records the file at every commit
  that touched it. A claim is dated by the commit that first made it, so the edition dial can
  be turned back past it and a lot never moves when the file is edited.
- **Repositories never read each other.** Each carries its own file and the sync reads them
  all. A link to an id nobody answers to is reported and not drawn.

What only the file says is emitted with `source: 'declared'`; work and the stages commits date
stay `source: 'github'`. A file that does not read is refused whole and the city stays guessed
at; the sync's summary and the browser console say why.

The file is usually written by the questionnaire in `skills/patrick-world-init/`, a skill any
of Claude Code, GitHub Copilot or Codex can run, which also checks the file the way the sync
will read it. The skill carries a type-stripped copy of the reader, made from
`src/world/definition.ts` by `npm run sync:skill` and held in step by `src/skill.test.ts`.

Adopting a definition re-surveys that city once: its features change from directories to the
named ones, so their lots are laid out afresh, and a declared region can move the place. Manual
marks and build plans made against the old directory features do not carry over.

## Storage today

Nothing is persisted except manual events, in local storage under one key. The fixture world is
generated in code. There is no server.

## Known gaps

- No `place.merged` event yet. The plan: emit it with `into`, after which the absorbed place
  stops accepting work and its buildings are redrawn as an annexed ward of the surviving city.
- No event for moving a feature between places.
- No schema version on events. Add one before any real data is written.
- `WorldObserver` is declared in `src/world/build.ts`; nothing calls it yet.
- Build events use date-times while world events use days; the merged log needs one ordering
  rule (date-time where present, end of day otherwise).
- Idea origin is specified on scaffolds; `place.founded` needs an `origin` field to match.
