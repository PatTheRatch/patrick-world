# Patrick's World

Projects and ideas as a world you can explore, drawn as a survey atlas that is still being
made. Projects are towns, features are buildings, skills are the atlas's Key of Methods, and
the past is an earlier edition of the same sheet.

Everything on the map is derived from an append-only log of things that happened. Nothing has
a status field.

## Run it

```sh
npm install
npm run dev        # http://localhost:5199
npm run check      # typecheck, tests, production build
npm run sync:github  # read your repositories (via the gh CLI) into public/data/github.json
```

With a GitHub record present the app shows your real repositories. `?world=specimen` shows the
fictional specimen world instead. The record is private, git-ignored, and left out of builds.

### Which repositories, and whose work

By default the sync reads the repositories your `gh` accounts own, and counts your commits
(and coding agents') as the work. For a team's repositories, name them and say that
everyone's work counts:

```sh
# Every repository of an organisation, as a team's map
npm run sync:github -- --orgs acme --no-owned --everyone --skip-archived

# Or just the ones you name
npm run sync:github -- --repos acme/api,acme/web --no-owned --everyone

# GitHub Enterprise Server
npm run sync:github -- --host github.acme.example --orgs acme --no-owned --everyone
```

| Flag | Does |
|---|---|
| `--orgs a,b` | Adds every repository of those organisations that your account can see |
| `--repos o/a,o/b` | Adds those repositories |
| `--no-owned` | Leaves out the repositories your accounts own |
| `--skip-archived` | Leaves out archived repositories |
| `--everyone` | Counts every person's commits as work. Bots are still left out. The sheet says so. |
| `--host name` | Reads a GitHub Enterprise Server host instead of github.com |
| `--fresh` | Asks again about every repository (see below) |

A repository nothing has been pushed to since the last sync is taken from the last record and
not asked about again. GitHub allows about 5,000 calls an hour and a repository costs dozens,
so a first sync of a large organisation will stop at the limit and say so: run it again
later and it carries on from where it stopped. Issues and other things that change without
a push are refreshed only with `--fresh`.

A repository that carries a `patrick-world.json` at its root is drawn from what that file says
(its features, what is planned, its region, its links) and not from guesses. This repository's
own [patrick-world.json](patrick-world.json) is the example; the format is in
[DATA_MODEL.md](DATA_MODEL.md). The file must be pushed before a sync can see it.

### Founding a city

The file does not have to be written by hand. `skills/patrick-world-init/` is a questionnaire
any coding agent can run: Claude Code, GitHub Copilot or Codex. Run in a repository, it
surveys the code, asks about what the code cannot show (what the project is, what is planned,
what works, what it connects to), writes `patrick-world.json` and checks it. Run it again
later to bring a city up to date.

Install it once per machine, and it is available in every repository there:

```sh
npm run install:skill                     # every agent that is set up on this machine
npm run install:skill -- --tool copilot   # or name one: claude, copilot, codex
npm run install:skill -- --dry-run        # see where it would go first
```

Then, in the repository you want on the map, ask your agent to "set this repository up for
Patrick's World", or start the skill by name (`/patrick-world-init`; in Codex,
`$patrick-world-init`). Run the install again after pulling this repository to refresh the
copy, or install with `--link` to keep it in step automatically.

Copilot in VS Code alone may not have created `~/.copilot`, in which case the first command
skips it: name it with `--tool copilot`. If your agent has no skills support at all (some
IDE chats do not yet), tell it: "Read `<this checkout>/skills/patrick-world-init/SKILL.md`
and follow it for this repository." The folder is laid out as the Agent Skills standard
expects (`skills/<name>/SKILL.md`), so once this repository is pushed the usual installers
should work on it too, without a checkout: `gh skill install` and `npx skills add`. Neither
has been tried here.

The skill needs only git and Node 18 or later on the machine; the `gh` CLI is optional. It
carries its own copies of the definition reader and the map's regions and methods. After
changing either here, run `npm run sync:skill` (a test fails until you do).

Agents working in *this* repository read [AGENTS.md](AGENTS.md). Codex and Copilot read it
directly; `CLAUDE.md` and `.github/copilot-instructions.md` are one-line pointers to it for
the tools that look for those names.

## The new world (a mockup, for now)

The survey atlas this app draws is being replaced. The chosen direction is two views of one
world: a small lit **board** that shows every project at once and the roads between them, and
a **bay** at dusk where you arrive at one project and see its skyline and the bridges to its
neighbours. It exists as a working mockup in `mockups/`, beside the app, until it is built
into `src/` (PLAN.md, Stage 14).

```sh
npm run world          # export your projects, build the pages, and serve them on this machine
```

Then open http://localhost:5290/world.html (a fictional specimen) or
http://localhost:5290/world-mine.html (your own projects, from the last `sync:github`). Add
`?hour=21` to see either after dark. On the board: drag to turn it, scroll to come closer,
click a project, then **Go down to it**.

The three steps separately: `npm run world:export` writes `public/data/world.json` from the
last sync; `npm run world:build` draws it into `mockups/out/`; `npm run world:serve` serves
that folder. Both of those places are private and git-ignored: a page built from your own
projects carries their names.

Your own projects will look sparse and unconnected until their repositories carry a
`patrick-world.json`. GitHub alone cannot say what connects to what, what is planned, or
what a feature is called.

## Getting around

| | |
|---|---|
| Drag, scroll | Pan, zoom |
| Click a place | Select it; its survey note appears |
| Double-click a place, or `Enter` | Go in |
| Click a building | Its note: stage, storeys, methods |
| `Esc` | Step back out one scale |
| `0` | The whole sheet |
| `K` | The Key, and the Key of Methods |
| Drag the dial, `[` `]` | Turn the edition back and forward |
| `N`, or double-click open ground | Mark a new site |
| Arrow keys | Move between places |

Useful links while developing: `?still` (no motion), `?perf` (frame and derive timings),
`?at=2025-03-01` (open on an edition), `?go=boxout-fantasy&close`,
`?go=boxout-fantasy/boxout-fantasy.espn-sync`, `?key`, `?method=typescript`.

## Read next

- [HANDOFF.md](HANDOFF.md): what exists, what is mocked, what to do next.
- [PRODUCT.md](PRODUCT.md), [GAME_METAPHOR.md](GAME_METAPHOR.md),
  [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md): what it is and why it looks like this.
- [WORLD_MODEL.md](WORLD_MODEL.md), [DATA_MODEL.md](DATA_MODEL.md),
  [ARCHITECTURE.md](ARCHITECTURE.md), [INTERACTION_MODEL.md](INTERACTION_MODEL.md): how it works.

The specimen world is fictional. The GitHub world is yours, with stages inferred from commit
history until features have build plans.
