# Maps and the globe

The globe is the product. These defaults decide how every world looks in every tool.

## The globe’s defaults

- **Light:** atlas light, a soft light from the upper left (the side the relief is shaded from), never dark. The face does not go flat and nothing falls into night. A day-and-night sun is an option for later, not the default.
- **Relief under every colour:** gentle. Shade thematic colours by `1 + ½ × (shade − 1)`, about 72–112 % of the colour, in every tool. (Evolution shades them fully today, which darkens the classes; Generate draws Köppen and climate flat.)
- **The quiet sea:** every land-only layer sits on `map-sea`, shaded gently by the sea floor. Layers that live at sea (rain, currents) keep their own sea.
- **Nothing here:** land with nothing to show is `map-paper`; ice is `map-ice`; lakes `map-lake`.
- **Around the globe:** the stage follows the page theme (`desk`: paper by day, navy at night). Black space with stars (`stage-space`) is an option, never the default.
- **Air:** a thin rim of `map-air`. No heavy glow.
- **Lines:** the 30° graticule in `map-grid`; the equator and tropics dashed in `map-tropics`, optional and useful in Climate; the degree ring in `gold` at home zoom, and the same in a map's frame: ticks where the grid lines meet the globe's edge or leave the map's outline, their degrees every 30° in `meta` beside them (`muted`; on the map itself, `map-label` over `map-halo`), always in step with the grid as the view turns, pans and zooms; a map zoomed past the view framed at the view's edge, matted in `desk`.
- **Names:** `map-land`, `map-sea`, `map-range`, white with `map-halo`.
- **Pins:** numbered, `pin-fill` and `pin-ink`, an open pin filled; a founder’s ring in `pin-founder`; a crop’s home ◆.
- Flat maps use the same colours and relief, with no globe light.

## Colour by job

Every map mode answers one question. The question picks the colours.

| The question | The rule | Examples | Palette |
|---|---|---|---|
| A standard exists | Use it exactly. Never restyle a standard. | Köppen (Beck et al. 2018), Relief and the other height palettes, Satellite, Rocks after the geological map’s families | `koppen-*`; the height and rock tables in code |
| How much | One hue, pale to dark. More than one hue only when the neighbours are kin. | Crop variety, people, one metal’s richness, when farming came, rain | `ramp-variety-*`, `ramp-came-*`, `rain-*` |
| Which side | Two hues and a quiet middle at the line that matters. | Temperature around 0 °C, pressure around 1012 hPa, currents | `temp-*`, `pressure-*` |
| Which kind | At most eight hues on screen; a family gets one. Members are words. | Staple food, ore families, animals, hearths | `staple-*`, `ore-*`, `cat-1` … `cat-8` |
| Where | Marks, not colour. | Hearths, districts, pinned places, a crop’s home, rivers, isochrones | pins, ◆, thin lines |

**Never generate hues.** No ±14° turns per crop, no cycling a palette. When there are more kinds than eight, colour the families and let the legend, the readout and the finder name the members. A picked member takes the spotlight: it lights up in its family’s hue, in strength, and everything else goes quiet.

**Patterns keep one meaning each.**

- Stripes: a second answer nearly as good (a place whose second staple does nearly as well).
- Hatching: a barrier (the fly belt). Don’t also hatch “could grow but hasn’t arrived”; leave that pale.
- Stipple (`map-stipple` on `map-paper`): lived off the wild, not farmed.

**The categorical eight** (`cat-1` … `cat-8`): ochre, teal, brick, periwinkle, olive, plum, sea blue, rose. Assign in order for invented kinds (hearths 1–8, animals). Generate's paint layer colours its characters by family: hilly `cat-1`, swamp `cat-2`, mountainous `cat-3`, lakeland `cat-4`, flat `cat-5`, plateau and rifted `cat-6`, the sea family (archipelago, shallow sea, ocean) `cat-7`, volcanic `cat-8`; the hover card names the member. Generate's States view (a fork addition) colours its states in order and recolours so no two that meet share one (a graph colouring over the eight); the contested frontier is striped with the rival's colour, borders are ink, and the legend and readout name each state. Every pair is at least 15.6 apart for normal sight and 7.2 for colour-blind readers, so always back it with labels or the readout. The States overlay draws each state's border in its colour over the other views (at full strength, the coast untouched) and tints its land with the same colour at the view strip's tint (40 % on a border between states, so the view shows through, fading to none 400 km inland: a rim rather than a wash; fixed in `v2/js/view/look-config.js`), and names the states, capitals and towns on the map itself in `map-label` over a `map-halo` stroke: capitals 17 px semibold beside a pin (`pin-fill`, `pin-ink`), cities 16 px semibold and towns 15 px, trade hubs (the road junctions; not market towns) italic beside a ringed dot, villages 14 px regular at 80 % beside a smaller dot with a thinner ring, forts like towns with a tower before the name (the dot's size says the tier: `.sl-city`, `.sl-town`); the names go to the most important places first as the screen has room, every resource a state holds always shows (its keeper named, or only its mark and badge where the name has no room), a name once shown stays while the view zooms in (zooming in only adds names), and no two names overlap. Before each place's name stand all its reasons as coloured badges, never emoji: a disc in the categorical eight (one icon for each kind of reason: gold and silver `cat-1`, metals `cat-3`, fine stone and salt `cat-4` (the ground's non-metals, told apart by their drawing: a block, a crystal), farmland `cat-5`, gems `cat-6`, harbour `cat-7`, trade hubs `cat-8`; a fort's tower on `pin-fill`), ringed in `map-halo`, with a line drawing in `pin-ink` or `map-label`, whichever reads on that disc; the States legend keys them with the same badges, and the readout says each reason in words, so the colour is never alone. A badge for a resource takes that resource's own colour instead (`res-*`, `.why-is-<name>`): iron steel blue, copper brown, tin pale grey, lead and zinc slate; gold, silver; salt rose white; diamonds ice, emerald green, ruby red, lapis blue, amethyst violet, opal milky, turquoise, mixed gems pink; obsidian black, jade green, agate red-brown, marble white. The eight-hue limit holds **within each category**: the drawing on the badge tells the category apart (pick, ingot, crystal, cut stone, block), so the colours only separate the members of one category. Gems have more than eight members, so those that share a hue get a badge split down the middle (`--why-2`, the right half): ruby and sapphire red and blue, sapphire and peridot in basalt blue and green, gem gravels pink and ice; garnet stays red, lapis blue, pegmatite gems pink. The kind colours stay for the legend's key and a state's Lives by. Within a state with more than one region, region borders are as wide as a state's on the whole planet's picture (two pixels in the overlay, about 1.4 on the States view's picture: thinner and the globe averages them away; one pixel on a zoomed-in tile) but subtle: the state's colour 45 % of the way to `pin-ink` (`REGION_INK`), and half see-through in the overlay. The region under the mouse lights up (`.sl-hover-*`): its border a 1.3 px `map-label` line at 85 % over a 6 px blurred `map-label` glow at 22 %, round its whole outline (the coast too), and its name's letters redrawn in `map-label` at 85 % with a 3 px `map-label` glow, each in its engraved letter's projected frame and on its baseline; it fades in 160 ms (none under reduced motion), and touch has none. State and region names are **engraved into the land**, painted into the planet's own picture and sized in km so they turn and zoom with it: written along their land as an atlas letters it, read west to east, the letters spread out to fill it, states in spaced capitals (EB Garamond 600, as big as their land allows), regions in EB Garamond 600 italic, all one size (40 km, on one or two lines); every letter inside its own land and no two names overlapping. Each letter is cut in, not printed on: the land shows through it, paler (screened with `map-label`, as a letter cut in slate), with no dark edge, states and regions alike; a name under 7 px on screen is left out. No halo, never a flipped dark letter over a light copy (it reads as cheap), no dark letter with a light rim (not readable), and no dark shadow wall (it made them less readable). The view strip's Names slider sets their opacity. The roads run under the names in three tiers, a dusty tan (`map-road`, so they sit back behind the white names) over a wider dark brown casing (`map-road-casing` at 45 %): main roads 1.2 px solid, roads 0.7 px dashed, tracks 0.5 px dotted (only once the villages show). Names stay inside the map's frame. A click on a state or a place opens its infobox (a `surface` card like the legend's, docked at the right below the help button as every other infobox: the name in Cormorant 20 px with its reason icons, rows of a Libre Franklin label and EB Garamond text, its hand edits as chips; on a phone full width under the view strip, or above the sheet when the pick is in the top half so it never hides it, its close 44 px), and the picked place is ringed in `map-label`. A picked place's food reach is outlined round it (`.sl-reach-*`): a `map-label` fill at 18 % (holes left open), and a 1.8 px `map-label` line over a 4 px `map-halo`, rounded so it reads as a reach, not as cells. Every land is some state's; there is no unclaimed colour.

**Ore families** (in the code: `ORE_FAMILIES`, `v2/js/geology/deposits.js`): `ore-alloy` (iron, nickel, platinum and chromium), `ore-base` (copper, tin, lead and zinc, aluminium), `ore-precious` (gold, silver, diamonds), `ore-salt`. They pass every check (21.1 / 8.2). Three views: by family; worth mining (moderate or richer only); one metal at a time, in its family’s colour, richness by strength (Poor, Moderate, Rich), its richest districts numbered.

**Staple food:** `staple-paddy`, `staple-cool`, `staple-warm`, `staple-roots`, `staple-livestock`, `staple-fish`, `staple-tree`, and wild foods as stipple. Paler where it feeds less well; striped where a second does nearly as well. These keep the Food view’s own hue choices, tuned to pass (16.7 / 7.5, with labels).

## Legends, readouts and finders

- **The legend card** holds at most eight rows: swatch, name, share. Members fold inside their row as words; a finder lists every item; settings sit in one folded line at the foot. Never a chip per item.
- **The readout** names everything at one place, richest first, with the view’s own labels and real values. It carries what the colours leave out.
- **The finder** searches every item a view knows (“Find a crop: 208 of 245 grow on Arden”); one the world doesn’t grow says why.
- **Pinned places** list the user’s pins under the map: number, class swatch, name, where, the values for the view.

## Adding a map mode

1. Name its question: a standard, how much, which side, which kind, or where.
2. If a standard exists, use it and stop.
3. Draw from the palettes above, in their fixed order.
4. Keep the map to eight hues; group the rest into families with a spotlight.
5. Put the rest in words: readout, legend rows, finder.
6. Check it: every pair through the colour check (on a map any two colours can touch), then look at it on the globe, on paper and at night.

## Checked, not eyeballed

| Palette | Colours | Closest pair (normal) | Colour-blind | Verdict |
|---|---|---|---|---|
| Ores before (all metals) | 11 | 5.0, copper and aluminium | 3.6 | Fails |
| Ore families | 4 | 21.1, precious and base | 8.2 | Passes |
| Staples before | 8 | 8.6, warm grains and tree crops | 3.2 | Fails |
| Staples, tuned | 7 + stipple | 16.7, tree crops and warm grains | 7.5 | Passes with labels |
| The categorical eight | 8 | 15.6, olive and ochre | 7.2 | Passes with labels |

The floor is 15 for normal sight and 8 for colour-blind readers (6 to 8 allowed when labels back it up), measured over every pair.
