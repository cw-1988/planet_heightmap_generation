# Rivers versus the valleys' cells (region pick)

Why a valley's edge and the river the map draws did not sit on the same line, and the vector edge that fixed it. Part of
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

## What is built: the drawn line is the edge

The river edges no longer approximate the line; they use it (`js/region-lines.js`).

- **The line:** `edgeLines` rebuilds the edge rivers from `fin.rivers` with the map's own reaches and Chaikin
  smoothing; a step is an edge if its cell is (a cut corner only if both its steps are). x is unwrapped along a reach.
  Chaikin leaves steps of a fifth of a pixel; the points are kept 1 px apart (`STEP`), so the line is chords that share
  their points and stray a few hundredths of a pixel from the drawn curve.
- **The pixels:** the walls are every pixel the line passes through, so every other pixel's centre lies wholly on one
  side and the flood labels it right. `cutAlong` then gives each wall pixel the valley of a neighbour it reaches without
  its step crossing any chord near it.
- **The texels:** `packLines` keeps, per texel within 3.5 px, its nearest chord (its ends in 1/32 px). A run's end that
  stops short of the river it joins is drawn on 1 px (`GROW`) to meet it; nothing else is extended.
- **Drawn and picked alike:** the shader (`v2/js/app/region-glsl.js` `regionAt`) and the pick (`region-grid.js`
  `gridAt` → `readAt`) take, of the four texels round a point, the valley with the most weight, counting only the
  texels the point reaches without crossing one of the chords the 3 × 3 texels round it keep (none of the four: the
  nearest such of the 7 × 7). So the edge is the river's line at any zoom and a place takes a valley its own side
  holds. The coast is the drawn one: [region-coast.md](region-coast.md).

**What went wrong before** (all measured as stray specks of a valley, cut off from it on the map as drawn):

- Each segment carried one valley a side, probed off the flood, and gave it to every pixel near it. Where a valley is
  a strip thinner than the probe beside the river, the segment took the valley beyond it: 165 specks, 251 after a vote.
- With the crossing test, wall pixels at a confluence of three runs were checked against one run's segment only: 34
  specks, all at confluences. Every chord near the step is checked now.
- Each texel's piece was drawn on 1 px straight past both ends to close gaps between neighbours. At a bend that
  overshoot is a line where the river is not, and it cut a sliver off the outer side: the spikes, and 31 specks. The
  chords sharing their points leave no gap, so only a short tributary end is drawn on now.

**Measured** (medium, the test planet; `tuning/region-check.js`): 7,227 chords; 0.05 px either side of a chord's middle
gives two different valleys at 90.3% of them. The rest are tips and stubs inside one valley, where both banks are one
valley by the partition. Read 3 × finer than the grid, 9 sample-sized specks are left; 8 of them join their valley at
24 × finer (a wedge's tip where three rivers meet, thinner than the sample step). One is real: a point of 1/576 px²
inside a wedge narrower than 0.2 px that holds no texel of its own valley. Samples one sample thin: 5,309 with the
lines, 4,842 on the plain grid. On the grid every valley is one piece. The shader rendered over three windows round
confluences matches `readAt` at 49,143 of 49,152 points; the 9 others are ties on one texel diagonal in that wedge.

What stays raster: the edges along ridges and divides (nothing is drawn there to match), and which rivers are edges
(the valleys' size, not the map's `riverQ` slider).
