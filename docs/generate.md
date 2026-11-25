# Generate

**A planet in seconds, shaped by hand:** [orogen.studio/generate](https://orogen.studio/generate)

Set the continents, plates and climate with sliders, then reshape any plate you don't like. Every planet comes with the
full seasonal climate (wind, ocean currents, rain, Köppen zones) and a planet code that rebuilds it exactly. Of the
Studio's tools it is the fastest and the most phone-friendly; its profile is in [VISION.md](../VISION.md#the-tools).

The view (the layer tabs, the map projections), the climate and the export panel are shared by every tool: see
[shared.md](shared.md). Back to the [README](../README.md).

## Building a planet

Click **Build new world** to create a new random planet. The button's label says what it will do, from what you've adjusted:
- **Build new world** — generates a fresh planet with a new random seed
- **Rebuild** — re-renders the current planet at a new detail/roughness level without changing continent shapes
- **Regenerate** — creates new tectonic plates when the Plates or Continents slider has changed

## Sharing planets

Every generated planet produces a **planet code** (shown below the Build button) that encodes the random seed, all slider values, and any plate edits. The seed is one of 2,147,483,646 (0 to 2,147,483,645: each its own world — the seeded generator's every starting state; before 2026-10 new planets drew from the first 16.7 million, whose codes read as they always did). An unedited planet is 22 characters; plate edits (applied via Rebuild) extend the code to include the toggled plates, and the paint layer follows a `_` (a version digit, then each stroke: its character, its width and its line on a ~5 km grid; see [Paint layer](#paint-layer)). Codes from before 2026-11 may carry plate-wide characters after a `~` (four characters a piece: its index, the character and the level); they still open as they were made, but nothing makes new ones. Older codes (13–21 characters) from previous versions are still supported — missing sliders default to their current default values. To share a planet:

- **Copy** the code with the copy button and send it to someone
- **Load** a code by pasting it into the planet code field and clicking Load (or pressing Enter). The Load button lights up in the accent when a new code is ready to apply.
- **URL sharing** — the code is also stored in the URL hash (e.g. `#a7f3kq9xp2b`), so you can share the full URL directly (`orogen.studio/generate#…`; a link from before Generate moved there, `orogen.studio/#…`, is sent on to it by the home page). Opening a URL with a valid hash auto-loads that planet, including any plate edits. The hash names a world from the moment its build begins, so reloading mid-build builds that world again. A world that finished before in this browser opens from the [world cache](world-cache.md#generate) in a second or two instead of being built again.

## Controls

### Shape your world

Core world parameters that control the planet's structure (changing these requires a full rebuild):

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Detail | 5,000 – 10,000,000, 20 stops ~1.5× apart, ending at what the machine's memory holds ([detail-stops.md](detail-stops.md)) | 180,000 | Number of Voronoi cells on the sphere. Only affects rendering resolution — continent shapes are stable across detail levels (generated on a fixed ~20K reference grid) |
| Irregularity | 0 – 1 | 0.75 | Randomization of Fibonacci point positions |
| Plates | 4 – 120 | 80 | Number of tectonic plates |
| Continents | 1 – 10 | 4 | Target number of separate landmasses |
| Roughness | 0 – 0.5 | 0.40 | Fractal noise magnitude for terrain roughness |
| Continent size variety | 0 – 1 | 0.35 | How much continent sizes vary — 0 keeps continents similar in size, 1 allows a mix of large and small landmasses |
| Land coverage | 0 – 1 | 0.3 | Percentage of the planet covered by land. Low values create ocean worlds, high values create large continents whose interiors, far from the sea, are drier |

### Terrain sculpting

Knobs on the ground drawn from the present-day world (collapsed by default). They do not rebuild the world: adjusting any
slider lights up **Reapply**, which draws the ground again from the same plates and past, then finishes it again. At their
defaults the ground is drawn exactly as Evolution draws its own (`v2/js/present/knobs.js`).

| Control | Range | Default | What it scales |
|---------|-------|---------|-------------|
| Terrain warp | 0 – 1 | 0.75 | How far the records are read off-place: the organic wander of coasts and belts |
| Smoothing | 0 – 1 | 0.10 | Wear: crests spread wider and lower (the same bulk) |
| Glacial erosion | 0 – 1 | 0.50 | How far fjords reach up their valleys (the finish's ice age carves its own) |
| Hydraulic erosion | 0 – 1 | 0.50 | How long the rivers work: the first picture's carve and the finish's, by the climate's runoff |
| Thermal erosion | 0 – 1 | 0.10 | The valley sides' critical slope: more, gentler talus-softened slopes |
| Ridge sharpening | 0 – 1 | 0.50 | The parallel ridges, the ridge noise and the crests' ruggedness |

Roughness (in Shape your world) scales the hills, the coast's bays and the fine relief.

### Climate

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Temperature | -30 – 30 W/m² | 0 | Warms or cools the whole planet. The value is the change in the heat its air holds in — a radiative forcing in the energy balance, in W/m². Snow, sea ice and ice sheets amplify a cooling far more than a warming: on Earth −10 cools the planet ≈ 8 °C and +10 warms it ≈ 6 °C, and past −20 the ice runs away — sea ice on a quarter of the sea at −20, a snowball planet by −28 to −30. The winds and currents shift with them, and warmer seas evaporate more, so a warm world is wetter and a cold one drier |
| Precipitation | -1 – 1 | 0 | The pace of the water cycle (±50 %): evaporation from the seas and land scaled, so about that much more or less rain overall — where it falls still follows the winds and mountains |
| Lakes | -1 – 1 | 0 | How readily the land's hollows hold water, from none to a lake district (the rain stays Precipitation's): [lakes-slider.md](lakes-slider.md) |
| Small lakes | -1 – 1 | 0 | The lakes too small for the mesh, where science puts them (glacial lowland, tundra, floodplains, wet flats), from none to a lake district: [small-lakes.md](small-lakes.md) |

Releasing any of them finishes the planet again (the ground stays): its rivers, lakes, ice, Satellite view, rocks and
food all follow. The panel stays live during a build; the button reads Cancel build, which stops it and leaves the world
shown before, and a change in the panel turns it into Rebuild, which restarts the build: [mid-build-rebuild.md](mid-build-rebuild.md). Lakes set is kept in the planet code (23 characters; at ±0 the code is the 22-character one as before).

### Inspect (advanced)

A folded section at the foot of the sidebar: **The world's past**, per region — Sea-floor age, Mountain belts by kind,
Mountain belts by age, Cratons. **None** returns to the tab shown.

## Tutorial & Help

A five-step tutorial modal introduces the tool on first visit (auto-shown via `localStorage`). It covers planet generation, slider controls, interactive editing, visualization, saving/sharing via planet codes, and map export. A **?** help button in the top-right corner reopens the tutorial at any time. The modal can be dismissed with the close button, backdrop click, Escape key, or the "Get started" button on the final step.

A **What's New** modal is shown once per release to returning users (those who have already dismissed the tutorial). It highlights new features, changes, and a heads-up when saved links, planet codes or planet files give a different world, with the address where the previous version still opens them. The modal uses a versioned `localStorage` flag (`wo-whatsnew-seen`) — bump the `VERSION` constant in `whatsNew()` (`js/main.js`) to trigger it again on the next release.

## Interaction

| Action | Desktop | Mobile |
|--------|---------|--------|
| Rotate globe / pan map | Drag | Drag (one finger) |
| Zoom | Scroll wheel (past the picture's own pixels, the detail finer than the mesh is drawn in tiles) | Pinch with two fingers |
| What is here | Hover | Tap |
| Mark a piece for reshaping | Ctrl-click it (Cmd-click on a Mac; the piece under the pointer lights while Ctrl is held) | Tap the edit button (pencil), then tap pieces |
| Undo a pending piece | Ctrl-click it again | Tap it again |
| Apply pending edits | Click the Rebuild button | Tap the Rebuild button |
| Cancel all pending edits | Press Escape | — |

The hover card reads as Evolution's (`v2/js/view/planet-view.js` readoutLines), with Generate's own lines first: the piece
(land or ocean, and what Ctrl-click would do), the plate it rides (its number and speed here) and its crust (an ocean
floor's age, a belt and when it was last active, a shield, a flood basalt). Then the height, the river (its flow, its year
and its floods) or lake, the place, and the layer's own — the climate, the rock and its record, the deposits or the age's
resources and the district's story, or the land's food. Over every view, as on the old page: the piece under the pointer
lightens while Ctrl (⌘) is held, and each pending piece is tinted by what it will become — green to rise as land, blue to
sink — with the ground showing through, to its own outline, drawn by the globe's shader at once at any zoom:
[plate-edit-tint.md](plate-edit-tint.md). The hover card steps up over the
Rebuild button while edits wait.

### Edit tools (fork addition)

A tool bar over the planet (`js/edit-tools.js`), on the Terrain tab only: leaving it hides the bar and drops the tool
back to Look. While a tool is on, the left button is the tool's; right-drag
turns the globe, and Ctrl-click still selects pieces. The globe's turn slows as you zoom in (`GlobeView.renderIfNeeded`). Undo (Ctrl+Z) takes back the
last waiting stroke or Apply. Over the planet: a ring of the brush's size at the pointer (`js/edit-marks.js`, placed by
`GlobeView.screenAt`; dashed while it erases), and the paint strokes waiting for Apply as a tint (`js/piece-overlay.js`).
The Split tool (cutting pieces along a drawn line) was removed in 2026-11: Paint shapes ground inside a piece without
needing new pieces.

- **Paint** (`js/terrain-brush.js`): paints characters onto the ground. Pick a character in the select beside the tool
  (its swatch shows the colour it is drawn in) and drag anywhere: no plate needs picking first, and a stroke runs across
  plate edges. **Erase** (or Shift-drag with Paint) takes paint off with the brush's size, under a dashed ring, and the
  ground under it goes back to what the plates made. Painting changes nothing yet: the strokes wait, drawn in their
  colours under a stronger tint, and can be taken back one by one with Undo. **Apply** (beside the tools, with how many
  strokes wait; Enter does the same) lays them all in one go, and one Undo takes that whole Apply back. Size is the
  band's half-width in km (Shift+wheel over the planet changes it: 15 % a notch, wheel down for more). Paint took the
  place of the Raise, Lower, Smooth and Flatten brushes and their Strength slider, and (2026-11) of the plate-wide
  characters and their card.
- **Keeping paint to chosen plates.** With Paint on, Ctrl-click (in edit mode on a phone, a tap) chooses the plates a
  stroke may paint in, tinted amber; again frees one, Escape frees them all. Choosing changes nothing on Rebuild (it is
  not a plate edit), so an ocean plate can take a few volcanic islands without its neighbours being touched. With none
  chosen, paint keeps to the plates selected for Rebuild (Ctrl-click in Look), if any. Each stroke
  keeps to the plates chosen when it began: outside them it lays nothing, and inside it fades in over 240 km from their
  outlines (measured to the nearest point of the outline, its foot wandering with noise), so it never ends in a cliff or
  a stepped line tracing the plate edge. The brush's ring shows it: drawn full over the
  chosen plates and faint beyond them, where the stroke lays nothing. With none chosen a stroke paints everywhere.

### Paint layer

The paint is a layer over the ground the plates made, never baked into it: a colour map where each colour is a
character, kept as the ordered list of strokes. The worker lays it again onto the unpainted ground after every ground it
draws (a Rebuild, a Reapply, a plate edit), so Ctrl-click → Rebuild still only flips land and sea, and the paint stays on
top of the new ground.

- **The characters.** Each reshapes the ground's own relief rather than stamping over it: **Flat** (a worn shield, low
  and level), **Hilly** (an old eroded range), **Mountainous** (a young range, ridges to ~4–5 km where the ground was
  already high), **Plateau** (a lifted block behind an escarpment), **Archipelago** (a drowned margin, its hills left as
  islands), **Shallow sea** (a shelf ~40 to ~200 m deep: it lifts deep floor to it across the band and floods any land
  there, islands too, too deep for the finish to lift its shoals into islands), **Lakeland** (a scoured shield pitted with closed hollows ~100 km across, which hold fresh lakes where it is
  wet and salt lakes and pans in the dry belts), **Swamp** (waterlogged flats barely above sea level), **Rifted** (crust
  stretched into parallel ridges and basins), **Volcanic** (cones on a basalt plain, or islands at sea) and **Ocean**
  (the deep floor: an abyssal plain ~4 km down, a continental slope where it meets land). Each option's tooltip says how
  it changes the surface; the picker's own tooltip and a second line of the Paint hint say it for the one picked (the
  hint is how a phone, which can't hover, reads it). A sea character floods the land it is painted on; a land character raises the sea floor. Painted over
  deeper water, Archipelago raises the floor toward the stroke's line, a broad swell with a ragged foot rather than a
  flat-topped ribbon tracing the stroke, its islands in groups (a slow noise opens straits between clusters and sets a
  few off the line); the islands keep their full height wherever they stand, and only the floor between them tapers.
  Shallow sea lifts it to the shelf over most of the band, tapering at its edge, with hollows a few hundred km across
  (only ever deeper, as a shoal brought near the surface would come up as an island in the finish). Shallow sea takes
  land under five times as fast across its fades, so islands (an earlier archipelago's too) go under rather than
  standing on in its transition or a kept plate's fade-in.
- **How a stroke is laid.** Each stroke is a band the brush's radius wide on each side of the line (its edges wander,
  its ends taper), the character in full across it, then a fixed transition of 140 km (`TRANSITION_KM`) out to the
  ground as it was, so a range still rises out of its foothills. The sea characters (Archipelago, Shallow sea, Ocean)
  move the ground kilometres, so theirs is wider: their band's edge wanders about twice as far, the transition is
  320 km (`SEA_TRANSITION_KM`), and the slope down to the old floor is smoothed over 110 km (`SEA_SOFTEN_KM`, in hops
  of the mesh), leaving what ends near or above the sea (islands, the shelf top) as it was. Without that, a 4 km drop
  over the few cells of a 140 km transition stands as a stepped cliff. Strokes compose in order, as paint on paint: a later
  stroke takes that much of every earlier character away and lays its own; the eraser only takes away. Strokes of the
  same character are laid as one area (their bands merged), so crossing strokes make one range, not two stacked. The
  character reads the ground's relief across the area and 300 km round it on the same side of the sea, so a plain keeps
  its place beside the old highlands instead of being stretched to the full range of heights. Its noise is in
  kilometres, so it looks the same at every Detail; the finish (rivers, lakes, climate) runs on the painted ground.
- **Seeing it.** Applied paint is drawn faintly in its character's colour over every view (the globe's shader, from the
  piece overlay's grid: `js/piece-overlay.js`), and the hover card names the paint under the pointer. **Layer** (shown
  once paint is applied) hides or shows it; the ground stays painted either way. The colours are the categorical
  tokens, one per family (`docs/style-guide/maps.md`), so the sea characters share sea blue and Plateau and Rifted share
  plum; the readout says which member it is.
- **Taking it off.** **Clear paint** removes the whole layer and puts the ground back as the plates made it; Undo brings
  it back.
- **In the link.** The layer is in the planet code after the seed, the sliders and the plate edits (`_…`), each stroke
  as its points on the paint grid (and, for a stroke kept to chosen plates, their indices among the pieces, flagged by
  its character digit), so a shared link lays the same paint at any Detail. A long stroke is a few hundred
  characters; when the code passes 2,000 characters the seed field's tooltip warns that some places may cut the link
  short (save a planet file instead, or use fewer, longer strokes).

## Region (fork addition)

Choose pieces and open them as a flat regional map with its own erosion and rivers: [region.md](region.md).

## Empire (fork addition)

**Civilizations → Empire** (`v2/js/evolution/empire-view.js`) is a heat map of where cities could best be founded,
with the best spots pinned and listed. It is Generate's alone: it focuses on the valleys chosen with the Region pick,
and only Generate has one.

- **Focus**: choosing the Empire view turns the Region pick on (and off again when you leave, if it turned it on).
  Click valleys to take them in or out; the map then ranks only within them and greys the land outside. One choice is
  shared: the same valleys open as a region. With none chosen, the whole planet is ranked. A new planet or valley size
  starts the choice again.
- **The metrics** (the legend's chips, each on or off):
  - **Food**: the people the land within the Reach could feed (City size's count, the largest town it could feed, on a log scale over four tenfolds).
  - **Fresh water**: a river or fresh lake at hand, fading over about 8 km; a big river counts more than a stream.
  - **Trade**: a sea coast (fading over 12 km), a navigable river or a lake (over 8 km).
  - **Ground**: flat and dry, not too high, with a rise nearby to hold (the relief of a ring 8 km out, 15–60 m best);
    marsh, steep slopes and high peaks are scored down.
  A site's score is the geometric mean of the metrics on (each as 0.1 + 0.9 × it), so a place weak in one is weak.
  All distances are in km, so the map reads the same at any Detail.
- **Cities** (− / + in the legend, 1–20, 5 at first): the spots. The best place in focus comes first, then the next
  best at least the Reach away (25 km a day by cart; two of the map's cells at least) from every one taken. Each is
  pinned (white with a dark ring) and listed with its grade, score, place and why.
- **Reach**: City size's slider (or Shift+wheel over the planet) sets both the food's reach and how far apart the
  spots stand.
- **Readout**: the site's grade and score under the pointer, and what makes it so.
- **Export**: Food → Empire, as shown (colour) or the score itself (data, 0…1).

On a phone the legend moves under the Region bar, and its buttons are 44 px.

## States (fork addition)

**Civilizations → States** (`v2/js/evolution/states-view.js`) draws a political map for the whole planet as it is
now: a base to adjust, not a history. Every part is a knob or a click away.

They are worked out in a worker (`v2/js/evolution/states-worker.js`), so the page stays live while they are: once the
world is finished (the build's third step), and again after each change of a knob or a click. Until the new states
come, the view and the overlay keep showing the last ones. The worker gets a copy of the rasters the states read and
is ended once they are back. The grid under the states (Empire's metrics, City size's people within reach) comes back
with them and is kept, so a change of the states' own knobs (a capital placed or dropped, the count, a reroll) sends
only that grid, and a change of the Food knobs sends the rasters again.

- **How it is drawn**:
  1. **The cost of holding ground**, per km. Open, well-fed land is cheapest. Hills, mountains, high ground, marsh and
     empty land (desert, tundra) cost more. A navigable river costs less. The sea costs a lot and the open ocean the
     most. A gentle noise, rolled with Reroll, varies the cost. Climbing costs extra (a km of climb as 80 km of open
     land), so borders settle on crests and watersheds; with **River borders** on, crossing a big river costs up to
     220 km of open land (rising from a navigable river's flow to 2,000 m³/s), so borders settle on the great rivers.
  2. **The capitals**: the best city sites (Empire's four metrics), weighted by the people the land within reach could
     feed, and spread over the peopled land.
  3. **Growth**: every capital spreads out at once along the cheapest ways, each one's cost divided by its power (the
     people within its reach, to the 0.35). A place belongs to the capital it is cheapest from. The map wraps round the
     world east–west. Then each place's owner is read a little way off, through a warp of three noises (about 420,
     170 and 70 km across, each swaying a third of its size), so borders wind as real ones do; a finer warp (40, 16
     and 6 km) is added where the map is drawn, so they keep winding as you zoom in. The warp is calmer on mountains
     and big rivers (the border stays on them) and fades to none within about 250 km of a capital. **Borders** sets
     how much.
  4. **No land left unclaimed**: where peopled land lies beyond every capital's Reach (a stretch of at least 0.2 × the
     capitals' spacing squared, feeding at least 8 % of an average state), a new state rises there, at its best city
     site, and the growth runs again (six rounds at most, 60 states at most). Then every state grows without limit, so
     the last scraps (deserts, ice, small islands) go to whichever state reaches them cheapest. Every land cell
     belongs to a state.
  5. **Contested land**: where the next capital is nearly as cheap as the first. It is striped in the rival's colour.
  6. **Flashpoints** (open pins, at most 10, at least 400 km apart, at most 2 between any two states): the richest
     contested places. These are scarce metals (tin, then gold, silver, copper, salt, diamonds, lead and zinc, iron),
     good city sites and well-fed land.
  7. **Bottlenecks** (diamonds, at most 12): for two states that meet, the cheapest crossing of their border, where the
     rest of the border costs much more. Each is named a mountain pass, a strait, a river crossing or a gap.
  8. **Places, tier under tier** (Christaller's central places): **cities**, up to twelve a state, its best city sites
     by the people the land round them could feed, at least 280 km apart (or 0.12 × how far apart the capitals stand);
     then **towns**, about 130 km apart, and **villages**, about 65 km apart, filling the peopled land between them
     (towns where the land feeds 4 people a km² or more, villages 1 or more; 24,000 at most over the planet). Each
     spacing is from every place already standing, capitals and cities first. Then the **places by the deposits**
     (`minesOf`, `MINE` in `states-view.js`), which farmland alone never sites: the hills and the dry country where
     gold, gems, jade and opal form feed few (Potosí, Kutná Hora, the Rand stood where farming would not have put them).
     Each good has a worth (`WORTH`, `GEM_WORTH`, `STONE_WORTH`: gold and diamonds 1, ruby and sapphire and emerald 1,
     gem gravels 0.9, silver, lapis and opal 0.85, tin 0.8, jade 0.75, copper, turquoise and pegmatite gems 0.6–0.7,
     salt 0.55, obsidian 0.5, iron, lead and zinc 0.4, garnet 0.35), and a deposit is worth that in full when rich, half
     when moderate, nothing below. Every held cell whose deposits are worth 0.3 or more (the dearest in full, the rest a
     quarter each), the dearest first: a place of the same state within 30 km works it (a village by one worth 0.8
     grows into a town); else a new place stands there, a town if worth 0.8, else a village, 60 km from the other new
     ones and 30 km from every place, at most 40 a state. So a moderate gold, gem or opal field gets a place, and garnet,
     salt, obsidian or iron only where rich.
  9. **Roads, grown from the places outward**: every place (capital, city, town, village) is joined to its near
     neighbours, not straight to a far capital. A shortest-path growth over the travel cost from every place at once gives
     each its own ground (a cost-weighted Voronoi cell); two places whose grounds meet are neighbours, joined by the
     cheapest way across their meeting. Of those links only the ones no third place stands between are kept (the
     relative-neighbourhood graph, Toussaint 1980): the sparse, planar web real road networks make. Along that web:
     **main roads** (solid) are each city's way to its own capital and each capital's to the capitals it borders, so they
     run through the towns between and merge near the capital; **roads** (dashed) are each town's way to its nearest
     city or capital; **tracks** (dotted, shown once the villages show) are each village's way to its nearest town or
     above, and the short links between near neighbours in a state (under 1.6 × the median link). Roads keep to the
     cheap ways: valleys, rivers, sea lanes; on land a km climbed or come down costs as much as 100 km of open road
     (`ROAD_LAY.climbKm`), so a road goes round a hill rather than over it. Three places the web would chain (A to B to
     C at a corner under 115°, with no road from A to C) meet at a **fork** instead: the point the three ways to it cost
     least (the cost-weighted Fermat point, a Steiner junction), where that is at least 6 % cheaper than the chain; the
     leg to B takes the better of the two links' tiers. Each stretch they share is drawn once (the highest tier wins), broken at
     the places and the forks. A road found on the grid is a stair of cells in eight directions, so each line is then
     laid as a road would be (`flowRoad`): smoothed, resampled every third of a cell and bent off the cheapest way by
     noise at 110, 40 and 15 km (by the **Roads** knob; less in the mountains and along the rivers, where the cost
     leaves little choice, and none at its ends, so roads still meet), then thinned (Douglas–Peucker) and rounded
     (Chaikin). On the page (`road-banks.js`), each stretch that runs along a navigable river (within 22 km of it and
     its way, for 25 km or more) moves onto the bank it mostly lies on, just beyond the swing of the river's meanders,
     easing on and off, so a road crosses a river where it leaves it and not back and forth while it follows it.
  10. **Trade hubs and market towns**: a **trade hub** is where the goods of different lands first meet on the roads
     (`goodsMeet`; Ullman's complementarity, Cooley's break-of-bulk). Each place makes its goods (`GOODS`): grain,
     livestock or furs and game by how its land is lived off (each way of life on a quarter of its cell or more, so
     where farmers and herders meet, both), the sea's trade on a coast, and every deposit worth 0.3 or more within
     40 km (gold, silver, gems, tin, copper, salt, iron, lead, fine stone). The goods travel up each place's way (a
     village's to its town, a town's to its city, a city's to its capital, and between bordering capitals), gathering
     what each place on the way makes. At each place, what arrives by each road and what it makes itself are its
     branches; the goods meeting there are worth all of them together less the dearest branch (each good has a worth:
     gold 1, gems 0.9, silver 0.85, tin 0.8, copper and salt 0.6, grain, livestock and the sea's trade 0.5, iron and
     fine stone 0.45, furs 0.4, lead 0.35), so the meeting counts where the goods first come together, not on the road
     on from there. A town or city where goods worth 0.5 or more meet can be a hub: ranked by 3 × that worth, then
     by the main roads and roads (not tracks) meeting there, the ways of the places round that pass through it (a
     village's 1, a town's 3, a city's 8), a sea landing and a navigable river; about 1.5 for every state at most (at
     least 2), at least 0.15 × how far apart the capitals stand from a capital and a quarter of it, or 120 km, from
     each other, and none where nothing meets. A town that becomes one grows into a city. The villages the most tracks
     run through (6 or more ways), or where goods worth 1 or more meet, with no town within about 90 km, grow into
     **market towns**: towns, not hubs, so they carry no trade badge (the infobox calls them market towns and says what
     could change hands there).
  11. **Natural regions** (`v2/js/evolution/states-nature.js`): the land is read once into a tree of regions nested
     five deep, at most about 20,000, 70,000, 250,000, 900,000 and 3.2 million km² a region. Neighbouring land merges
     cheapest first where it is alike (height, ruggedness, wetland, Köppen group, how people live off it: farmers,
     herders or foragers) and where it shares a long border, while the merged area stays within the level's cap. A border
     on a dividing line counts as little of one (8 %, `DIVIDE_OPEN`): a crest (ground standing 120–700 m above the land
     80 km away on both sides, `DIVIDE` in `states-view.js`) or a big river (as River borders weighs one), so the land
     splits on its ranges and rivers rather than across them (the owner, 2026-11-25: regions were cutting across both); small
     leftovers join their cheapest neighbour and islets the nearest region. Each region is named for its lay of the
     land (Tundra, Swamps or Marshes, Mountains, Plateau, Highlands or Hills, Desert, Steppe, Jungle, Savanna, Taiga,
     Vale or Plains, Grasslands, Forest, Coast, Lowlands or Uplands) and, where one resource is held by a fifth or more
     of its places' people (weighed by how wanted it is, so iron needs more), that resource: "Copper Hills of X", "X
     Plateau". The tree does not follow the states; it is the land's own, so the same at any roll.
  12. **Regions**: the land's own parts, blind to the states (the owner, 2026-11-24: "regions shouldnt be bound to
     empires, because some could cross empire bounds"), so a mountain range, a plain or a desert two states share is one
     region, its border running across theirs. They are cut from the natural regions on the one level, for the whole
     planet, whose pieces that matter come nearest one to about 600,000 km² of land (`PROVINCE_KM2`; a piece matters
     when it is at least 35 % of that, `PROVINCE_LEAST`). The land is shared out from the cores of those pieces (each
     piece's land at least 60 % as far in from its edges with the others as its deepest point, `CORE_SHARE`; once all but
     its outer 90 km, which kept the pieces' blocky edges) by cost, so where two regions meet is settled by the ground, on a crest or a river: a crest is a toll as a big river is (coming onto the sharpest costs 1200 km on its own ground, `CREST_KM`, so the toll outweighs the climb a range already is; leaving it costs nothing), so two regions meet on it rather than one climbing over to take the far slope, and the borders' wiggle stays off it; with the same climb and
     river crossing and read through the same warp as the states (so a region does not leave a piece of land stranded);
     the land of the pieces too small, and the islets, goes to the region cheapest to reach from it. An island with no
     piece's seed on it but of 60,000 km² or more (`ISLAND_KM2`, a tenth of a province) seeds a region of its own, so a
     region does not reach across the sea to take it (the owner, 2026-11-25: regions "somehow cross water"); smaller
     islets still join the nearest region, often a bigger neighbouring island's. Each region's seat
     is the capital in it (the biggest, if more), else its biggest place. A region takes its natural region's proper name where
     it holds 60 % or more of it, else one of its own, with one of its lay's words (`LAND_WORDS` in
     `states-nature.js`, ten or so each, every word belonging to one lay only: a vale may be a Vale, Valley, Basin,
     Bottoms, Dales, Strath or Floodplain, a desert Sands, an Erg, Dunes or Badlands, a steppe Prairie, Pampas or Heath),
     picked by where it lies; a neighbour of the same lay already named with that word takes the next, so thirty vales
     on a map do not all read "Vale" (the owner, 2026-11-25: "maybe we just need different names for vale, steppe etc";
     merging alike neighbours, and one family name with Western, Eastern… across their parts, were tried first and
     read as too many). A region named for an ore keeps its lay's plain word ("Iron Vale of Tharn"). A region that is
     an island or an archipelago is named as one (the owner, 2026-11-25: "they really are special geographical
     regions"): when 90 % or more of its land lies on islands under 1.5 million km² (`ISLE_ALL`, `ISLE_KM2`, two and a
     half provinces), it takes an Isle word ("Isle of Tharn", "Tharn Island") where 85 % or more is one island
     (`ISLE_ONE`), else an Isles word ("Tharn Islands", "Archipelago", "Cays", "Skerries"), with its own proper name. A state's regions are those it holds 15 % or more
     of (`REGION_HELD`), and those it holds most of. Its borders are drawn as wide as a state's but softer (the owner, 2026-11-25:
     "region border are kinda awful. can you make them more subtle?"), in the colour of the state they cross 45 % of
     the way to ink (`REGION_INK`), half see-through over the other views and one pixel wide on a zoomed-in tile (a state's border is ink, and where the two meet the state's line is
     the one drawn), and its name shows (italic, spaced) once it is big enough on the screen, across a state's border
     where the region runs across one. The infobox's Region row says its land, how its people live, its seat and the
     other states it is shared with, and a Land row names the natural region a click stands in and the one it lies in at
     the top.
  13. **Forts**: every bottleneck that is a mountain pass, a river crossing or a gap (not a sea crossing or open
      frontier) is guarded from both sides, from each state's nearest land to it within 250 km. A capital, city or town
      of that state within about 50 km guards it; else a fort stands there (nearby forts merge). Villages next to a
      fort give way to it. Then the **narrows** the roads run through, whoever's border is near (`narrowsOf`, `FORT` in
      `states-view.js`; Thermopylae, the Iron Gates, the Khyber): on every main road and road, the lowest point of each
      cell is the valley floor, read off the finished heights; where on one of four axes through it the ground rises
      300 m or more within 15 km on both sides, while along the valley it rises less than half that, the road runs
      through a narrows (a **river pass** when a navigable river runs there too, else a **valley narrows**). Scored by
      how high the flanks stand, the road's traffic, a main road and a river, the best first, each 110 km from every
      other fort or guarded place and at most 4 to a state; the fort stands up on the nearer flank, three-fifths of the
      way to its crest, over the way through (a town or city already there guards it instead).
  14. **Why each place stands** (the coloured badges before its name), one icon for each kind of reason, and a resource's badge in that resource's own colour (copper brown, iron steel blue, gold yellow, emerald green…; gems that share a hue are split in two colours): a trade hub (two arrows; only a hub: a busy road alone is what most towns stand on), a harbour (anchor:
      within about 15 km of the open sea; a lake's shore is not a coast), farmland (wheat:
      rich food land), metals (pick: iron, copper, tin, lead and zinc, the metal named), gold and silver (an ingot), salt (a
      crystal), gems (a cut stone: the dearest gem
      deposit round it, named: emerald, corundum, opal, turquoise, lapis, garnet and the rest, from the geology's deposits),
      fine stone (a block: obsidian, jade, agate or marble, named) or a fort (tower: it guards a crossing, named with
      where it leads, or the road through its narrows). A deposit counts within 40 km of the place, as a reason once it is worth 0.3 (the same worth that
      sites a place by it: a dear one moderate or rich, a cheap one rich), so a place sited by a deposit always says so.
      Each reason has a strength from the place's metrics; every reason at 0.45 and over is shown, strongest first. A great river (8 times a navigable river's least flow or more, at the place or a step from it)
      or a lake's shore is not a reason of its own (most places stand by some water), but it widens the place's food
      reach as a harbour does. No place stands in a lake.
  15. **People** (`PEOPLE` in `states-view.js`, Reilly's and Huff's gravity models): each place's market draws food from
      the land of its own state within its reach (capital 350 km, city 220, town 110, fort 70, village 55; a port or a
      river town half as far again). Where several places reach the same land they share its food, each pulling by its
      tier's weight (capital 10, city 5, town 2, fort and village 1; a trade hub or market town 1.4 times) over the distance squared
      (plus 15 km). As in City size, only the surplus counts (15 % of the people the land could feed) and a field's
      share falls with the haul, to about a third every 2.5 days by cart (62 km; a port or river town's half as far
      again). A place eats this share of the food it draws itself, the rest going to market towns and hamlets too small
      to show: capital all, city 80 %, town 40 %, fort 20 %, village 12 %. So capitals hold tens of thousands (the
      largest a few hundred thousand), towns a few thousand to ten thousand, villages about a thousand. A place by a
      deposit adds its miners, smelters and carters, fed by the food they buy: 15,000 × the deposit's worth squared
      (`MINE.people`; a rich gold or silver field ~15,000, as Kutná Hora had, a moderate one ~4,000, a rich garnet pit
      ~2,000); the infobox says how many of its people work the deposit. Land no place reaches feeds its farms and hamlets alone. A state's people are all the land
      it holds could feed; its places' people are part of that.
  The grid is at most 1024 wide (about 40 km a cell). Every distance and cost is in km, so the map reads the same at
  any Detail.
- **The legend**:
  - **States** (− / +, 2–48, 16 at first).
  - **Reach** (− / +): how far power reaches, in km of open, well-fed land. At first it is *auto*: 1.6 × how far
    apart the capitals stand. The buttons step through 300 … 7,000 km. A shorter reach gives smaller states, and more
    of them: new states rise wherever peopled land lies beyond every capital's reach (the count can pass the States
    knob).
  - **Borders** (− / +): how much the borders wind: *ruled* (the bare cost, no warp), *gentle*, *natural* (at
    first), *winding*, *wild*.
  - **Roads** (− / +): how much the roads wind off the cheapest way: *straight* (only smoothed), *gentle*, *natural*
    (at first), *winding*, *wild*.
  - **River borders** (on): big rivers are dear to cross, so borders settle on them. With it off, a river only joins
    its banks.
  - **Sea lanes** (on): coastal seas join the land around them. With it off, every sea divides.
  - **Metals** (on): capitals favour sites near metals.
  - **Reroll**: new names and a new cost noise.
  - **Reset**: shown once a capital has been placed, dropped or the reach set by hand. It undoes them.
  - Each state is listed with its colour, the people it could feed, how many regions it has and what it lacks. A key to
    the icons follows, then the trade hubs (their reasons, state and the places whose roads meet there), the bottlenecks
    and the flashpoints, each with its place.
- **Clicks: the infobox** (`v2/js/evolution/states-card.js`): click a state, a capital, a city, a trade hub, a town,
  a village or a fort (its pin or its name) to open a card on it, docked at the right as every other infobox (on a
  phone, under the view strip, or near the bottom when the pick is high up, so the card never hides it). A place's card
  says what it is (capital, city, trade hub, market town, town, village, fort), why it stands there (each reason in
  full), the people who could live in it, **Food from** (how far its market reaches; that land is **outlined on the
  map**: a soft fill and a line, rounded, holes where a nearer place pulls harder, stopping at its state's border) and
  the region and state it lies in. A state's card is short: the people it could feed and its area, its **Capital** (with
  why it stands), what it **Lives by** (its main focus: farming, sea, river or overland trade, mining, gold and silver,
  salt, gems, fine stone or holding its passes, from the reasons of its places weighted by their people), what it
  **Produces** (its metals, salt, gems and stone), what it **Lacks** (of iron, copper, tin and salt), the **Region** clicked
  (its name, its seat and the other states it is shared with) and all its **Regions** (the clicked one in bold) and, on a contested frontier, the rival that could as well hold it. The selected place is
  ringed. The card
  closes with × or Escape, and a click on the sea. It works the same over every view with the States overlay on.
- **Hand edits, from the card**: **Found a capital here** (on land, held or unclaimed) adds a state there; **Make it a
  capital** turns any other place into one; **Drop this capital** removes one (or one you placed). A new planet
  forgets these edits. They are not kept in the planet code. A drag still turns the planet; Ctrl-click still edits
  the plates.
- **Colours**: the categorical eight, recoloured so no two neighbouring states share one. Borders are ink, capitals
  are pins (white with a dark ring) and flashpoints are open pins.
- **Readout**: the state under the pointer and the people it could feed, the rival if the place is contested, and its
  capital (with why it stands), a city, trade hub, town, village or fort, a bottleneck or a flashpoint when one is near.
- **Export**: Food → States, as shown (colour only).

The Region pick hides in this view (it is the whole planet). On a phone the legend's buttons are 44 px.

**The States overlay** (`v2/js/evolution/states-overlay.js`): the **States** switch in the view strip lays these states
over every other view: Terrain, Satellite, the climate, Geology, Food. Each state's colour tints its land as a rim,
like a fresnel glow: full (100 %) on a border between states, falling off fast inland ((1 − d / 20 km)²) to none 20 km in: a narrow band
of the state's colour inside its border; the coast gets none. Both are fixed in `v2/js/view/look-config.js`
(`statesTint`, `statesFadeKm`): they were Tint and Range sliders, tuned by eye and taken out of the view strip (the
owner, 2026-11-25). The distance is plain km from the drawn border (a border with land of no state counts too), measured
on the overlay's whole-planet picture, so the band is as wide everywhere, with no gaps where three states meet; a zoomed-in tile
reads it from that picture. (It was the states' cost of travel read per cell of their grid, which cut the tint away in squares
along borders in the mountains.) Each state's borders with other states are drawn in its colour at full strength, and its regions' borders
finer and fainter, in its colour toward ink, half see-through (a region may run across a state's border: where the two meet, the state's line is the only one drawn); the coast is left as it is.
The regions show only with the view strip's **Regions** switch, beside States (off at first, remembered by the browser;
the owner, 2026-11-25: "the region highlight should be a toggle and regions should be invisible when this toggle isnt
enabled"): off, their borders, their names and the hover glow are all gone, here and on the States view itself, and only
the states show. With it on and a mouse, the region under the pointer **lights up** (the owner, 2026-11-25: "make the border and name shine a bit
when hovering over it"): its border, traced finely through the same warp as the drawn line, is lit in `map-label` with
a soft glow, its coast too (the owner, 2026-11-25: "highlight the coast, because that is missing"), and its engraved
name glows, each letter drawn again in its engraved twin's projected frame and standing on the same baseline (measured
on a canvas in the names' font, as SVG's own middle sits a sixth of an em higher) so the light lies on it. It fades in and out (none under reduced motion); touch has no hover, so a
phone is as before. The states' and regions' names are **engraved into the land** (the owner, 2026-11-24:
"just like the normal atlases in geography class do", "bind/burn them onto the surface", "truly edge into the surface"):
painted into the planet's own picture as the borders are, each letter fixed on the land and sized in km, so they turn and
zoom with it and never rearrange as the view moves. Each letter is cut in rather than printed on (`carve` in `SURFACE_NAMES`): the land shows through it, the fresh cut paler
(screened with `map-label`, as a letter cut in slate), with no dark edge (the owner:
"remove the black parts of it, it makes it less readable"); state and region names alike. On a zoomed-in tile a name
under 7 px is left out: no letter that small can be read. (A dark letter with a light copy behind it read as cheap, and
a dark letter with a light rim was not readable.) A state's or region's
**spine** (`spines` in `states-view.js`, its knobs in `SPINE`) is the long way through its land: the long axis of its
cells weighted by how far each is from the edge (east–west where the land is round: under 1.5 to 1), cut into 24 slices
across, each slice's weighted middle, and a gentle curve (a quadratic, its bow at most 12 % of its length) fitted to the
middles of the slices at least 40 % as thick as the land's thickest, run out to 1.2 times the land's breadth where it
has land. The name follows that curve (`SURFACE_NAMES` in `states-overlay.js`), read west to east, its letters spread to
fill 92 % of it (0.12 to 0.6 em apart). A state's name (EB Garamond 600, spaced capitals) is as tall as its land's
breadth allows, up to 220 km, on two lines where that lets it stand 1.25× bigger, and smaller (down to 0.3) where it
would not fit; a region's name (EB Garamond 600 italic) is always 40 km tall, on one line or two, whichever fits.
Every letter must lie on its own state's or region's land (its middle and four points round it; a region's name may cross a state's border, as the region does), clear of the names
already laid; where it does not, the name is tried moved off the spine (0.6 and 1.2 em either side) and, for a state,
smaller. A region's name, which cannot shrink and often shares its land with a state's name laid first, is then tried
with its letters closer, slid along the spine (15 % and 30 % of its length either way, `slides`) and moved off it in
steps of 0.6 em up to 6 em or its land's half-breadth (`regionShift`), so it goes round the state's name (the owner,
2026-11-25: regions "still not showing their names"; on the test planet 181 of 182 now show, against 147). Which names show, how big and where is
worked out once per set of states, never from the view: states first (a state with no room is left out), then the
regions; a name with no clear room is left out (a name over another, or over its
neighbour's land, reads worse than none). Zoomed in,
a name under 2 px on a tile is not drawn. The view strip's **Names** slider (0–100 %, remembered by the browser) sets
how strongly they show; at 0 they are gone. Then the capitals with a pin and their names beside them, and the other
places by importance, are drawn over the planet, never over each other. Each place is ranked by
the people living in it (log10, so a big city is not worth fifty villages), its tier (capital, city, town, fort, village)
and a little for each reason it stands (a trade hub, gold and silver, gems, a fort's crossing and a harbour count most).
Then the screen decides how many show: taking the most important first, each name keeps 110 px from every place name
already shown (about one name to 110² px of screen, however many km² that is at the zoom), and a name that would touch
another is left out. Zoomed out, only the top places get a name; zooming in brings in the lesser ones, a crowded valley
thinning before an empty steppe does. A town, fort or village is never named before its tier's spacing (130 km, 65 km
for villages) is 10 px on the screen, so the whole planet shows no lone village in an empty land.
Every resource
a state holds shows at every zoom, rolled up the natural regions: zoomed out, for each state and each resource (by what
it is: its iron, its tin, its jade), the most important place holding it; zoomed in, for each natural region of the
finest level whose regions are 160 px across on the screen (at the scale of the capitals on the screen), so a resource
moves from the state's biggest place holding it to the places it really belongs to as the view closes in. These are
laid right after the states' names, with no 110 px gap and no 10 px floor. Where its
whole name fits it is named; where it does not, only its mark and the badges of what it keeps show (beside the mark, or
before, above or below it), over a state's name if nothing else leaves room. Names are sticky: a place once named keeps
its name, before any other is weighed, until the view zooms out past the scale it was first named at (3 % slack), so
zooming in only adds names and never swaps one for another; only one carried off the frame's edge goes. Every place has all its reasons as small coloured badges before its name, as many as
it has (a fort its tower; the key is in the States legend), and a dot sized by its tier. The roads are drawn under the
names in a dusty tan over a dark brown casing (quieter than the names' white), main roads solid, roads dashed and village tracks dotted (the tracks once the villages show), and names are kept inside the map's frame. A picked place's food reach is
outlined on the map. On the globe,
names near or past the horizon are hidden. The overlay follows every knob and hand edit of the States view, and its places open the same infobox when clicked; on the States
view itself only the names and roads are drawn, over the rivers and lakes. It shows once the planet is finished and its food worked out, it is off at
first, and the browser remembers it. Zoomed in, the tiles are tinted at their own resolution so the borders stay sharp.
On Satellite, the clouds lie over it as over the land.

### World map detail (fork addition)

The globe and the map zoom down to 9.5 m a pixel, with a region's rolling and ridged ground and fractal coasts:
[world-map-detail.md](world-map-detail.md).

### Export past 16,384 px (fork addition)

Maps up to 65,536 px wide, drawn and saved a band of rows at a time: [export-bands.md](export-bands.md).

## Mobile Support

Generate is fully usable on phones and tablets:

- **Bottom-sheet sidebar** — on screens 768px or narrower, the sidebar becomes a bottom sheet with a drag handle. Drag or tap the handle to expand/collapse. The globe stays visible above.
- **Pinch-to-zoom** — two-finger pinch zooms the globe and map.
- **View switcher** — the layer list (top-left, across to the help button) holds every view: Terrain, Satellite, Heightmap, Plates, the climate's, Geology's and Food's; the Geology pickers stay under it.
- **Edit-mode toggle** — a floating pencil button (bottom-right on a phone; on a wider touch screen, a tablet, under the help button) activates plate editing. Tap it to toggle edit mode (it fills with the accent colour when active), then tap pieces to mark them. Tap the Rebuild button to apply all changes at once.
- **Touch-friendly targets** — buttons, chips, pickers and sliders are 44 px or more.
- **Performance** — detail warning thresholds are lowered on touch devices (orange at 200K, red at 500K); the finished picture is 2048 px wide; export widths above 4096 px are off.
- **Tips** — a tap on a **?** opens its words above it, kept on the screen (a tap elsewhere closes them); the **?** takes a finger's 44 px.

## What it builds

Generate builds one moment of a believable history — today's — in closed form, then finishes it with Evolution's own
finish (plans/GENERATE_REDESIGN_PLAN.md, plans/SHARED_CORE_PLAN.md):

- **The pieces** (the plates the sliders lay out and Ctrl-click reshapes; the layout is today's, so every planet code ever
  shared keeps its continents) are grouped whole into ~1.5 √P plates that move and carry continent and ocean, their
  edges along some coasts, their motion fitted from the pieces' own.
- **Today's boundaries** by kind — ridges, rifts, trenches (some splitting off island arcs and back-arc seas), collisions,
  transforms — and the sea floor's age away from its ridges.
- **The past in closed form** — the continents assembled from their pieces as old orogenies, their ages spread as a
  history's are (the cores ~2000 Myr old, the docking rings younger outward to the margins' 40–300 Myr, the pieces'
  seams 5–150 Myr), each worn as Evolution's history wears a range — faster the higher it stands, on Evolution's own
  clocks — so a range's age shows: young ranges high and sharp, middle-aged ones ridged hills, old ones worn low; cratons;
  seams closing into ranges or sagging into gulfs; the pieces' outlines bent by today's plates; continents that fit
  across their ocean; plumes, hotspot tracks and flood basalts; the far field pushing ranges inland.
- **A geological record** (plans/GENERATE_DEPOSITS_PLAN.md) — written by the history's own steps, in shortcut: the old
  crust worn deep before anything else, each range since by its age; a foreland basin in front of every range, today's
  and the past's; rift basins along every coast where an ocean opened and in the old failed rifts; shelves and inland
  seas; each place's sediment laid layer on layer by the latitude it lay at (limestone in warm seas, salt in the dry
  belts, coal in the wet ones, black mud where the sea was cut off); the arcs docked in the past and those swept inland
  behind today's; old flood basalts worn to their roots. Evolution's rocks, deposits and food read it on Evolution's
  clock, so Generate's ores sit where Evolution's would and in about its shares.
- **Ranges carved into massifs** (plans/GENERATE_RANGES_PLAN.md) — each range of the past, each rift and each range the
  far field squeezes up runs where its pieces met, on its own outline, but swells and pinches and rises and falls along
  it, and a fractal mask of its own carves it into massifs, lobes and spurs (the original Generate's way); where the mask
  leaves nothing, no belt and none of its rocks. Each is one of several kinds by what raised it and a roll of its own —
  a spine, a plateau behind a rim range, a broad fold belt, basement blocks, a narrow sliver, a knot. A rift is a chain
  of basins, each a half-graben whose high shoulder flips side to side, deepest where its plates open fastest and dying
  out where they barely part.
- **A Frame** written from all of it, as Evolution's history writes one — so Evolution's terrain draws the ground on
  Generate's mesh (fine relief, rift valleys, interlocking coasts, the ground held to the pieces), carved by its rivers:
  the first picture, in seconds.
- **Evolution's finish**, in the background (a few seconds more): the climate, the rivers carved again by its runoff with
  closed basins and sediment, lakes, the last ice age, dunes and loess, the rocks and their deposits, the land's cover
  (the Satellite view, with clouds), and its food.

## How It Works

### Pipeline

1. **The mesh** — a Fibonacci sphere of Detail regions (`js/sphere-mesh.js`).
2. **The layout** — Generate's pieces on a fixed ~20K reference grid, projected onto the mesh (`js/coarse-plates.js`, `js/plates.js`, `js/ocean-land.js`) and their motion (`js/plate-physics.js`); a planet code's edits toggle pieces. An edit reshapes the place edited, as on the old page: the
   world's past is the layout's as first built, the plates there before keep their pieces and their motion (a raised piece
   joins the plate it borders most), and each mechanism's draws are keyed by who they belong to, so the rest of the planet
   stays as it was (`v2/js/present/world.js`, `plates.js`) — a planet code's edits build the same.
3. **The present-day world** — on Evolution's 40K sim mesh (`v2/js/present/`): plates, boundaries, sea floor, coast, past, belts, plumes and far field (their ranges shaped by `ranges.js`), record, Frame.
4. **The ground** — Evolution's synthesis and carving (`v2/js/terrain/`) on Generate's mesh, with Generate's fine relief, rift valleys, interlocking coasts and hold to the pieces (`v2/js/present/world.js`); the uncarved surface kept for the finish. The ranges' ridges have the variety the owner asked of Evolution's on 2026-10-28, the same in both tools: old belts a little less even than young ones, the ridges undulating at every scale about their own wavelength, and more ridge noise at three scales (`v2/js/terrain/terrain-config.js`).
5. **The first picture** — the ground and its hillshade, painted on the GPU (`v2/js/view/planet-view.js`).
6. **The finish** — Evolution's (`v2/js/finish/finish.js`), in its own worker, from that surface: the climate (`v2/js/climate/`), bedrock, rivers, sediment, hillslopes, the ice age, wind, sea, water, detail drivers, geology, the land's climate and cover, deposits, farming — then its pictures. Rivers end at the shore, not out at sea: [river-mouths.md](river-mouths.md).

## Code

Generate and Import live in `js/` (the climate they run is `v2/js/climate/`; Generate's present-day world is
`v2/js/present/`, listed in `v2/README.md`):

```
js/
  main.js               Generate's page, on the shared core (plans/SHARED_CORE_PLAN.md): the worker's present-day world as
                        the first picture, Evolution's finish in the background, on Evolution's planet view, layer bar and
                        export (v2/js/view/planet-view.js, layer-bar.js; v2/js/evolution/export.js); its own: the sliders,
                        the planet code, the plate edits, the build overlay, the tutorial and What's New
  import-main.js        Import's page, on the shared core: the image's heights as the first picture, Evolution's
                        finish in the background (its climate, rivers, lakes, ice, dunes, Satellite, Food — no Frame, so
                        no Geology)
  page-chrome.js        The chrome both pages share: slider bubbles, the Detail warning, the side panel and bottom sheet,
                        the build overlay, the tutorial
  a11y.js               Every tool page's keyboard and screen-reader basics (Evolution's too, loaded after each page's own
                        module): the dialogs (named, focus in and back, Tab kept inside, inert while closed), the "?" tips
                        (buttons with their words as a description, shown beside or above them, never off screen), the
                        controls' names from their labels and the sliders' values as shown
  generate-plates.js    Generate's own layers on the planet view: the Plates view (colours, boundaries, arrows; its export
                        map), the Inspect list's layers of the world's past, the edits pending drawn over the picture
  present-crust.js      The present-day world's crust in words (the hover's Crust line)
  planet-worker.js      The worker: the present-day world (v2/js/present/) or an imported heightmap, sent with the finish's job
  state.js              The touch device and edit mode
  planet-code.js        Planet code encode/decode (seed + sliders + edits → base36)
  piece-shapes.js       The characters (Flat, Hilly, … Ocean), each with its paint colour token, and how each reshapes ground
                        (the paint layer's; also an old link's plate-wide characters and Level)
  detail-stops.js       The Detail stops every page shares and each page's machine-dependent top stop
  build-gate.js         Every tab's builds share the memory budget (a build waits for room)
  world-keep.js         The world cache: a finished world kept in this browser by its planet code, opened again in a second
                        instead of built (docs/world-cache.md, Generate)
  world-keep-worker.js  Saves a world for the cache: deflates the bytes world-keep.js hands it, puts the ZIP in IndexedDB
  build-error.js        A failed build or import shown in the build overlay, with a Close button (every control stays live during a build)
  view-strip.js         The view strip above the layer tabs (every page), folded behind an arrow: Globe | Map and what applies,
                        the projection picker; in the sheet on phones
  stage.js              The stage round the globe (the theme's desk, or space with Stars), the air, map colours from tokens
  graticule-frame.js    The gold ring round the globe (at home zoom) and the gold frame round a map, in every projection:
                        ticks and degrees where the grid lines meet them, in step as the view turns, pans and zooms
  graticule-view.js     Generate's and Import's globe and map, handed to the graticule frame each frame
  open-area.js          The room beside the open sidebar: where the globe, the map and the bars over them sit (--open-left,
                        --open-shift; centred on the window with room to spare, on the space beside the sidebar when short)
  map-band.js           The band a flat map is fitted in (every page, Evolution too): below all that sits over the planet,
                        above the hint or the timeline, room for its frame's numerals; it glides when the tabs' rows change
  theme.js              Classic script in each page's <head>: Paper or Night, the device's choice until the theme switch
                        saves one (before the first paint, so no flash); window.orogenTheme lets the globes' stage follow
  support-check.js      Classic script run before the modules: a browser that cannot run the app (no import maps, no
                        WebGL) or app code that fails to load gets a plain message instead of a blank page
  rng.js                Seeded PRNG (Park-Miller LCG)
  simplex-noise.js      3D Simplex noise with fBm and ridged fBm
  sphere-mesh.js        Fibonacci sphere, Delaunay, SphereMesh dual-mesh
  coarse-plates.js      The pieces' layout on a fixed ~20K reference grid, projected onto the mesh
  plates.js             The pieces' growth (farthest-point seeding, round-robin flood fill, compactness) and smoothing
  ocean-land.js         Ocean/land assignment of the pieces with continent seeding
  plate-physics.js      The pieces' motion (drag, slab pull, ridge push, mantle flow)
  terrain-config.js     The layout's and the old terrain's constants
  terrain-post.js       Import's image shaping (warp, smoothing, ridge sharpening, soil creep); the old terrain's erosion
  color-map.js          Generate's elevation scale ↔ km (an imported image's grey is read through it)
  climate-layers.js     The climate's colour scales, legends and words (shared with Evolution's climate views)
  climate-new.js        The new climate on a V1 mesh (the climate's tuning tools)
  elevation.js, super-plates.js, koppen.js, climate-config.js, climate-util.js, wind.js … temperature.js
                        The old pipeline (terrain and climate) — no longer run by the pages; kept as the climate's tuning
                        tools' synthetic planets (tuning/climate/lib/gen-planets.mjs) and the climate lab
```
