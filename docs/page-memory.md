# The page's memory at rest

What a finished 2,560,000-Detail planet keeps in the tab once it is built (nothing zoomed), and what was cut so it keeps
less. The zoomed tiles' own share is in [tile-disk.md](tile-disk.md).

## Cut

- **The workers keep only the Detail shown.** The Detail ladder ([progressive-detail.md](progressive-detail.md)) builds
  every step from 5,000 up; each step's terrain mesh stayed on the synthesis, carving and shading workers (chunk
  positions, the carving's caches), about 0.4 GB by 2.56M. `TerrainPool.keepOnly(tMesh)` (terrain/terrain-pool.js), called
  where a Detail's terrain is asked for (js/planet-worker.js, app/phases/phase8a-terrain.js, evolution/terrain-player.js),
  sends `forget` for every mesh but the sim mesh, the carving ladder under the shown Detail and the shown one. A mesh
  forgotten is sent again if a build asks for it.
- **The rivers' segments drawn once.** The drawn rivers (evolution/river-draw.js `riverSegments`) and the valleys cut
  under them (finish/river-valleys.js `riverLines`) hold the same segments in the same order; the drawing now uses the
  valleys' array instead of building its own copy (47 MB at 2.56M). A check logs `[rivers] the valleys' lines hold …`
  if the two ever differ.

## Measured (2.56M Detail, built, nothing zoomed)

| | Process | Page heap |
|---|---|---|
| Before | ~3.4–3.5 GB | ~1.5–1.8 GB |
| Workers keep only the Detail shown | 3.05 GB | 1.57 GB |
| Rivers' segments drawn once | 2.95 GB | ~1.57–1.61 GB (between collections) |

## Left as it is

- The finished picture's own layers (heights and lake levels 64 MB each, sea, water, ponds 32 MB each, the Satellite
  view's three seasons 24 MB each, the rocks' and farming's layers): each is what a view or the tiles read.
- The terrain mesh (its neighbours, positions and triangles, ~108 MB): the globe, the tiles and picking read it.
- The overlay canvas of the lines (32 MB): drawn again only when the lines change.
- The lines as 32-bit numbers (half the 47 MB): the meanders' phase runs on the distance along in km, and a tile kept
  on disk was cut with the 64-bit lines — a fresh tile beside it would bend slightly differently.
