# Region view: the chosen valleys and the finer detail (fork addition)

How the opened region's window draws the chosen valleys and the finer ground when zoomed in. Parent:
[region.md](region.md).

## The chosen valleys (`js/region-mask.js`)

The window's mask is cut from the same valleys' map the pick uses (`gridAt` in `js/region-grid.js`, through
`valleyAt` in region-pick.js), so the opened region shows the valleys as picked: smooth valley shapes, edge rivers on
their drawn line, the region's own coast. It is read at half the region's cells with the region's own sea share; the
parts (chosen, border, beyond) come from a chamfer distance to the chosen land, and the outline is traced by marching
squares, smoothed (Chaikin) and drawn as closed dashed loops. The window opens on the ground first; the parts come in
about 0.3–0.4 s later. Checked: at 1,359 land points the mask and `gridAt` agree on all of them (only one sea point
fell in the sample, so the coast is barely tested by it). The tracer's first version stored each segment at twice its
index, so the walk jumped between unrelated segments and drew straight lines across the region (656 scraps, steps up
to 245 px); fixed, two valleys trace as 10 closed loops with no step over 0.52 screen px, and a disc, two blobs and a
ring trace as 1, 2 and 2 loops.

## Rivers as shared lines (`v2/js/region/region-rivers.js`)

The region's rivers are traced once as polylines from its flow (main stem along the largest donor, side branches
starting a cell down the main stem), smoothed twice and sorted into width classes (×4 water a class). The same lines
are drawn over the region and over its zoom tiles, and each tile cuts its river valleys along them with no wander, so a
river never jogs at a tile's edge.

## Zoom tiles (`region-tiles.js`, `region-tile-worker.js`, `region-refine.js`)

- **When**: zoomed in to 2.5 screen pixels a region cell or more, the view's piece of the region is built again, after
  the view has rested 250 ms, at 2…64 tile cells a region cell (about one and a half screen pixels a cell, at most
  1024² cells; the factor drops until the view fits). The window zooms to 160 screen pixels a region cell, so a 1024
  region reaches 16–24 m a cell and a 2048 one about 8 m. Zoomed out past 2.5 the tile is hidden.
- **Ground**: the region's worn heights read bicubic, plus the region's own detail noise carried on down its octave
  ladder (only the waves finer than the region's cells, same seed), so the tile is the same ground with more showing.
  Sea, lakes, climate and colour are the region's, read smoothly; temperature takes the added height down the lapse
  rate. The region's rivers are cut in along their lines, then the tile is worn down 8 rounds (gullies and coves at
  that scale).
- **Coast**: the tile's sea is its own ground below 0 joined to the region's sea, so each finer tile draws a finer
  coast: at 24 m, bays and inlets a few hundred metres across inside one 1.5 km region cell.
- **Edges**: a margin is built and cut off when drawn: 64 tile cells or more (4 region cells at ×16 and coarser, 1 at
  ×64; counted in region cells it would leave a ×64 tile 8 region cells of picture), so the margin's erosion never shows; the tile then
  fades in over its outer 2 region cells. Without the fade the heights jumped up to ~200 m at the edge in mountains;
  with it the brightness step across the seam (1.0–6.6) is below the terrain's own largest step beside it (4.6–19.2).
- **Measured**: 1024² tiles at 257 m (×4), 128 m (×8), 64 m (×16) and 24 m (×64 of a 1547 m region) a cell, about
  2.8 s each (0.7 s over open sea); at 24 m the slope changes from cell to cell (3–8° over 24 cells on a 140–190 m rise); the readout gives the
  tile's own cell ("Zoomed 64 m a cell").
- **Limits**: a tile's own small streams are worn into its ground but not drawn as lines; only the region's river
  lines are.
