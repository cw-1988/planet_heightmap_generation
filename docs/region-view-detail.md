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
fell in the sample, so the coast is barely tested by it).

## Rivers as shared lines (`v2/js/region/region-rivers.js`)

The region's rivers are traced once as polylines from its flow (main stem along the largest donor, side branches
starting a cell down the main stem), smoothed twice and sorted into width classes (×4 water a class). The same lines
are drawn over the region and over its zoom tiles, and each tile cuts its river valleys along them with no wander, so a
river never jogs at a tile's edge.

## Zoom tiles (`region-tiles.js`, `region-tile-worker.js`, `region-refine.js`)

- **When**: zoomed in to 2.5 screen pixels a region cell or more, the view's piece of the region is built again, after
  the view has rested 250 ms, at 2…16 tile cells a region cell (about one and a half screen pixels a cell, at most
  1024² cells; the factor drops until the view fits). Zoomed out past that the tile is hidden.
- **Ground**: the region's worn heights read bicubic, plus the region's own detail noise carried on down its octave
  ladder (only the waves finer than the region's cells, same seed), so the tile is the same ground with more showing.
  Sea, lakes, climate and colour are the region's, read smoothly; temperature takes the added height down the lapse
  rate. The region's rivers are cut in along their lines, then the tile is worn down 8 rounds (gullies and coves at
  that scale).
- **Edges**: a 4-region-cell margin is built and cut off when drawn, so the margin's erosion never shows; the tile then
  fades in over its outer 2 region cells. Without the fade the heights jumped up to ~200 m at the edge in mountains;
  with it the brightness step across the seam (1.0–6.6) is below the terrain's own largest step beside it (4.6–19.2).
- **Measured**: 1024² tiles at 257 m (×4), 128 m (×8) and 64 m (×16) a cell, about 2.8 s each; the readout gives the
  tile's own cell ("Zoomed 64 m a cell").
- **Limits**: a tile's own small streams are worn into its ground but not drawn as lines; only the region's river
  lines are.
