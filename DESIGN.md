---
name: Patrick's World
description: A fire-insurance survey atlas of one person's projects, still being drawn; every mark is evidence.
colors:
  surveyors-red: "#c2341d"
  wash-frontage-rose: "#d7667f"
  wash-works-chrome: "#e2ad2f"
  wash-reservoir-prussian: "#3f78ad"
  wash-observatory-viridian: "#3f9b7c"
  wash-utility-slate: "#7f8891"
  table: "#141714"
  linen: "#d2cfc0"
  linen-shade: "#c9c5b4"
  town: "#dedbcd"
  slip: "#efeee9"
  ink: "#1c1a18"
  ink-soft: "#3e3a35"
  sepia: "#7b6248"
  graphite: "#5d6268"
  graphite-lettering: "#565b61"
  water: "#a9c1c8"
  water-line: "#5f8fa6"
typography:
  display:
    fontFamily: "'Besley', 'Clarendon', Georgia, serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "'Besley', 'Clarendon', Georgia, serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Besley', 'Clarendon', Georgia, serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  remark:
    fontFamily: "'Besley', 'Clarendon', Georgia, serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "'Archivo Variable', 'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 98"
  label:
    fontFamily: "'Archivo Variable', 'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "10.5px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.13em"
    fontVariation: "'wdth' 112"
  section-caps:
    fontFamily: "'Archivo Variable', 'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 650
    letterSpacing: "0.15em"
    fontVariation: "'wdth' 116"
  field:
    fontFamily: "'Besley', 'Clarendon', Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
rounded:
  none: "0px"
spacing:
  sheet-inset: "18px"
  sheet-inset-narrow: "10px"
  slip-x: "18px"
  slip-top: "16px"
  slip-bottom: "13px"
  row-y: "5px"
  key-gutter: "40px"
components:
  slip:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px 18px 13px"
  link:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "9px 0 6px"
  link-hover:
    textColor: "{colors.surveyors-red}"
  link-disabled:
    textColor: "{colors.graphite-lettering}"
  cartouche:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px 18px 13px"
    width: "272px"
  edition-dial:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 16px 0 6px"
    height: "62px"
  edition-dial-date:
    backgroundColor: "{colors.surveyors-red}"
    textColor: "{colors.slip}"
    padding: "1px 6px 0"
  survey-note:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px 18px 14px"
    width: "304px"
  field-ruled:
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.none}"
    padding: "4px 0 4px"
  method-word:
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  method-word-hover:
    textColor: "{colors.surveyors-red}"
  method-node:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 11px"
    width: "168px"
    height: "44px"
  method-node-fluent:
    backgroundColor: "{colors.linen-shade}"
  method-node-hover:
    textColor: "{colors.surveyors-red}"
  key-sheet:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "26px 34px 30px"
---

# Design System: Patrick's World

## Overview

**Creative North Star: "The Atlas Still Being Drawn"**

The world is one sheet of a fire-insurance survey atlas, lying under a lamp, and the survey is not finished. Every building is a measured footprint; its wash says what it is, the way it is drawn says how far along it is, the paper and ink say when anyone was last there. Nothing is a status badge, because the atlas already has a native mark for every fact the product needs to state. Ground nobody has thought about is simply blank paper, lettered UNSURVEYED.

The system has two layers and one source of colour. The sheet is a Canvas 2D drawing (`src/render/`); a handful of paper slips are DOM laid over it (`src/app/ui/`, `src/app/styles.css`). Both take their inks from `src/render/palette.ts`, which hands the same values to the stylesheet at startup. The drawing vocabulary below is the design system as much as the colours and type are: a new surface extends the world by drawing in that vocabulary, not by adding chrome beside it.

It is dense where work is dense and empty where there is none. The first viewport is the whole sheet covering the window; the camera lowers toward the paper and a town resolves from a mark, to a patch of wash, to lettered buildings with storey numerals. The direction refuses three things by name: the fantasy parchment game map (scrollwork, compass flourish, burnt edges), the dark neon data globe (glows, gradients as atmosphere, particles), and the dashboard (sidebar, cards, badges, progress bars).

**Key Characteristics:**
- A true plan, never oblique or isometric; depth comes from cast shadows and stacked paper.
- Colour says kind, drawing technique says stage, paper and ink say age. The three never trade jobs.
- Saturated washes over real area on a cool buff-grey sheet; red belongs to the hand alone.
- Lettering is cartographic: a place's name is sized and weighted by its rank.
- Square-cut paper, ruled lines, no radii in the DOM.
- A place with no work in hand is perfectly still, and the stillness is information.

## Colors

A closed Key: eleven sheet inks and five washes defined once in `palette.ts`, plus two lettering tones the stylesheet darkens for small text.

### Primary
- **Surveyor's Red** (`surveyors-red`): the surveyor's own hand. Selection brackets and outlines, hover rings, the method highlight, draft marks, the leader line from a note to its subject, the dial's index and date flag, the top rule of a slip the hand has pulled out, focus rings, the caret, text selection, and the edition line when the sheet is turned back.

### Secondary
The five washes. Each fills finished buildings of one kind and appears in the DOM only as a drawing of the map (stage, wash and rank swatches).
- **Rose** (`wash-frontage-rose`): Frontage. What people see and touch.
- **Chrome Yellow** (`wash-works-chrome`): Works. Logic, services, machinery.
- **Prussian Blue** (`wash-reservoir-prussian`): Reservoir. Data, storage, pipelines.
- **Viridian** (`wash-observatory-viridian`): Observatory. Intelligence, models, research.
- **Slate** (`wash-utility-slate`): Utility. Infrastructure and plumbing.

### Tertiary
- **Chart Water** (`water`): the sea and lakes, laid flat at 62% over the sheet.
- **Water Line** (`water-line`): waterlining along the shore, rivers, lake edges, river names, and the mains laid beside roads. Lettering for a main is this ink mixed 25% toward black.

### Neutral
- **Baize Table** (`table`): the canvas clear colour and page background. Seen only where the sheet ends.
- **Linen** (`linen`): the sheet. Also the Key sheet, the paper between a made road's two lines, and the halo knocked out behind map lettering.
- **Linen Shade** (`linen-shade`): dwellings (mixed 22% toward the place's ink) and the fluent and mastered method nodes.
- **Town Ground** (`town`): the paler patch under occupied blocks at a distance; it fades out between 0.8 and 1.7 px per world unit so that close to, the only bright paper is a fresh slip.
- **Slip** (`slip`): correction paper under recent work on the sheet, and every DOM slip.
- **Black Ink** (`ink`): outlines, lettering, roads, the coast, the neat line.
- **Soft Ink** (`ink-soft`): secondary lettering on a slip.
- **Sepia** (`sepia`): what black ink ages toward; relief hachures; roads that touch a ruin.
- **Graphite** (`graphite`): pencil on the sheet. Everything not yet real.
- **Graphite, lettering** (`graphite-lettering`): the same pencil a step darker, for small text on a slip. The stylesheet records why.
- **Rule** (`ink` at 24%): hairlines between rows and sections on a slip.

Age is computed, not picked: ink is black mixed toward sepia by 0, 0, 0.4, 0.85, 1 for building, settled, quiet, dormant, ruins; a wash is linen mixed toward its colour by 1, 1, 0.85, 0.625, 0.37 for the same five states.

### Named Rules
**The Key Rule.** No colour is drawn on the sheet unless it is an ink in `palette.ts`. New colours enter there or not at all, and the stylesheet receives them from it.

**The Hand Rule.** Red marks only what Patrick is touching, drafting or reading now, and the edition under his hand. It never fills a building, never ranks, never decorates.

**The Kind-Not-Stage Rule.** A wash says what a building is. How far along it is must survive in greyscale: pencil dots, pencil line, dashed ink, hatch, full wash, heavy wall.

## Typography

**Display Font:** Besley (with Clarendon, Georgia, serif), weights 400, 400 italic, 500, 600, 700
**Body Font:** Archivo Variable, width axis (with Archivo, Helvetica Neue, Arial, sans-serif)

**Character:** A Clarendon for names and titles, the nineteenth-century map-title face, against an engineering gothic that runs from condensed numerals to wide tracked caps in one family. Besley italic is the surveyor's remark; Archivo caps are the lettering of streets, wards and actions.

### Hierarchy
- **Display** (700, 30px, 1): the Key sheet's title.
- **Headline** (700, 23px, 1.1, -0.01em): the cartouche title. 19px at 860px and below.
- **Title** (600, 19px, 1.15, -0.005em): the name at the head of a note or form. The Key's Methods heading is the same face at 700, 21px.
- **Remark** (Besley italic 400, 13.5px, 1.4): a place's own words, the edition line, hints. 12px to 12.5px for row asides and form hints.
- **Body** (Archivo 400, 13px, 1.45, width 98): running text on slips. 12.5px for tallies and Key definitions, 12px for form labels, 11px for the specimen line. Lead paragraphs cap at 68ch. Figures are tabular wherever they align.
- **Label** (Archivo 650, 10.5px, 0.13em, width 112, uppercase): lettered actions. The whereabouts line under the cartouche title is 600 at width 118 and 0.16em; dial years are 600 at 0.1em.
- **Section caps** (Archivo 650, 10px, 0.15em, width 116, uppercase): headings inside a note or the Key.
- **Field** (Besley 400, 15px): text typed into a ruled field.

Lettering on the sheet, in screen pixels:
- **Place names** (Besley, linen halo): 25, 20, 15.5, 13, 12, 11.5, 11.5 for major city, city, town, settlement, outpost, site, spark, scaled 0.92 to 1.3 with zoom. City and major: 700, caps, 0.09em. Town: 600. Settlement and outpost: 500. Site and spark: 400 italic in graphite.
- **Region names** (Archivo 500, widest, 0.62em, caps, ink at 40%): 11 to 30px, fading out on descent.
- **Ward names** (Archivo 650, wide, 0.24em, caps, 8.5 to 11.5px, on a linen halo): lettered beside the ward's bounds, parallel to its street, between 0.75 and 4.4 px per unit; they leave as the streets named for them are lettered. Only where a town has more than one ward.
- **Street names** (Archivo 500, wide, 0.34em, caps, up to 10.5px, ink at up to 55%): lettered along main streets between 3.3 and 9 px per unit.
- **Building names** (Archivo 650, condensed, 0.04em, 8.5 to 11.5px, up to three lines): ink when standing, graphite on a linen halo when not. The stage word sits beneath in Besley italic graphite.
- **Storey numerals** (Archivo 700, condensed, 8 to 11px): always in the footprint's upper-left.
- **Margin references** (Archivo 600, 9px): letters across, figures down, every 600 world units.
- **Unsurveyed** (Archivo 400, wide, 0.7em, caps, graphite at 55%); **Ruins** (Archivo 600, wide, 0.5em, 8.5px); **mains** (Archivo 600, 9.5px, 0.18em, caps, on a halo); **rivers** (Besley italic 11px, 0.08em, water-line ink).

Canvas lettering reaches Archivo's width axis through keywords, so the sheet has four widths in practice: condensed (75), normal (100), semi-expanded (112.5) and expanded (125). The DOM uses the continuous axis (70 to 118).

### Named Rules
**The Rank Rule.** The biggest words are the biggest places. A name's size, weight and case come from rank; nothing else may outshout a major city.

**The Lettering-Follows Rule.** Streets, rivers and mains are lettered along their line, kept upright; region names sit where they cross no place name, or are left off.

**The Pencil Voice Rule.** Graphite and Besley italic mean not yet real, or a remark about the thing. Black upright lettering means it stands.

## Layout

One sheet fills the window. The world is 4800 by 3200 units inside a neat line, with 86 units of paper margin beyond it. On a window wider than 640px the lowest zoom is the one at which the sheet covers the window, so the table is not seen; home frames the main landmass with 3.5% breathing room inside insets of 40, 40, 96, 40px (top, right, bottom, left), the bottom inset keeping the land clear of the dial.

Sheet furniture sits inside the window's edge at 18px: the cartouche lower-left (272px wide), the edition dial along the bottom from 308px to the right inset (62px tall), a method slip upper-left (272px), a hint top-centre. The survey note (304px) is positioned beside what it describes and tied to it by a red leader line. The Key is a second sheet turned over the first (up to 1120px, three columns of 1.15fr 1fr 1fr with a 40px gutter) on a dimmed table.

Towns are drawn larger than life from far away, up to 2.3 times at territory scale, settling to true scale at 1.2 px per unit; apparent size always grows on approach. Detail arrives by zoom: marks, then town ground and shadows (0.2 to 0.55), dwellings and inked outlines (0.3 to 0.8), pencil stages (0.5 to 1.1), ward names (0.75), building names and storey numerals (2 and up), streets (3.3). Relief belongs to the wide view and steps back to 6% as the town comes forward.

Slip rhythm is 18px left and right, 15 to 16px above, 13 to 14px below; rows are 5px above and below, divided by the rule hairline; sections are parted by a rule with 8 to 12px either side.

At 860px and below the cartouche narrows to 232px, drops its tally, and the Key becomes one column. At 640px and below the cartouche and dial stack across the bottom at a 10px inset, the note is capped at 40vh, the lower 56% of the window is reserved for them, and place names scale down to 0.66. This narrow arrangement is a courtesy, not a designed surface: the product is for a desk and a large screen.

### Named Rules
**The One Sheet Rule.** Nothing sits in a panel beside the drawing. A fact is drawn on the map or lettered on a slip tied to the thing it describes.

**The Blank Paper Rule.** Relief, woods and lettering are drawn only within reach of founded places (250 units plus 95 per rank, in three fading strengths). Beyond that the sheet is blank.

## Elevation & Depth

Depth is paper on paper and buildings in sun, never perspective. The sheet lies on the table, slips lie on the sheet, notes lie on slips, and each casts on the one below. On the canvas these shadows are hard-edged offsets, because that is how cut paper and a plan's cast shadow are drawn; DOM slips carry one soft lift.

### Shadow Vocabulary
- **Cast shadow** (canvas): each working or mature building's footprint swept along the sun direction (0.62, 0.78) by 2.1 world units per storey, all unioned into one fill of ink at 30% so overlaps never double. Arrives between 0.2 and 0.55 px per unit. Ruins cast none.
- **Correction slip** (canvas): ink at 34%, offset 1.1px right and 1.5px down, no blur; a cut edge of ink at 16%, 0.6px, once closer than 1.1 px per unit.
- **Sheet on table** (canvas): black at 38%, offset 5px and 7px, no blur.
- **Slip lift** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.22), 2px 5px 14px rgb(0 0 0 / 0.3)`): every DOM slip.
- **Key swatch slip** (`box-shadow: 1px 1.5px 0 rgb(0 0 0 / 0.26)`): the legend's drawing of a correction slip.

### Named Rules
**The Storeys Rule.** A shadow's length is the building's storeys, and its storeys are the work in it. Shadow is never applied for emphasis.

**The True Plan Rule.** No oblique, isometric or extruded view. Scale is read from shadow, density and the size of the name.

## Shapes

Paper is square-cut. DOM surfaces have no radius; fields are a single ruled line; a lettered action is caps over a rule. The cartouche and the Key sheet carry a map's double border: a 2px ink line with a 1px line inset 6 to 7px. Slips pulled out by the hand carry a 2px red top rule instead. Dividers are 1px hairlines; a 2px ink rule closes a sheet heading.

On the canvas, footprints are mitred polygons and line joins are sharp; roads, relief and pencil are round-capped. Circles belong to survey marks only: the stake, the site mark, the wooded-ground crown, the hover and method rings. Selection of a place is four corner brackets (up to 18px arms, 8px clear of the town), not a box. The sheet's frame is a neat line: a 2.2px rule 14 units outside a 0.7px rule, with reference ticks every 600 units.

Line weights on the sheet are set in screen pixels and stay hairline at every zoom: 0.6 to 1.15px for buildings and pencil, 1.05 to 3px for roads.

## Components

### The Six Stages
How a building is drawn says how far along it is. The same six drawings are the Key's legend and the ladder in a building's note.
- **Proposed** (concept): the whole lot outlined in graphite dots (0.9px, round, 1.2 on 3.2 off, 75%) with a surveyor's stake at its centre, a small circle crossed by two strokes.
- **Staked** (planned): the main footprint in a solid graphite line (1.15px, 95%).
- **From plans** (designed): the main footprint in dashed ink (1px, 5 on 3 off, 90%).
- **Being built** (building): the main footprint washed at 78% from the left as far as progress has reached, hatched beyond at 45 degrees (ink at 42%, 0.6px), inside a dashed ink outline (1.1px, 5 on 3.5 off) that crawls while the work is live. From far away it is a flat half-strength wash. Work in hand is always named once a town can be read.
- **Working**: every part of the footprint in full wash, a fine ink outline (0.9px), a cast shadow, a storey numeral.
- **Mature**: as working, the wash deepened with ink at 13% and the wall drawn heavy (up to 2.3px). A landmark gets the heavy wall while still working.

Pencil and plan stages draw only the main footprint; annexes appear when the building stands. Unfinished stages are lettered Proposed, Staked, From plans, Being built in Besley italic graphite beneath the name; standing buildings need no word.

### The Five States of Liveliness
The paper and ink say when.
- **Building** and **Settled**: black ink, full wash. Building differs only by the crawl on work in hand.
- **Quiet**: ink 40% toward sepia, wash at 85%.
- **Dormant**: ink 85% toward sepia, wash at 62.5%, gone chalky.
- **Ruins**: full sepia. The wash is a stain (37%); outlines break into dash-dot (4, 2.5, 1, 2.5); block lines dash; town ground browns and thins; no shadows, no slips, no storey numerals; RUINS is lettered under the name; roads to it turn sepia.
- **Fresh slip**: any lot worked on lately sits on brighter slip paper 16% larger than the lot.
- **Revival**: fresh paper on old ink. Buildings touched since the return are drawn current on their slips; untouched ones keep dormant wash and dormant outline.

Marks for small places fade with age as well, to 55% at full sepia.

### Roads and Mains
- **Surveyed**: a dotted graphite line (1.5px round dots, 4.5px apart, 85%). Related on Patrick's word alone.
- **Track**: dashed ink (1.05px, 7 on 4 off, 72%). They share a method.
- **Road**: a made road, two ink lines with paper between (3px ink at 82% under 1.5px linen). They share a great deal.
- **Main**: a water-line stroke (1.5px, 95%) laid 3.2px beside the road wherever code or data really flows, lettered along its length with what it carries.

Roads stop at the edge of a town's drawing (82% of its reach) and are sepia if either end is a ruin.

### Marks
Places too small or too far to draw as plans.
- **Spark**: two crossed pencil strokes, 8.4px across, 1.35px.
- **Site**: a pencil circle (3.4px radius) crossed by 13px strokes, 1.2px.
- **Built place at a distance**: a solid ink square, 4.8px, or 6.4px from town rank up.

### The Sheet
Linen paper with generated grain (mottle, fibre, speckle) held at constant size on screen. Water is a flat wash with three waterlines hugging the shore at 50%, 36% and 22%. Relief is sepia hachure in three strengths of knowing (50%, 30%, 14%); wooded ground is a small open pencil crown. The coast is ink at 72%; rivers and lake edges are water-line ink. Dwellings are small linen-shade blocks around a town, outlined once close.

### The Hand
- **Hover, place**: a red ring 6px clear, 1.25px at 85%. **Hover, building**: its outline, 1.4px at 80%.
- **Selected place**: corner brackets, 1.6px. **Selected building**: its outline, 2.2px. A concept is outlined by its lot.
- **Method lit**: a 1.4px ring round every place that uses it; other places drop to 22%, their roads to 25%, their names to 30%.
- **Drafting**: a red cross for a new site; a dotted red line (2 on 5 off) for a road being surveyed.
- **Leader**: a 1.2px red line from the note to its subject.

### Slip
The one DOM surface: slip paper, square, with the slip lift. Lands with the paste motion (it arrives 9px high, turned 0.7 degrees, a touch large, overshoots by 1.5px and settles; 240 to 340ms).

### Lettered Action
- **Shape:** label caps over a 1px ink rule, padding 9px above and 6px below, no fill.
- **Hover / On:** ink and rule turn red over 140ms. **Active:** drops 1px. **Disabled:** graphite lettering, no rule.
- Keyboard hints are small boxed letters (rule hairline, soft ink) beside the label.

### Cartouche
- **Style:** a slip with the double border; title, whereabouts line, edition line in Besley italic, tally in tabular figures, actions, and the specimen line in graphite under a rule.
- **State:** the edition line turns red when the sheet is turned back to a past edition.

### Edition Dial
- **Style:** a slip along the bottom margin: play control behind a hairline, a ruled line lettered with years, the month's work as ink bars above it, a lettered Present action.
- **State:** bars ahead of the index are graphite at 38%. The index is a 2px red line with a pointed head; away from the present it carries the date on a red flag in slip-coloured lettering. The rule is a slider: drag, arrow keys, Home, End; it snaps to the present in the last 0.8%.

### Survey Note
- **Style:** a slip with a 2px red top rule, tied to its subject by the leader. Title, the place's own words in the remark face, a standing line, a strip of monthly work, section caps over ruled rows with italic asides, method words, lettered actions.
- **Ladder:** the six stage drawings (or seven rank drawings) in a row; the current one is ink over a 2px red rule, those ahead are faded.

### Ruled Field
- **Style:** Besley 15px on a single 1px ink rule, no box, no fill; italic graphite placeholder; red caret.
- **Focus:** the rule becomes 2px red.
- **Kind choice:** a wash swatch with its name and meaning; hairline box on hover, ink box when chosen.

### Method Word and Method Node
- **Method word:** a word in running text on a hairline rule; red on hover or when lit.
- **Method node** (Key of Methods): a 168 by 44px linen box, 1.2px ink border. Unknown is dotted graphite; noted is a graphite border; fluent is filled linen shade; mastered adds a 2px wall and a second line 2px outside it. Red on hover or when lit. Solid hairlines join a method to what it builds on; faint dotted ones lead to methods not yet used.

### Key Sheet
A linen sheet with the double border turned over the map on a dimmed table. A 30px title over a 2px rule; legend rows of drawing, name and meaning under section caps. It turns in over 380ms from 26px below and half a degree off true.

### Motion
- **The pen draws.** A new road inks along its length from the place it was surveyed from (900ms, easing out). A new spark is drawn stroke by stroke (520ms). The construction outline crawls at about 11px a second, only while a building in hand is on screen.
- **The wash floods.** A building reaching working floods from its centre, from 15% to full size and 35% to full strength (700ms, easing out).
- **The slip is pasted.** DOM slips only; see Slip.
- **The camera flies.** Selection flies along an arc that pulls out before coming in (420 to 1500ms by distance and zoom, ease-in-out); panning has inertia.
- **A cut is a cut.** More than 24 buildings or 6 places or roads changing at once are not animated. Reduced motion, or `?still`, draws everything in its final state with no crawl and no flight.

Interface transitions are 140ms on `cubic-bezier(0.16, 1, 0.3, 1)`.

### Open Items
Recorded from the finish review; these are the state of the build, not rules.
- Turning the edition back un-builds only the wash: a wash lifts toward its centre (420ms), but outlines, roads and places are cut, not un-drawn.
- A place with a plan arrives by fading in over 520ms. Only spark marks are drawn by the pen on arrival.
- At desktop home the top neat line is cropped by the window; the bottom inset that clears the dial pushes the sheet up.
- The narrow layout is a courtesy arrangement and has not been designed as a surface.
- Correction slips on the sheet appear without the paste motion.

## Do's and Don'ts

### Do:
- **Do** take every colour from `src/render/palette.ts`. If the stylesheet needs an ink, export it through `inkVariables()`.
- **Do** say stage with drawing technique and kind with wash, so the sheet still reads in greyscale.
- **Do** size and weight a place's name by its rank, and let the largest places carry the largest words.
- **Do** set line weights in screen pixels so ink stays hairline at every zoom.
- **Do** give a shadow the length of the storeys, in the sun direction (0.62, 0.78), as one unioned fill.
- **Do** put new facts on the sheet in the existing vocabulary, or on a slip tied to its subject by the red leader.
- **Do** use Besley italic in graphite for anything proposed, remarked or not yet real.
- **Do** keep a place with no work in hand perfectly still.
- **Do** draw the final state at once under reduced motion or `?still`.
- **Do** label every sheet of fixture data as a specimen, in the cartouche.

### Don't:
- **Don't** use red for anything but the hand: no red buildings, no red rank, no red ornament.
- **Don't** use a wash in DOM chrome. Washes appear off the map only as drawings of the map.
- **Don't** let colour carry stage or age.
- **Don't** draw relief, woods or lettering over ground no founded place reaches. Blank paper is the statement.
- **Don't** round a slip's corners or box a field. Circles are survey marks; paper is cut square.
- **Don't** tilt the plan: no oblique, isometric or extruded buildings.
- **Don't** add a sidebar, toolbar, card grid, status badge or progress bar. Progress is hatching on the sheet and a few italic words in a note.
- **Don't** add a scale bar. World distances measure nothing; the cartouche carries a tally instead.
- **Don't** add scrollwork, a compass rose, burnt edges, glows, or gradients as atmosphere. The paper's own grain is the only texture.
- **Don't** animate a large jump. Past 24 buildings or 6 places or roads, cut.
