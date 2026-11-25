# The Satellite's sea: no blue halo round the coasts

Asked for by the owner, 2026-11-20, with a Satellite screenshot of a pale, blotchy light-blue band along a coast: "you
didnt fix the blue halo, where is that coming from?". Code: `v2/js/evolution/climate-view.js` (`SEA_DEPTH`, the wet
branch of the Satellite paint), `v2/js/finish/shore-ramp.js` (`SHORE.kSea`, `clearM`), `v2/js/finish/finish-coast.js`
(`flatShare`). Back to [world-map-detail.md](world-map-detail.md).

## Where the halo came from (three causes, measured in the browser)

Checked at about 4.6 km a screen pixel off a coast at 60–75°E on the equator, seed p795k7iyxrsqyfooyv2irb.

1. **The water's colour brightened over the shelf.** The depth table went from (4, 10, 34) at −6 km to (30, 80, 128) at
   0 m, plus a warm turquoise down to 120 m. Every shelf, 100–250 km wide, was a pale blue band. After a first
   flattening to (10, 26, 62) at 0 m the rendered sea still read (10, 26, 62) next to the coast against (4, 10, 34) out
   deep: nearly twice as bright, and blotchy because the shelf's depth is interpolated between 50 km cells.
2. **The water was as clear as the open ocean.** `SHORE.kSea` was Jerlov I–II, 0.03 per m in blue, so the sandy bed
   showed through 10–40 m of shelf. Thousands of pixels a tile drew sand through that depth tens of km out.
3. **The heights made too much shallow water.** A muddy macrotidal coast raised whole sea cells up to a hop out to a few
   metres deep. On a mesh with 50 km edges that is 50–100 km of near-flat water, interpolated to 5–40 m over 100–250 km.

## The fix

- **One water colour.** Light reaches the bed only through the top few metres of coastal water, so water deeper than that
  has the same colour over a 100 m shelf as over the abyss. `SEA_DEPTH` now runs only from (3, 9, 31) at −6 km to
  (4, 11, 35) at 0 m.
- **Coastal water.** `SHORE.kSea` is Jerlov coastal 1: 0.42 · 0.10 · 0.13 per m (R · G · B). The ramp's depth `clearM`
  went from 20 m to 8 m, so the shore's soft transition keeps about the same width. Cold seas stay ×2.5 more turbid.
- **Flats by their true width.** The flats and the marsh raise a cell only by the share of it their band covers
  (`flatShare`: flats 0.35 km a metre of tide, marsh 0.12 km), so a coarse mesh no longer makes 100 km of mud flats.
- Relief and the other Terrain palettes keep their shelf colours: a hypsometric map shows depth by colour on purpose.
  They share `kSea` and `clearM`, so their shore ramp got the same coastal water.

## Checked

- The sea's colour by depth with today's `kSea` (the wet branch's formula, Node, 2026-11-20): warm water reaches the deep
  colour (4, 11, 35) by 30 m and is (4, 14, 36) at 20 m; cold water by 15 m. Only the last 5–15 m by the shore show the
  sand turquoise. Before, the bed showed through to about 40 m and the water itself brightened to 0 m.
- On screen it first could not be checked: the desktop app's browser pane had stopped loading workers started inside a
  worker, so no world built there. After a restart it built again; measured in round 2 below.

## Round 2: the cyan line at the waterline

- The owner, 2026-11-21, with seed kw90o1bhzofloqo0b0z59b: "and of course you didnt fix it". The wide band was gone, but a
  thin pale cyan-white line hugged every coast.
- The cause: the sea's bed was a fixed light sand, (196, 184, 150). At the waterline the water's opacity is 0, so the bed
  showed bare, and a few metres out it showed turquoise. Against dark green land that is a bright outline 1–2 px wide at
  every zoom.
- The fix: the sea's bed is the nearest land's own colour (`landPixel`, `landBlend`), as a lake's already was. Open sea,
  with no land near, shows no bed. The shore now fades from the land into the water.
- Measured on that seed, Generate's Satellite map, the rendered canvas read across the shore:
  - 9.5 km a pixel: land (82, 98, 45), then (48, 80, 44), then (7, 23, 36), then sea (4, 12, 36);
  - 3.8 km a pixel: land, then one pixel (6, 33, 35), then sea (4, 12, 36).
  - No pixel at the shore is lighter than the land.

## Round 3: no depth at all

- The owner, 2026-11-22: "the satellite view is not properly showing ocean depths". The one-colour sea had none: the
  abyss, the ridges and the shelf were all (3–4, 9–11, 31–35), and the floor's relief swung the light by only ±5–10 %
  (`ks = 0.8 + 0.2 · k`).
- A true-colour satellite sees no depth past about 30 m; the depth people expect from a satellite map is the
  bathymetric shade Google Earth and Blue Marble's bathymetry sheets paint on. Satellite now does too, kept dark.
- `SEA_DEPTH`: (1, 3, 14) at −8 km, (1, 5, 20) at −6, (2, 8, 27) at −4.5, (4, 12, 35) at −3, (5, 15, 42) at −1.5,
  (6, 18, 47) from −0.2 km to the coast. The shelf is one flat colour, so its step sits at the shelf's break, not a glow
  that brightens toward every coast (round 1's halo) and not blotchy with the shelf's interpolated depth.
- `SEA_RELIEF` 0.7: the floor's light swings 0.62–1.22, so ridges, seamounts and trench walls are shaded.
- A first try darkened only the deep and left the shelf at (4, 11, 35): too faint to read on screen.
- Checked on seed jq67rm7h9rdhnszvoli9rb, Generate's Satellite map, before and after.

## Lesson

- Round 3 of [shore-transition.md](shore-transition.md) called the remaining band "the shelf, by design" after a look
  at Relief only. Every look that draws the sea (Satellite, the Terrain palettes) gets checked before a halo is called
  fixed.
