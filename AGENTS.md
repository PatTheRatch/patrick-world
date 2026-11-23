# Working in this repository

This file is for any coding agent (Claude Code, GitHub Copilot, Codex) and any person new to
the code. It says what the project is, how to run it, and the rules that are easy to break
without noticing.

## What this is

Patrick's World is a map of one person's projects, drawn as a survey atlas. Each repository
is a city, each thing a project does is a building, and how finished a building is shows in
how it is drawn. It runs in the browser with no server.

The docs are the design. Read the one that covers what you are changing:

| | |
|---|---|
| [PRODUCT.md](PRODUCT.md) | What it is for, and what it is not |
| [WORLD_MODEL.md](WORLD_MODEL.md) | Places, features, ranks, stages |
| [DATA_MODEL.md](DATA_MODEL.md) | Events, sources, the GitHub adapter, a city's own definition |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Why Canvas, why Preact, how the layers sit |
| [DESIGN.md](DESIGN.md), [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md) | How it looks and why |
| [PLAN.md](PLAN.md) | What is built and what is next. Tick boxes as work lands. |

## Commands

```sh
npm install
npm run dev          # http://localhost:5199
npm run check        # typecheck, tests, production build. Run before you say you are done.
npm test             # tests only
npm run sync:github  # read repositories through the gh CLI into public/data/github.json
npm run sync:skill   # refresh the questionnaire skill's copies after changing what they copy
npm run world        # export, build and serve the mockup of the new world (see mockups/)
```

Node 22.18 or later (the scripts load TypeScript directly). The `gh` CLI, signed in, for the sync.

## Layout

| Path | Holds |
|---|---|
| `src/world/` | The model. Events, `derive`, thresholds, sources. No DOM. |
| `src/world/definition.ts` | The format of `patrick-world.json` and its reader |
| `src/world/sources/github/` | GitHub's record turned into events (`transform.ts`), declared cities (`declared.ts`) |
| `src/plan/` | Geometry: terrain, town plans, roads |
| `src/render/` | Canvas drawing. Consumes plain geometry. |
| `src/app/` | Preact surfaces and the store |
| `src/understanding/` | Advisory readings of what each project is |
| `scripts/` | Node scripts: the sync, the skill sync |
| `skills/patrick-world-init/` | The questionnaire that writes a repository's `patrick-world.json` |
| `mockups/` | A working mockup of the new world (a board and a bay) that will replace `src/render/`. Plain JavaScript, built by `mockups/build.mjs` into `mockups/out/`. |
| `public/data/`, `mockups/out/` | **Private.** The owner's GitHub record, the world exported from it, and pages built from it. Git-ignored. |

## Rules

**1. Sources report facts. `derive` decides what they mean.** The world is an append-only
event log and one pure function, `derive(events, catalogue, asOf)`. Nothing derived is ever
stored: no rank, no stage, no liveliness. If you find yourself adding a status field, add an
event instead. Turning the map back in time is `derive` with an earlier date, so it must
give the same answer every time.

**2. Position is permanent.** A place stands where it was founded and a feature keeps its
lot. Lots follow the order features were first known, so never change how an existing event
is dated or ordered without checking what moves. The tests named "never moves" guard this.

**3. Nothing on the map is invented.** A fact comes from a source. An inference is labelled
as one, in code and on screen. An owner's claim is marked `source: 'declared'` or `manual`.
The order of trust is: fact beats claim, claim beats inference (`settleStage` in
`src/world/definition.ts`). Understandings in `src/understanding/` are advisory and are
never written back to the log.

**4. Private data stays private.** `public/data/` holds real repository names, commit
history and README text, and `mockups/out/` holds pages built from them. Do not commit it, do not paste its contents into a commit message,
a test, a fixture or a reply, and do not send it to any outside service. Tests that read it
must pass when it is absent.

**5. One place for each kind of number.** Thresholds in `src/world/thresholds.ts`, inference
rules in `INFERENCE` at the top of `transform.ts`, colours in `src/render/palette.ts`. Do not
write a tunable number anywhere else.

**6. Some files must stay free of imports.** `src/world/definition.ts` and
`src/understanding/documents.ts` are loaded directly by Node scripts, so they may import
types only. Each says so at its top.

**7. Some things exist in more than one copy.**

- The rule for which directories stand in for features lives in
  `src/world/sources/github/transform.ts`, `scripts/github-fetch.mjs` and
  `skills/patrick-world-init/scripts/lib.mjs`. Change all three. A test checks the skill's
  copy against the transform's; nothing checks the fetch script's.
- The skill carries a type-stripped copy of `definition.ts` and a copy of the map's regions
  and methods. After changing `definition.ts` or the catalogue, run `npm run sync:skill`.
  `src/skill.test.ts` fails until you do.

**8. The skill must run anywhere.** `skills/patrick-world-init/` is copied into other
people's tools on other machines. Keep its scripts plain JavaScript with no dependencies,
read-only, and its `SKILL.md` free of anything only one agent understands.

## Conventions

- **Tests** are Vitest, beside the code as `*.test.ts`. Name them as plain sentences about
  behaviour ("holds back a feature the commits would call finished"). Rendering has no pixel
  tests; check drawing changes by eye in the app.
- **One test is timing-based** ("derives 20,000 events in under 15 ms") and can fail on a
  busy machine. Rerun before treating it as a regression.
- **Comments say why**, in plain words, and a file opens with what it is for. Match the
  voice of the file you are in.
- **Dependencies**: four at runtime. Do not add one without a reason you would defend.
- **Docs move with the code.** A change to the model updates DATA_MODEL.md; finished work
  ticks its box in PLAN.md.
- **Commits** read `Area: what changed` ("Evidence: read the documents a README points
  to"). Commit or push only when asked.
