# Sea-level history: drowned valleys and raised shores

Asked for by the owner, 2026-11-20 ("now do those", on the missing list in [coast-processes.md](coast-processes.md)).
Code: `v2/js/finish/coast-history.js` (`coastHistory`, `raiseTerraces`), called from `fine-detail.js`; the drowning is
cut in `river-valleys.js` `carveValleys` (its `drown` option).

## The science

- In the last ice age the sea stood ~120 m lower. The rivers cut their valleys down to that shore.
- The sea rose to today's level by ~7,000 years ago and flooded the valleys' lower reaches.
- Where the land has stayed put, those are drowned valleys today: rias (branching inlets in hilly country) and estuaries.
- Where the land rises, old shores stand above the sea as raised beaches and marine terraces:
  - on an active margin lifted by its plates (California, New Zealand, the Andes);
  - on ground rebounding since its ice sheet melted (Scandinavia, Hudson Bay, Scotland).

## How much each coast has risen (`emerge`, 0 … 1)

- Active margin: `active` × (0.4 + 0.6 × `young`), more while its belt still rises.
- Ice rebound: the ice sheet's thickness (`scour`) at 0.1–0.6 (none … all).
- The larger of the two.

## Rias

- Each land pixel within 6 km of the coast gets a drowning depth: 35 m × (1 − emerge) × (1 − cold), fading out between
  2.5 and 6 km inland.
- A muddy river fills its drowned valley (an estuary's flats, a delta): × (1 − 0.7 × fill), fill = `muddy` at 0.3–0.8.
- Fjords (`cold`) are left to the carve's own glacial valleys.
- carveValleys deepens each valley's floor by it, across the valley's V (its walls too, less toward their rims), and
  lets the floor fall that far below the sea. The sea rule then floods it: a narrow, branching inlet up each valley, as
  wide as the water fills the V.

## Marine terraces

- Steps of 25 m on a lifted margin, 15 m on rebounding ground (blended by their shares).
- At most 3 levels above the sea, within 3–4.5 km of the coast (all … none).
- None on ground steeper than 0.15–0.3 km per km (a cliff).
- Each step: 25% of it a bench and riser eased over the whole step, the rest an even rise (`bench`). So a terrace is a
  gentle swell in the slope, a few metres at most, not a stair.
- The steps are cut into the picture's own smooth rise from the coast, not into the finer detail, so a bench runs along
  the coast. Over the whole stretch the detail is calmed by 50%.
- Every weight falls off across the ground (from the coast, by the slope, in patches), never with height.
  - Eased in over the first 1 km from the picture's coastline (`shoreKm`).
  - In stretches ~7 km long (`patch`), never a whole ring round an island.
- The old shores' height wanders: ±25% over ~40 km along the coast (uneven uplift), ±30% over ~5 km, so a bench
  crosses the slope's contours rather than following one.
- Drawn once a pixel holds 1 km.

### Rounds (the owner, 2026-11-20)

- Round 1 stepped the detail's height too, and every knoll near an active coast got rings of contour lines ("wtf is
  this?").
- Round 2 had flat benches with risers eased over 65% of the step, at full height. Under the ×20 hillshade each old
  shore drew a contour line, rings within rings round a risen island ("fix the obvious flaw"). Turning the hillshade off
  would only have hidden them.
- Round 3 found three causes, all one kind: a weight that switches over a narrow band draws a line.
  - The calm was eased in over half a step of height and faded out over the top step's height. On a steep flank a few
    tens of metres of height is a band a few tens of metres wide.
  - It started at full weight on the picture's first land pixel. The waves and the wiggle had moved the drawn coast out
    past that pixel, so the switch fell on land as one line along the coast.
  - The riser bunched into the upper two thirds of the step.
- Checked live at 52–136 m a pixel: no rings, and the stretch that had two or three streaks shows a soft swell.

## Limits

- One sea-level history for every coast: no local subsidence (a delta sinking, a forearc dropping).
- Rias need the drawn river lines. A valley too small to be drawn is not drowned.
- Only the lowest three terraces. Coasts lifted hundreds of metres (Papua's Huon Peninsula) have many more.
