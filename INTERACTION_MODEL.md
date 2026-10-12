# Interaction model

## Principle

The map is the interface. Every action is something you do *to the map* (go there, look
closer, mark it, turn back the date), and every answer is drawn on it. There is no mode in
which the map becomes a picture beside a form.

## The four scales

Zoom is continuous. These are the scales at which different things become legible, not screens.

| Scale | You see | You learn |
|---|---|---|
| **Territory** | The whole sheet. Cities as fields of colour, roads, blank frontier. | What matters. What is alive. How much there is. |
| **District** | A region. Towns as blocks, sparks named. | What surrounds a project. Which ideas sit near it. |
| **City** | One place fills the view. Every building. | What it is made of. What is done, underway, planned. |
| **Lot** | A few buildings. Names, numerals, build order. | The history of one feature. |

## Moving

| Input | Does |
|---|---|
| Drag | Pan, with inertia |
| Wheel / pinch | Zoom toward the pointer |
| Click a place | Select it; fly to frame it |
| Double-click a place | Fly all the way in to City scale |
| Click a building | Select it; its note appears |
| Click empty paper | Clear selection |
| `Esc` | Step back out one scale: lot → city → territory |
| `0` | Return to the whole territory |
| Arrow keys / `Tab` | Move selection between places (nearest in that direction / by rank) |
| `Enter` | Enter the selected place |
| `K` | Open the Key |
| `N` | Mark a new site at the pointer |
| `[` `]` | Step the edition back / forward a month |

Flights are eased camera moves along a zoom-out-then-in arc, so the distance travelled is felt.
Nothing ever cuts.

## Selecting: the survey note

Selecting anything pastes a **survey note** onto the sheet beside it, joined by a red leader
line. It is a slip of paper on the map, not a panel: it pans and zooms away with the thing it
describes, and it is small.

A place's note carries, in this order:

1. The name, and one line saying what it is in Patrick's own words (the founding note).
2. Where it stands, in a sentence generated from evidence: *"A city of 9 working buildings.
   Under construction now. Founded March 2024."*
3. **The strip**: one thin row of marks, a tick per month since founding, height by work.
   Gaps are visible as gaps. This is the whole history at a glance.
4. **Being built now**: features in the building stage.
5. **Staked next**: features proposed or planned.
6. For small places only, **how this could grow**: the next rung of the ladder and exactly
   what evidence would reach it. *"A working feature would make this a settlement."*

A building's note carries its name, kind, the stage ladder with its current position marked,
storeys and what they stand for, the methods it uses, and its own strip.

Nothing in a note is an input. It is a description.

## The edition dial

A thin scale along the bottom edge of the sheet, lettered with years. The red index mark is
the current edition. Drag it back and the world redraws as of that date, continuously.

- The cartouche reads *"Corrected to March 2025"* while scrubbing, and *"Current edition"* at
  the present.
- Selection, camera and notes all persist through a scrub, so you can sit over one city and
  watch it assemble.
- Places not yet founded are absent. Buildings fall back through their stages. Roads un-draw.
- A **play** control runs the edition forward from the dial's position to the present.
- While the edition is in the past the world is read-only, and the cartouche says so.

## The Key

`K`, or the Key line in the cartouche, turns the sheet over to the atlas's key page: the five
washes and the six ways a building is drawn, and below them the **Key of Methods**, laid out
by prerequisite from left to right.

Each method is drawn at its level (pencilled, inked, washed, double-ruled). Selecting one
returns to the territory with every place that used it ringed in red and everything else
knocked back, plus a note listing the evidence. The question it answers is "where did this
skill come from, and where does it show up?"

## Adding to the world

Three verbs, each a direct act on the map. Each appends events; none sets a status.

**Mark a site.** Press `N` or double-click blank paper. A pencil cross appears under the
pointer with a small slip asking for a name and one line of what it is. Enter founds a spark,
exactly there, forever.

**Stake a lot.** With a place selected, *"Stake a lot…"* in its note asks one question: what
should this have? Type "authentication". Pick which of the five kinds it is. A pencilled lot
appears at the next position in the city's growth order.

**Survey a road.** With a place selected, *"Survey a road to…"* then click another place. A
dotted line is drawn between them.

Advancing a feature's stage by hand is possible from its note ("Record: designed"), is logged
as a manual claim, and is the one place the prototype lets Patrick assert something the
evidence has not shown. With real sources connected, most stage changes should arrive on their
own.

Everything added by hand is kept in the browser and can be cleared from the cartouche.

## Feedback

- **Hover** thickens a place's outline in red and shows its name if hidden. Cursor becomes a
  pointer only over things that can be selected.
- **Press** nudges the thing under the pointer one pixel; release pastes the note.
- **New marks** are drawn by the pen, in the order a hand would draw them.
- **Stage changes** animate once: plans ink over pencil; wash floods on reaching working.

## Accessibility

- A visually hidden but real DOM index lists every place as a button, in rank order, so the
  whole world is reachable by keyboard and screen reader. Focus in the index moves the camera.
- All actions above have keys.
- Stage and liveliness are carried by line and structure, not colour alone.
- `prefers-reduced-motion`: flights become short fades, the pen and wash complete instantly,
  construction does not crawl.

## Deliberately not here

Search, filters, sort, tags, lists, tabs, settings, undo history, multi-select. Some will be
needed as the world grows. Each should have to argue its way in against "could the map answer
this instead?"
