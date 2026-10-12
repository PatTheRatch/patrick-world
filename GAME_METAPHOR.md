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
| Two things being related | A **road** | A link event, or shared wards/techs |
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

## What is deliberately absent

No score. No level-up moment. No streak. No currency. No achievements. No notifications. No
prompt to come back. Nothing in the world rewards opening the app; it only reflects what
Patrick did elsewhere.
