# The zoomed tiles kept on disk

Asked for by the owner, 2026-11-22: the zoom's detail tiles drawn once per zoom level, and kept on disk rather than in
memory ("we already have 4gb of ram usage, so im trying to offload some of that"). Code:
`v2/js/evolution/detail-tiles.js` (DetailTiles, tileRange), `v2/js/evolution/tile-store.js` (TileStore). Back to
[world-map-detail.md](world-map-detail.md).

## Where the memory went

Generate at 2.56M Detail, finished, zoomed in over land (the app's browser pane): the page's process held 3.4 GB, its own
thread 2.06 GB of that. Summed by what holds it:

| Holder | MB |
|---|---|
| The zoomed tiles (274 of them, ~1.6 MB data and two 258-px canvases each) | 488 |
| The finished pictures kept (`finished-painter.js`, capped at 160 MB on purpose) | 183 |
| The climate's, the farming's and the geology's rasters | 363 |
| The terrain mesh | 113 |
| The GPU painter's triangles, built and never drawn | 104 |
| The rest of the finished world (heights, water, rivers, drain) | ~440 |

The rest of the process is the workers: the planet worker keeps its world for edits and Reapply.

## What changed

- **Each tile on disk as it is drawn.** `TileStore` keeps it in IndexedDB, which stores values this large as files,
  out of the page's memory. A tile wanted again (zoomed out and back in, panned back, a tile let go from memory) is
  read from there in a few ms instead of drawn by the workers (~0.1–0.3 s). Its key carries the rivers drawn (their
  valleys are in it), so turning rivers off and on keeps both sets.
- **Memory holds only what the view needs.** A drawn tile keeps what the read-out under the pointer reads (heights,
  sea, water, water level: `data`) and its painted canvases. Its whole data (`full`: with the shore's ramp and
  colours) is read back from disk only to paint it for another look, and let go once painted (`painted`). Off the
  view, tiles leave memory past `keep` (260 desktop, 48 touch: one view).
- **The GPU painter's triangles** (`gpu-paint.js`) are built when first drawn, not when the mesh is set: they were
  ~100 MB held for a mesh the GPU never drew.

## Measured after

Same world, page and pane, 2026-11-22, zoomed in over land:

- A tile in memory: 0.93 MB (0.52 data, 0.41 canvases), down from ~1.8 MB. Its whole data is held only between a
  disk read and its paint (0 MB at rest).
- The page's own heap on the terrain layer: 1.52 GB, down from 2.06 GB. Satellite opened adds its picture drawn ahead
  (~0.35 GB, `prepareSatelliteSoon`), as before.
- 150 in-memory tiles dropped and the view moved: 160 read from disk (~2 ms each), and only the 40 new edge tiles drawn
  by the workers; no frame over 17 ms. A layer switch: every tile repainted from disk, with no worker jobs.
- The GPU painter's triangles: built only once the GPU draws, their arrays let go after upload (0 MB on the page).
- The process stays ~3.5 GB. The rest is the layer rasters, the planet worker's world and the GPU's own copies
  (see the table): untouched here.

## The store's life

- One database per page (`orogen-tiles-<time>-<id>`), held by a Web Lock while the page lives. On start, every such
  database whose lock is free (its page gone) is deleted, so a closed or crashed tab leaves nothing for long, and a
  tab still open keeps its own. On leaving, the page deletes its own.
- Only the world shown: a new world clears it. At most 2,500 tiles (~4 GB), the oldest dropped past it (drawn again if
  wanted).
- Wherever the disk fails (no IndexedDB, the disk full, the page restored from the back-forward cache with its
  database closed), the tile is drawn again: the view never waits on it.

## Keep it so

- A tile's whole data is read through `DetailTiles.full(t)`, never `t.data` (only the read-out's fields), and
  `painted(t)` lets it go after painting.
