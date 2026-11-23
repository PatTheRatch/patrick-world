---
name: patrick-world-init
description: Put this repository on the map of Patrick's World by writing its city definition, patrick-world.json, or bring an existing one up to date. Surveys the repository, asks its owner a short questionnaire about what cannot be seen in the code (what it is, what is planned, what works, what it connects to), writes the file and checks it. Use when asked to init, set up, add or update a repository for Patrick's World.
compatibility: Works in any coding agent that can read files and run shell commands (Claude Code, GitHub Copilot, Codex), on a repository hosted anywhere (GitHub, Bitbucket, GitLab, none). Needs git and Node 18 or later. The gh CLI is optional.
metadata:
  source: https://github.com/PatTheRatch/patrick-world
---

# Founding a city

Patrick's World is a map of one person's projects, drawn as a survey atlas. Each repository
is a **city**. Each thing the project does is a **building** in it. How finished a building
is shows in how it is drawn, from a pencilled outline to a washed block with a long shadow.
Cities stand in **countries** by subject, and **roads** run between cities that feed or
share with each other.

Left alone, the map guesses all of this from GitHub: a directory stands in for a building,
three quiet weeks reads as "finished", and nothing is ever planned or connected, because
intent leaves no trace in a commit. Those guesses are often wrong.

Your job is to replace them with the truth, by writing one file at the top of this
repository: `patrick-world.json`. The owner knows things the code cannot show. You are here
to find out what those are and write them down in a form the map can read.

Anything the owner said when they started this (a description, a list of what is planned)
is context from them: use it, and do not ask again for what it already answers.

## Where this skill's files are

Two scripts and a word list sit beside this file:

- [scripts/survey.mjs](./scripts/survey.mjs): what can be seen of a repository, as JSON
- [scripts/check.mjs](./scripts/check.mjs): reads `patrick-world.json` the way the map will
- [vocabulary.json](./vocabulary.json): the map's regions and methods (the survey prints it too)

Below, `<skill>` stands for the folder this file is in. Run the scripts by their full path,
from inside the repository you are describing (or pass that repository's path as an
argument). In Claude Code that folder is `${CLAUDE_SKILL_DIR}`; in other tools it is the
folder you loaded this file from. Both scripts only read: they need git and Node 18 or
later, install nothing and write nothing.

## How to work

- **Look before you ask.** Everything the repository can tell you, learn from the
  repository. Ask the owner only what it cannot show: what the thing is for, what is meant
  and not yet begun, what counts as finished, and what it connects to. A questionnaire that
  asks "what language is this written in?" has wasted a question.
- **Propose, then ask.** Never open with a blank question where you could offer a draft.
  "Here are the seven things I think this project does. What did I get wrong?" gets a
  better answer, faster, than "what are the features?".
- **Their words, not yours.** The city's name and its one-line description go on the map
  as written. Offer a draft in plain language, then use what they say. No marketing copy.
- **Never invent.** If you do not know whether something works, ask or leave it at the
  earlier stage. A map that flatters is worse than no map. This matters most for `working`:
  it means the owner would say it does its job today.
- **Keep it short.** Aim for one sitting of five to eight questions. If you have a tool
  for asking the user multiple-choice questions, use it and batch related questions in one
  call. If you do not, ask in plain text, a few numbered questions at a time, with your
  suggested answer for each so that "yes to all" is a possible reply.

## 1. Survey

Run the survey. It is read-only.

```
node <skill>/scripts/survey.mjs --neighbours
```

It prints JSON:

| Key | What it tells you |
|---|---|
| `definition` | Whether a `patrick-world.json` already exists and reads. If it does, go to **Bringing a city up to date** below after the survey. |
| `directories` | The directories the map takes for buildings today, each with its commit count and the days of its first and last commit. This is the guess you are replacing. |
| `documents` | Files that tend to say what is planned and what is done. **Read them.** A PLAN, ROADMAP, STATUS, TODO or HANDOFF usually answers half the questionnaire. |
| `manifests`, `fileEndings` | What it is built with. |
| `vocabulary` | The map's own regions and methods. You may only use these ids. |
| `neighbours` | The owner's other repositories: the cities this one could have roads to. It lists the repositories cloned beside this one (whatever host they are on) and, where the `gh` CLI is signed in, the owner's GitHub repositories. Missing if neither finds any; then ask for names. |
| `repositoryName` | What other cities can call this one. |

Then read: the README, the documents listed, the manifest, and enough of the source tree to
know what each directory is for. Check open issues if `gh` is available
(`gh issue list --limit 30`). You are looking for three things: what this project *does*,
in capabilities a person would name; which of those are standing and which are under way;
and what is written down as intended but has no code.

## 2. Draft the buildings

A building is **a thing the project does that its owner would name**: "trade judge",
"nightly ingest", "the league page". It is not a directory. Usually:

- Several directories are one building (`components/`, `hooks/` and `pages/` are all "the
  web app", or the parts of it a person would name).
- One directory holds several buildings (`src/` with five capabilities in it).
- Some directories are not buildings at all (config, tests, tooling nobody would point to).
- Some buildings have no directory, because they are only planned.

Most projects have between three and twelve. Fewer than three usually means you are
listing layers and not capabilities; more than fifteen usually means you are listing files.

For each building, draft:

| Field | What to put |
|---|---|
| `id` | Lower-case words joined by hyphens. **Permanent**: the building keeps its lot on the map by this id. Choose something that will still be true if the code is reorganised (`trade-judge`, not `src-judge-v2`). |
| `name` | What the owner calls it. Short. |
| `kind` | What it is, from the table below. |
| `stage` | How far along, from the table below. Your best reading, to be confirmed. |
| `paths` | The directories or files, from the repository root, whose commits are this building's work. Be specific: a commit under these paths counts as work on this building. Leave out for something with no code yet. |
| `methods` | Ids from `vocabulary.methods` that this building really uses. Leave out any you are unsure of. |
| `ward` | Optional. A named quarter of the city, when the project has clear districts ("Front office", "The yard"). Only worth it past eight or so buildings. |
| `note` | Optional. One plain sentence on what it does. |

**Kinds** decide the colour of the building:

| `kind` | It is | Examples |
|---|---|---|
| `frontage` | What people see and touch | A web app, a page, a mobile screen, a CLI's interface |
| `works` | Where the project's own work is done | An engine, core logic, a scheduler. Use this when nothing else fits. |
| `reservoir` | Where data is gathered or kept | A database, ingestion, a scraper, a pipeline, a cache |
| `observatory` | Where things are judged, analysed or learned | Models, evals, analytics, an agent's reasoning |
| `utility` | What the rest runs on | Auth, deploy, config, shared tooling, an MCP server |

**Stages** decide how it is drawn:

| `stage` | Means |
|---|---|
| `concept` | It has a name and nothing more. |
| `planned` | The owner means to build it and knows roughly what it is. |
| `designed` | How it will work has been worked out. No real code yet. |
| `building` | Work is under way. It does not yet do its job. |
| `working` | It does its job today. The owner would use it or show it. |
| `mature` | It has worked for a good while and been returned to and refined. |

One rule of the map to keep in mind, because it changes what you should write: **fact beats
claim, and claim beats inference**. If a building's paths already have commits, the map
draws it as at least `building` whatever the file says, because the commits are a fact. But
whether work amounts to `working` is the owner's call entirely, in both directions: they
can hold back something that looks finished, and call finished something that looks thin.
So do not write `planned` for something with code in it, and do not decide `working` on
your own.

## 3. Ask

Show the owner your draft first, as a short table: each building's name, what you think it
is, and the stage you guessed. Then ask. In this order, skipping anything the repository or
their arguments already answered beyond doubt:

1. **What is this, in your words?** Offer a one- or two-sentence draft and a name. Use what
   they give back for `name` and `what`.
2. **Is this the right list of buildings?** Which are missing, which are really one thing,
   which are not worth a building. Revise the draft and show it again if it changed much.
3. **Which of these work?** Ask only about the ones you could not settle. For each: is it
   doing its job today, or still being built? Offer the stages as options, a few buildings
   at a time.
4. **What is planned that has no code yet?** Offer what you found in the plan documents and
   open issues as a multi-select, and leave room for more. Each becomes a building at
   `concept`, `planned` or `designed`, with no paths. These are the buildings the map could
   never have guessed, and often the ones the owner most wants to see.
5. **Which country?** Offer the regions from `vocabulary.regions` with their notes, your
   recommendation first.
6. **What does it connect to?** Offer the likely `neighbours` as a multi-select. For each
   one chosen, settle the kind and what flows:

   | `kind` | Means |
   |---|---|
   | `feeds` | This city sends something to that one. `carries` says what. |
   | `fed-by` | That city sends something to this one. `carries` says what. |
   | `shares` | Both use something in common. `carries` says what. |
   | `related` | Same subject, nothing flowing. |
   | `split-from` | This city was carved out of that one. |

   `to` is the other city's `id` if it has a `patrick-world.json`, and otherwise its
   repository name in lower case with hyphens. A link to a project that does not exist yet
   is allowed; say that it will be reported and not drawn until that city is founded.

If an answer surprises you or contradicts the code, say so and ask once more. Do not
quietly prefer either.

## 4. Write the file

Write `patrick-world.json` at the top of the repository:

```json
{
  "version": 1,
  "id": "boxout-fantasy",
  "name": "Boxout Fantasy",
  "what": "Fantasy basketball, judged honestly. It reads my league and tells me what a trade is really worth.",
  "region": "the-court",
  "features": [
    {
      "id": "trade-judge",
      "name": "Trade judge",
      "kind": "observatory",
      "stage": "working",
      "paths": ["src/judge", "src/scoring"],
      "methods": ["python", "statistics"],
      "note": "Scores a trade from both sides."
    },
    {
      "id": "draft-room",
      "name": "Draft room",
      "kind": "frontage",
      "stage": "planned",
      "note": "An auction you can rehearse before the real one."
    }
  ],
  "links": [
    { "to": "patrick-os", "kind": "fed-by", "carries": "league context" }
  ]
}
```

- `id` is the city's handle: what other cities' links point at. Default to
  `repositoryName` in lower case with hyphens unless the owner wants another. It should
  outlive a repository rename.
- `features` may be an empty list. Then the file gives the city its name, country and
  links, and its buildings go on being guessed from directories. Offer this if the owner
  runs out of patience before the buildings are settled; it is a real improvement on its own.
- The order of `features` means nothing. Keep it readable: standing things first, planned last.
- No dates, and no comments. The file's git history dates every claim in it: a building is
  "planned since" the commit that first said so.

## 5. Check

```
node <skill>/scripts/check.mjs
```

It reads the file exactly as the map will. Exit 1 means the file does not read and the map
would refuse it whole; fix every error it lists and run it again. When it reads, it prints
the city as the map will draw it, and up to three lists:

- **Will not come out as written**: an unknown region or method, a path that does not
  exist, a building declared `working` that no commit touches. Fix these.
- **The commits say more than the file**: a building declared `planned` whose paths already
  have commits, so it will be drawn as `building`. Change the stage, or the paths.
- **Ground with work on it that no feature names**: directories with commits that no
  building claims. Their commits still count toward the city, but toward no building. For
  each, decide with the owner: does it belong to a building already listed, is it a
  building you missed, or is it scaffolding nobody would name? Only the last is fine to leave.

Run it until what remains is deliberate.

## 6. Hand back

Tell the owner, briefly: the city's name and country; how many buildings, and how many of
those are planned; the roads; and anything the check still flags, with why you left it.

Then say what makes it appear on the map: the file has to be **committed and pushed to the
repository's default branch**, and the map's next sync (`npm run sync:github`, or
`npm run sync:local` for repositories that are not on GitHub, in the patrick-world
repository) will read it. Do not commit or push unless they ask you to. In a
repository shared with other people, say so plainly: the file will be visible to everyone
with access to the repository, and adding it is their call.

## Bringing a city up to date

When the survey shows a definition that already reads, this is a visit to a standing city,
not a founding. Run the check first and work from what it says, then ask only about change:

- **Never change an existing `id`**, of the city or of a building. An id is how a building
  keeps its lot on the map and how other cities find this one. Rename with `name`.
- **Never remove a building without asking.** Something dropped from the plan is still
  history. Ask whether it was built under another name, abandoned, or is still meant.
- Walk the check's three lists with the owner.
- Ask what has changed since the file was last touched (`git log -3 --format=%as -- patrick-world.json`
  gives the day): which planned things were started, which building things now work, and
  what is newly planned.
- Leave everything else as it is. A definition that is already right needs no edits, and
  every edit to it is a dated claim in the map's history.

If the survey shows a definition that does **not** read, show the owner the errors and fix
the file with them. Keep every id that can be recovered from it.
