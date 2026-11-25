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
- **The sphere mesh keeps only its neighbours.** `SphereMesh` (js/sphere-mesh.js) holds the cell count and the
  neighbour lists; the Delaunay triangles, half-edges and per-cell triangle lists were built and never read again
  (~190 MB at 2.56M, in the planet worker and on the page).
- **The carving's caches let go once the ground is drawn.** v2/js/present/world.js calls `forgetMesh` (carve.js) and
  `forgetEdgeKm` (core/min-heap.js) for the terrain mesh after its ground is carved (~0.25 GB in the planet worker).
- **The worker keeps only what the world shows.** js/planet-worker.js `unread` drops the carved ground's drainage,
  receivers, order, lava, young rock and cut flags, read only while it is drawn.
- **One copy of the uncarved surface.** The finish's surface ({heightKm, recCell, cues, carveIn}, ~150 MB at 2.56M)
  stays in the planet worker; the page asks for it when a finish starts (js/surface-ask.js, the worker's `surface`
  command) and hands it to the finish worker as transfers. The page held a second copy for as long as the world. The
  planet worker now hands its own copy over too and keeps only the heights; a second finish on the same world has the
  rest drawn again ([generate-memory.md](generate-memory.md)).
- **Textures' images made when first painted into.** planet-view.js `texture()` creates its ImageData lazily: the GPU
  painter never uses it (8 MB a 2048 texture).
- **The Satellite styling's inputs let go once styled.** evolution/sat-style.js drops a picture's shares, riverside,
  land means and large-scale fields when every season is styled (~50 MB at a 4096 picture).

## Measured (2.56M Detail, built, nothing zoomed)

| | Process | Page heap |
|---|---|---|
| Before | ~3.4–3.5 GB | ~1.5–1.8 GB |
| Workers keep only the Detail shown | 3.05 GB | 1.57 GB |
| Rivers' segments drawn once | 2.95 GB | ~1.57–1.61 GB (between collections) |
| Sphere neighbours only, carving caches, unread fields (private bytes) | 2.07 GB | 1.24 GB |
| One copy of the surface, lazy images, Satellite inputs let go (private bytes) | 1.96 GB | 1.15 GB |

Of what is left, the planet worker holds ~390 MB (the world's mesh and present-day fields, its surface ~150 MB of
that) and the page's heap ~1.15 GB.

## Left as it is

- The finished picture's own layers (heights and lake levels 64 MB each, sea, water, ponds 32 MB each, the Satellite
  view's three seasons 24 MB each, the rocks' and farming's layers): each is what a view or the tiles read.
- The terrain mesh (its neighbours, positions and nearest-cell index, ~107 MB): the globe, the tiles and picking read it.
- The planet worker: brushing, edits and the finish read its world; ended between uses, each would rebuild it (minutes
  at 2.56M).
- The carving's inputs in the surface (12 fields, 123 MB): drawing them again takes the ground's whole synthesis.
- Per-frame work (the patch's view signature, the overlays' sync): a few short strings a frame; the globe renders only
  when something changed.
- The overlay canvas of the lines (32 MB): drawn again only when the lines change.
- The lines as 32-bit numbers (half the 47 MB): the meanders' phase runs on the distance along in km, and a tile kept
  on disk was cut with the 64-bit lines — a fresh tile beside it would bend slightly differently.
