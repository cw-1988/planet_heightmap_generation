# The shore: the sea on its contour, and water you see into near the shore

Asked for by the owner, 2026-11-20, with two screenshots: tan blocks at −3,730 m out at sea on Evolution's Terrain view,
and a lake's hard blue edge. "give it some transparency that tapers off the deeper the lake/sea gets... and if the
sea/lake drops off too fast give it a minimum transition distance". And on the Satellite: "i think we should make an
exception here, because it just looks weird". Code: `v2/js/finish/shore-ramp.js`. Back to
[world-map-detail.md](world-map-detail.md).

## The tan blocks: the cause

- `finishRaster` (finish.js) marked a pixel sea when its nearest mesh cell was ocean: the cell's Voronoi block.
- Beside a steep drop, a coastal land cell's pixels were blended down to −3.7 km and still counted as land.
- Land's colour is clamped to the lowest land entry, so those pixels showed as flat lowest-land tan: blocks out at sea.
- The enlargers had the same fault in other forms: `rasterAt` and `coastReach` took a weighted majority of the picture's
  sea, and `fineWindow` turned ground below 0 m into sea only near the coast.

## The fix: one sea rule

- A pixel is sea when its ground is below 0 m and one of its source pixels (three cells in `finishRaster`, four picture
  pixels in the enlargers) is the sea's. The coast is the heights' 0 m contour.
- `seaHere` (shore-ramp.js) is that rule for every enlarger: `fineWindow` (fine-detail.js), `coastReach`
  (coast-distance.js), `rasterAt` (finish-view.js). `finishRaster` uses the same test on its cells.
- A hollow below 0 m that the sea does not reach stays land.

## The ramp

- Each water pixel (sea, an open lake; not a salt pan) gets its distance to the nearest dry pixel: a chamfer of the wet
  mask (`wetDistance`).
  - Zoomed tiles compute it on `fineWindow`'s margin grid, so neighbouring tiles agree (`windowWetDistance`); it travels
    with the tile as `shore`.
  - The world picture computes it once per width and keeps it with the moment (`rasterShown`).
- The ramp's length (`rampKm`): at least `minKm` 4 km and a pixel floor, but at most the fine window's margin less a
  pixel (`marginPx`, fine-detail.js). Inside the margin the distance is exact, so tiles agree.
  - The pixel floor is `minPx` 10 up to `pxAtKm` 0.4 km a pixel (where 4 km is longer anyway), then × (0.4 / pixel km)^0.6,
    at least `farPx` 1.5: about 6 px (5.8 km) at 1 km a pixel, 3.3 px at 2.5 km, 1.5 px (15 km) on the world picture.
- t = distance / ramp (0 at the shore, 1 at the ramp's end and beyond). Two things ride on it:
  - **The depth shown**: min(depth, `clearM` × t² / (1 − t)), `clearM` 20 m. That is 5 m a third of the way out, 20 m
    half way, and the true depth from the ramp's end on. So a window that over-reads a far distance changes nothing.
  - **The water's opacity** over its bed: smoothstep(t) (`shoreOpacity`). At the shore you see the bed alone, and the
    water fades in over the ramp.
  - **The bed's relief** keeps its full hillshade at the shore and softens to 0.35 as the opacity rises (`underWater`,
    finish-view.js). It once dropped at the waterline and the grain stopped there: [small-lakes.md](small-lakes.md).
- The water fades by Beer–Lambert over the seen depth (`lakeMix`, [lake-water.md](lake-water.md)), then blends over the
  bed by the opacity. The deep colour stays at the true depth.
- The sea's water: K 0.42 · 0.10 · 0.13 per m (R · G · B), coastal water, Jerlov coastal 1 (`SHORE.kSea`); the ramp's
  depth `clearM` 8 m to match. (It was the open ocean's 0.38 · 0.065 · 0.03 with `clearM` 20 m: [satellite-sea.md](satellite-sea.md).)
- **Round 1 was not enough** (the owner, 2026-11-20: "not good enough..."):
  - Round 1 used a linear ramp of 0.5 km or 2 px, with the depth reaching 30 m at its end.
  - Red is gone under a few metres of water, so the land's colour turned cyan within one pixel. It was still a hard line.
  - Round 2 made the ramp wider and added the opacity taper.
- **Round 3, "a weird blue halo outline… the beach too present on the outest zoom"** (the owner, 2026-11-20):
  - the 10-pixel floor held at every zoom: on the world picture (9.8 km pixels) that was about 100 km of made-up
    shallows round every coast. Its first fifth showed the bare sand bed (the water's opacity is 0 there), then the bed
    turned turquoise under the held-low depth: a sand line and a pale rim, with a visible outer edge at 1 km a pixel too;
  - the floor now shrinks with coarser pixels (above). Checked A/B in the browser at 22 km, 5 km and 1.1 km a screen
    pixel: the rim and its edge are gone, and the shore stays soft over 2–3 px.
  - It was not the whole halo. On the Satellite a pale blue band 100–250 km wide stayed, and was wrongly called the shelf
    "by design" after a look at Relief only: [satellite-sea.md](satellite-sea.md). (On Relief the shelf's paler blue
    stays: a hypsometric map shows depth by colour.)

## Where it is drawn

- **Terrain** (`paintFinished`, `paintWindow`, `paintSea`): the bed is the palette's lowest land colour, shaded. Only
  palettes whose sea is blue (`blueSea`); Grey and Heightmap keep their plain depth colours, since they are data.
- **Lakes** (`paintLake`): the bed through the seen depth.
- **Satellite** (climate-view.js): the nearest land's colour as the sea's bed, through the seen depth over the water's dark
  bathymetric shade (flat across the shelf), then sea ice. A fixed sand bed drew a cyan-white line at every shore: [satellite-sea.md](satellite-sea.md). A lake's bed is the nearest shore land's colour from space, through its seen depth over the lake's own depth shade (flat in the top 20 m): [lake-water.md](lake-water.md).
- A real satellite cannot see far into the sea either, but a hard shore line looked wrong, so the Satellite gets the same
  ramp.
- The shoreline itself (beaches, cliffs, flats, marsh, surf) is drawn over this by `littoral.js`:
  [coast-processes.md](coast-processes.md).
