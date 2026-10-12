# The metaphor

The brief proposed a mapping (project = city, feature = building, and so on) and asked for it
to be improved where a stronger metaphor exists. This document is the mapping as built, what
changed from the brief, and the rule that keeps it honest.

## The rule

**Every mark on the map is a claim about something that happened.** If the claim cannot be
traced to an event (a commit, a release, a note Patrick wrote, a measured user count), the mark
is not drawn. There is no way to make a city bigger by interacting with the app.

A corollary: Patrick never sets a status. He records what happened; the world works out what
that means.

## The mapping

| Real thing | In the world | Evidence that draws it |
|---|---|---|
| Something Patrick might build | A **place** | A founding note |
| How far a place has come | Its **rank**: spark, site, outpost, settlement, town, city, major city | Thresholds on working features, weeks of work, releases, traction |
| A feature or component | A **building** on a lot | A proposal; later, work logged against it |
| How far along a feature is | How it is **drawn**: pencil, plans, hatched, washed, walled | Stage events backed by work |
| What kind of thing a feature is | The **wash colour** (frontage, works, reservoir, observatory, utility) | Declared once at proposal |
| Effort invested in a feature | **Storeys**, read as shadow length | Commits and hours logged to it |
| A coherent area of a product | A **ward**: a named group of blocks | Features sharing a ward name |
| A next step | A **staked lot**: pencilled, numbered, waiting | A proposal with no work yet |
| A release or milestone | A **landmark**: a building drawn with a heavier wall and a named plaque | A release or milestone event |
| People using it | **Dwellings** around the edge of the city | Measured users |
| Recent work | **Fresh slips** under what changed; crawling construction dashes | Work in the last few weeks |
| No recent work | **Faded ink**, chalky wash, stillness | Time since the last work event |
| A decision to stop | **Ruins** | An abandonment event, or very long silence |
| Coming back to something | **New slips over faded ink** | Work after a long silence |
| Two things being related | A **road**, graded by how much binds them | A link event; shared methods and dependencies grade it |
| Two things sharing real code or data | A **main**: a blue pipe line, lettered with what flows | A link event of kind `shares` or `feeds` |
| A skill or technology | An entry in the **Key of Methods** | Use across places, weighted by work |
| A domain of interest | A **district of the territory**: a named stretch of country | The region a place was founded in |
| Not yet thought about | **Blank paper** | Nothing |
| The past | An earlier **edition** of the atlas | The same events, replayed to an earlier date |

## What changed from the brief, and why

**Activity is paper, not animation.** The brief suggested visible activity and construction.
Constant animation over dozens of places becomes noise, and noise was explicitly unwanted. In an
atlas, recent change is physically visible as fresh correction slips, which are static, legible
from far away, and exactly true. Only work happening *now* moves.

**Dormant is faded, not asleep.** A "sleeping city" needs an icon or a mood. Faded ink needs
neither: old work simply looks old. Quiet is the absence of fresh paper.

**Skills are the Key, not a tree of unlocks.** A game tech tree is a shop: you spend to unlock.
Here nothing is spent. The Key of Methods is the atlas's legend of what this civilisation knows
how to build with, and each method is drawn more firmly the more evidence there is. Methods
still have prerequisites and are still laid out as a tree, because capability really does build
on capability. Selecting a method lights every place that used it, which is the question a
skill tree should answer: *where did I learn this?*

**Infrastructure is literal.** Shared technology between projects is drawn as a water main
between cities, lettered with what it carries ("MCP", "player data"). In the fixture world the
MCP toolkit town really does pipe to three other places.

**Users are houses.** Traction is drawn as dwellings on the edge of town, in proportion (on a
log scale) to measured users. A product nobody uses yet is a city with no suburbs, which is
an honest and slightly uncomfortable thing to see.

**The frontier is blank.** Instead of fog of war, unsurveyed country is empty paper. Terrain
detail is only drawn near places Patrick has actually founded. The map gets richer as he does
more, and sparks at the edge sit in mostly empty ground.

**Revenue is not drawn yet.** There is no honest spatial form for it that is not a currency
counter. It is carried in the data and lettered in a place's survey note; drawing it is an open
question.

## Ranks

Rank only ever rises. A town that goes quiet is a quiet town, not a village. What falls is
liveliness.

| Rank | Looks like | Requires (cumulative evidence) |
|---|---|---|
| Spark | A pencil cross and a name in graphite | A founding note |
| Site | A staked, pencilled lot or two | A second thought: a further note or a proposed feature |
| Outpost | One inked structure and a track | Any real work logged |
| Settlement | A block, a first washed building | A working feature |
| Town | Several blocks, a named street | 3 working features, 8 weeks with work in them |
| City | Wards, a landmark, a Clarendon name | 6 working features, 20 active weeks, a release |
| Major city | Many wards, dwellings, mains | 10 working features, 40 active weeks, measured traction |

Thresholds live in one file (`src/world/thresholds.ts`) and are meant to be argued with.

## Liveliness

Derived from time since last work, never set:

| State | Since last work | Drawn as |
|---|---|---|
| Building | Under 3 weeks | Fresh slips, crawling dashes on active lots |
| Settled | Under 10 weeks | Full ink, full wash, no motion |
| Quiet | Under 6 months | Ink slightly browned, washes a step paler |
| Dormant | Under 18 months | Sepia ink, chalky wash, no slips |
| Ruins | Over 18 months, or declared abandoned | Broken outlines, stains, RUINS |

A revival is not a state. It is what Building looks like on top of Dormant: bright slips on
brown ink. The contrast is the story.

## The core loop

Reviewed on 12 October 2026 with a set of game-design critique tools (core-loop and pillar
extraction, emotional canvas, unknown-unknowns prototyping, goal framing, feature
prioritisation, red-team audit, and a deliberately over-ambitious "Molyneux" lens). They were
used as critique, not as a recipe: this is a building environment, not a game. One of them, a
craft critique meant for shipped games, was used only for its first move, below.

### The skeleton, with the fiction removed

Stripped of the atlas, the first prototype is a zoomable, read-only chart of commit totals with
a date slider and three forms that append records. The only thing a person can repeatedly do
in it is look. The fiction promises a ruler building a civilisation; the system offers a
visitor reading one. That mismatch, big fiction over a thin system, is the "dashboard with a
map skin" failure the brief warned about, only better drawn. **There was no loop.** The build
model is what supplies one.

### The loop

> **Survey → Commit → Build → Prove → Stand**, and survey again.

| Step | He does | The world answers | Why he goes round again |
|---|---|---|---|
| Survey | Looks over the territory or a town | Shows what changed since he was last here, and which lots are ready | A ready lot is an itch |
| Commit | Picks a lot and says what done means | Pencil becomes plans; a dependency becomes a road | The promise is now on the map |
| Build | Builds it, or hands it to a builder | The wash rises step by step; the outline crawls while a session is open | Watching something go up |
| Prove | Runs the checks, or looks and judges | Each criterion passes or fails, on the record | The last check is the one that matters |
| Stand | Nothing | Ink wall, shadow, a date. Lots that were waiting on it become ready | The map has made its next suggestion |

The reward is not a number. It is a permanent, dated mark, and the fact that finishing one
thing visibly unblocks another. Supporting loops, which must not be mistaken for the core:

- **The idea loop:** spark → scaffold → pursue, or leave it. Feeds Commit.
- **The edition dial:** reflection. Pleasant and retrospective. It gives no reason to act.
- **The Key of Methods:** a readout. It joins the loop only where a plan touches a method he
  has never built with (see below).

### Where the loop is weak

1. **Commit is a chore before any reward.** Writing criteria and steps costs effort up front.
   If it costs more than it returns he will build elsewhere and the world goes back to being a
   viewer. So: one sentence in, an AI-drafted plan out, and accepting it moves the drawing at once.
2. **Prove is where honesty is cheapest to lose.** A manual check can be waved through. So the
   way each criterion passed is recorded and visible (pillar 2).
3. **Work done outside the loop.** He will often just code. That work must appear anyway, drawn
   as real and marked unplanned, never hidden and never nagged about.
4. **Survey has nothing to pull him in** unless the world differs from last time. "Since you
   were last here" is drawn with the slips that already exist.

## Reinforces the fantasy, or decorates it

The fantasy, in one line: *this is my country, everything standing in it is real, and I can see
what to build next.*

| Feature | Verdict | Why |
|---|---|---|
| Stage carried by drawing technique | Reinforces | It is the loop's feedback, read without words |
| Storeys and shadows | Reinforces | Effort made visible and comparable |
| Slips under recent work | Reinforces | The only honest "what changed" signal |
| Faded ink, ruins | Reinforces | Permanence, without comment |
| Blank paper for the unknown | Reinforces | And becomes stronger: see "unsurveyed ground" |
| Roads | **Decorative until they mean dependency** | Today a road is a declared relation. A road should be a real dependency between plans |
| Where a place stands | **Decorative** | Regions chosen by keyword mean nothing. Position should be where he put it |
| Key of Methods | Mostly decorative | A readout nobody acts on, until plans consult it |
| The edition dial | Reinforces permanence, not the loop | Worth keeping; not worth more investment before the loop exists |
| Dwellings for users | Reinforces, lightly | True, and rarely non-zero for a solo builder |
| Rivers, relief, margin letters | Decorative, and cheap | They make it a place. Freeze them; add no more |
| The opening time-lapse | Decorative | Fine once per session. Never a tutorial |

## What an adversary would say

Assume it failed. The most credible reasons, each with its mechanism:

- **Looked at twice, then never.** Nothing changes unless he worked elsewhere, and he already
  knows what he worked on. No information, so no reason to return. *Answer:* the loop, and
  showing what changed.
- **Plans become a tax and are abandoned,** while commits continue. The map then shows
  everything stalled at "idea" during his most productive month: it lies by omission.
  *Answer:* inferred stages stay first-class; plans are per feature and optional.
- **False precision.** A directory is not a capability. A map that looks surveyed and is wrong
  is worse than a list. *Answer:* inferred things are marked inferred; a mapping file and
  plans override the guess.
- **It becomes the project that eats the projects.** Agent orchestration is a product in
  itself. *Answer:* a builder adapter launches and listens, and never re-implements a tool's own
  interface. Patrick's World is on its own map; the map will show if it is eating the others.
- **Too many meanings in one drawing.** Seven stages, five kinds, five ages, inferred or
  planned, three kinds of proof. *Answer:* four drawn states (pencil, plans, going up,
  standing) with two small modifiers; the rest lives in the note. See the standing rule in
  PRODUCT.md.
- **Too much designed before one feature was built through it.** Three verification kinds,
  nine scaffold fields, observers. *Answer:* accepted. The prototype order in PLAN.md builds
  the smallest loop first and treats the rest as unproven.

## Pushed further, then brought back

Three provocations from deliberately over-reaching, each cut down to what is credible.

**The world remembers what you promised.** Rewriting "done" to something easier should leave a
mark. *Brought back:* revisions are already events. A building whose criteria were weakened
carries a slip for each rewrite, and its note shows what changed. Cheap, true, and slightly
uncomfortable in the right way.

**The city builds while you sleep, and you walk it in the morning.** *Brought back:* unattended
agents need sandboxing, cost limits and real verification, and are a long way off. What is
cheap is the morning: replay whatever arrived since the last visit, using the dial that exists.

**The land pushes back.** *Brought back:* two rules that are already derivable. A lot that
depends on something unfinished cannot be ready, and the road to it shows why. A plan that
leans on a method he has never built with stands on unsurveyed ground, drawn as such and
stated in the note: "uses two methods you have not built with."

Rejected outright as decoration or overpromise: simulated inhabitants, advisor characters,
other people's worlds, weather, and anything that speaks first.

## What is deliberately absent

No score. No level-up moment. No streak. No currency. No achievements. No notifications. No
prompt to come back. Nothing in the world rewards opening the app; it only reflects what
Patrick did elsewhere.
