# Lakes you see into: a bed under a flat level, the water fading by depth

Before, a lake was flat paint: one blue over the whole basin, with a blocky edge. Asked for by the owner, 2026-11-20
("make them transparent and give them a bed"). Code: `v2/js/evolution/lake-water.js`. Back to
[world-map-detail.md](world-map-detail.md).

## The model

- **The level**: the finish's hydrology fills each closed basin to its spill height (`finish-hydro.js` `lakeLevel`).
  The finished picture carries it per pixel as `waterLevel` (Int16, m) beside `water` (1 fresh, 2 salt, 3 salt pan).
- **The bed**: the finished ground under that level. It is already there, so the depth at a pixel is the level less
  the ground there.
- **The shore**: the contour where the level stands above the ground. When the picture is enlarged (`rasterAt`,
  `fineWindow`), a pixel takes the level of its nearest lake pixel (`nearestLake`) and is water only where its own
  ground lies under that level. The shore follows the ground at every zoom, not the pixel grid.
- **The light** (Beer–Lambert): light crossing water fades as exp(−K·path), per colour. Seen from above, it goes down
  to the bed and back up, so the path is twice the depth: T = exp(−K·2d). The pixel is bed × T + deep × (1 − T).
  - K for clear fresh water, per m (R · G · B): 0.40 · 0.075 · 0.04. That is pure water's own absorption (about
    0.35 · 0.06 · 0.02) plus a little matter: an oligotrophic lake, Jerlov type I–II. Red is gone in a few metres; blue
    shows the bed to 10–20 m.
  - K for a salt lake: 0.45 · 0.12 · 0.10, greener and murkier (brine, plankton, fine silt).
- **The deep colour**: water too deep to see through takes the palette's own sea colour at that depth, its
  bathymetry, so a deep lake darkens the way the sea does. A palette whose sea is not blue (Grey, Heightmap) gets a plain
  blue that darkens with depth. A salt lake is turned toward teal.
- **Satellite**: the bed is the land's own colour from space there (`satLake`), seen through the same water, with
  winter ice over it in a cold season.
- **Hover**: a lake shows "Fresh lake · N m deep".

## Where it is drawn

`finish-view.js` (the terrain picture), `fine-detail.js` and `detail-view.js` (zoomed tiles), `climate-view.js`
(Satellite), `planet-view.js` (hover) and `export.js` (exported maps) all use `lakeMix` / `deepLakeRgb`.

## Checked (browser pane, 2026-11-20)

On a 204,000-cell world, the 80,000-cell step's picture (2048 px) has 2,255 lake pixels, 0–964 m deep (mean 148 m):
151 under 5 m, 324 at 5–20 m, 682 at 20–100 m, 907 at 100–500 m, 191 deeper. On the map the rims are lighter where the
bed shows and the middles darker; the shores follow the ground.
