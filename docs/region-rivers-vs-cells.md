# Rivers versus the valleys' cells (region pick)

Why a valley's edge and the river the map draws don't sit on the same line, and what would make them. Part of
[Region](region.md).

## The rivers are not a different mesh

The map's rivers (`fin.rivers`, traced in `v2/js/finish/finish-hydro.js`) are built on the same terrain mesh as the
valleys: 204,001 cells of ~2,500 km², centres ~54 km apart. Each river point is a cell's centre. Of 800 random river
points, the median is 0 km from the nearest cell centre and the farthest 1.8 km. The water's route (`drain.recv`) is
also the same one the valleys use.

## What the map does with those points

`v2/js/evolution/finish-view.js` `riverSegments` turns them into a **vector line**:

- each reach runs from a head or a confluence to its mouth, centre to centre;
- it is smoothed with Chaikin twice in the map's lon/lat picture. Each corner is cut, so the line leaves the cell
  centres: at a right-angle bend it passes ~10 km inside the corner, more at a sharper one;
- it is stroked onto a texture at sub-pixel positions, 0.45–1.0 px wide on a 2048-px map. On the zoomed tiles it is
  redrawn sharper (`drawRiversWindow`), so it stays a crisp line however far in you go;
- only reaches carrying `riverQ` m³/s or more are drawn (40 by default, a slider);
- its width shows discharge.

## What the valleys do

The valleys are **areas made of cells**, then turned into a **picture of labels**:

1. Cells get a valley each (`region-basin.js`, `region-join.js`). A river cell is a whole Voronoi cell ~54 km across,
   so its two halves are cut by a straight line in-and-out through its centre (`region-bank.js` `bankAt`), not by the
   smoothed line.
2. The labels go onto a 2048 × 1024 grid, about 20 km a pixel (`region-grid.js`, `region-flood.js`). The edge rivers
   are rasterised into that grid as a 4-connected band of whole pixels (`region-walls.js`), each pixel then given to
   one side.
3. The globe's shader draws the edge where the label changes, reading the four texels around each screen point
   (`REGION_GLSL`).

So an edge can only fall on a pixel boundary of that 20-km grid, on one side of the wall band, never on the river's
line itself.

## Why it still mismatches

Every gap below comes from one cause: **the edge is a boundary between label pixels, the river is a vector line**.
Each new layer (cells, then halves, then walls, then pixels) re-approximated the line instead of using it.

- **Resolution.** A label edge is at best half a pixel off a line, ~10 km. Measured over the whole map, the median
  offset from edge to river line is 0.31 px (~6 km). That is invisible at full-planet zoom but plain on the zoomed
  tiles, where the river is sharp and the edge is still made of 20-km steps.
- **Which side holds the wall.** The wall band's pixels go to the valley that surrounds them most, so the edge runs
  along one side of the band, not down its middle: up to one more pixel off, switching side along the river.
- **Straight halves versus the smoothed line.** At bends the cell's straight in-and-out line and the Chaikin curve
  disagree by ~10 km or more. Cells and their halves are given bank by the straight line, the drawing by the curve.
- **Which rivers.** The map draws what is over the `riverQ` slider. The valleys take as edges what carries a valley's
  worth of water (now matched to the map's discharge, before it was drained area). Where a drawn river drops below
  that size, the edge leaves it and follows a divide, while the river carries on drawn.
- **Where an edge stops.** An edge river's wall ends where its water falls below the size. A valley can wrap round
  that end and so lie on both banks further up, where the river is still drawn.

The fixes so far (water-based edges, bank-true halves, land-only seeds) remove the wrong-river and wrong-bank errors.
None of them can remove the first three, because those are the raster itself.

## What would make them match

Stop approximating the river: **use the drawn line itself as the edge**, at draw time.

- **Border:** along an edge river, stroke the rim from the same `riverSegments` points the river is drawn from, at the
  same zoom. The rim then is the river, at any zoom.
- **Which side:** for a point within a pixel or two of an edge river, decide its valley by the side of that same
  polyline it falls on (a signed-distance test on the segments near it, the way `drawRiversWindow` finds them by
  grid), not by the label texture. The label grid then decides only away from the rivers: along ridges and divides,
  where nothing is drawn to match.
- **Chosen mask and pick:** use the same side test, so what is shown is what is picked.

The cells and label grid stay for everything else (which valleys exist, their joins, ridges). Only the river edges
switch from raster to vector.
