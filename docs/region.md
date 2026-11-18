# Region (fork addition)

A piece of the planet, one valley or several, opened as a flat map at a few km a cell or finer. The planet's generator
draws its ground again at that detail, then it is worn down again at that scale: valleys cut, rivers found, lakes and
dry pans. This is the first step of the regional zoom. Climate and Food at regional scale come next, then settlements
and roads. In that last step the region's rivers and passes go back to the planet's towns and roads.

## Use

- **Region** (the button under the layer tabs, `js/region-pick.js`) turns picking on. The land is cut into valleys
  along its natural borders: divides, thick rivers and coasts. Each side of a thick river is its own valley, so a
  river can be a region's edge. The valley under the pointer is lightened with a white rim, and a click takes it in or
  out (the sea is refused); a drag still turns the globe. The chosen valleys are tinted magenta, each with a darker
  rim. Both show on the zoomed-in tiles and the flat map too. The globe's shader draws them (`js/region-overlay.js`,
  `REGION_GLSL` in globe-view.js): the valleys' map goes to the GPU once per cut, the chosen ones a byte each, the
  hover as one number. A hover costs nothing extra: 16.6 ms frames while sweeping, as idle.
- **Valleys**: small (about 30,000 km²), medium (150,000) or large (600,000). The size alone decides which rivers are
  a valley's edges and which run inside one (there is no river slider: a floor set by hand cut the land along rivers
  that had nothing to do with the valley size). A new size starts the choice again. Large ones often stay smaller: a
  valley grows only between its rivers and ridges.
- **Border** (50–400 km): the land around the valleys that is simulated with them, so their edges know what lies beyond
  (passes, rivers coming in, the neighbours). The box is the valleys' reach from their centre plus the border on each
  side (200–6000 km). What falls in the box past the border is still simulated but drawn greyed.
- **Detail**: 1024 or 2048 cells a side. The Open button shows the box's width and the cell size.
- **Open** needs the planet finished. The window shows its stage while it builds (about 8 s at 1024 cells, about half of
  it the generator), then the map. Wheel to zoom about the pointer, drag to pan; **Satellite** (the planet's colour
  from space, lit by the region's relief) or **Relief** (height bands); **Rivers from** 1–100 m³/s. The readout under
  the pointer gives height and slope (or sea depth, a lake's surface, a dry pan), the water, the climate, the place and
  which part of the region it is in. Esc or Close shuts it.

## How the valleys are cut (`js/region-basin.js`)

The planet's finish sends its drainage out: each cell's receiver, the land it drains, its height, and whether it is
sea or a lake. T is the valley size (never under a dozen cells), S a fifth of it (the same floor).

- **True neighbours** (`js/region-mesh.js`): the terrain mesh lists six neighbours a cell, but a quarter of those pairs
  meet only at a corner on the map. The valleys use only the pairs whose shared Voronoi edge is at least 0.4 of their
  distance; joined over a corner, a valley was drawn in two pieces.
- **Rivers**: every river that drains S or more, wet or dry, parts the land into pieces (a desert's great basin is cut
  along its wadis too). One that drains T or more is a valley's edge, never crossed; a thinner one is a stream inside a
  valley. Lakes (fresh or salt) count as water, dry pans as land.
- **Pieces**: a river's stretches break at a head, a confluence, or a length over 2√S km, and each land cell joins the
  stretch its water first reaches, on the bank it comes in from. The bank is read from the arc round the river cell
  between its way in (the main stem, followed up each confluence by the larger land) and its way out: a straight line
  through the cell misreads a bend. Land that drains to the coast or a lake first is a piece per outlet. A piece in
  patches is split into one piece per patch.
- **Joining** (`js/region-join.js`): every border weighs in metres of barrier. A divide: the mean height of its cells
  over the two pieces' mean heights, so a low saddle joins early and a ridge late. A stream between them: up to 100 m
  by its share of T. An edge river: never. Slivers join their weakest neighbour first; then all pairs join weakest
  first (plus 300 m per valley's worth of size, so the valleys come out even), never past 1.6× the size and never over
  600 m. Leftovers under a quarter of the size join their weakest neighbour; a piece enclosed by one neighbour joins
  it; the last slivers join anything but across an edge river. A valley never holds both banks of one edge river, even
  joined round its upper end where it is still a stream: each piece knows which bank of which river it lies on (the
  river's main stem, followed up each confluence by the larger land), and two pieces on opposite banks never join.
  4 in 10 river steps go corner to corner (a cell's water to a cell it touches at a point only), past two land cells
  that meet side by side across the river: that side counts as the river crossed, not open land (`cornersOf`), so no
  join leaks through it. A join through a neck costs up to 400 m more, the shorter the border is against 0.35 of the
  smaller piece's whole rim, so valleys come out as blobs, not lobes and tails.
- **River halves** (`js/region-halves.js`): a river runs through its cells' centres, so a river cell is cut by its
  line in two halves. Each half goes to the valley that most of the land along it is in, measured on the cells' shared
  edges (a half pinched at a bend, with no edge long enough: the land whose centre is on its side). A half with no land
  at all, between two rivers or at a confluence, takes the valley of the nearest half along the river that has one.
  A half moves only if its valley stays one piece without it (a valley that crosses a stream may hang together only
  through the stream's cells), judged with every other half already where it is going: a row of far-bank halves once
  held one another for the near bank's valley. So a bank's valley reaches the river itself, and only on its bank (at
  medium 3 of 5,778 halves still disagree with the land beside them, none at large). `js/region-bank.js` `unitAt`
  reads a point's valley off them.
- **The valleys' map** (`js/region-grid.js`): which valley each pixel of a 2048 × 1024 grid is in (~20 km a pixel). It
  is the one picture of the valleys: the overlay draws it, the pointer picks from it, the region's mask is cut from it,
  so what is shown is what is chosen; a point reads the four pixels round it as the globe's shader does (the valley
  with the most weight), so edges are smooth lines, not the pixels' steps. **The pixels follow the terrain, not the
  cells** (`js/region-flood.js`): a pixel given its nearest cell's valley put every edge on a ~50 km cell's straight
  sides (across slopes and plains, through summits, a river's bank 20 km off its line). So each valley grows from its
  cells' centres (a river cell's: from each bank's side) over the finished planet's height picture (`raster.heightM`),
  lowest ground first, and two valleys meet on the ridge between them. A pixel goes only to a valley of its own
  cell or a cell beside it, so the heights move an edge by at most a cell (lowest first over the whole planet, a valley
  seeded low ran up its neighbours' gullies: combs of fingers). The edge rivers are drawn in as walls the
  floods never cross (`js/region-walls.js`), the same lines the map draws (cell centres, smoothed by Chaikin twice,
  4-connected), so a bank's edge is the drawn river. The coast is the picture's. About 0.6 s a size. **Every valley is
  one piece on it, by construction**: each valley keeps its largest patch and every other patch goes to the valley it
  shares the longest border with, until none is left; a patch with no land round it becomes a valley of its own.
- **Checked** on the test planet with `tuning/region-check.js` (`onePiece`): small 3,721 valleys, medium 1,130, large
  471, none in two pieces on the map or on the mesh. Before the repair, the cells alone left 62 valleys at medium in
  two or more patches (968 px).
- **Limits**: the map is ~20 km a pixel, so an edge is within ~10 km of the ridge or river it follows. At small, a
  few slivers of 4–6 cells between edge rivers end up with no pixels (131 of 3,797); their land goes to their
  neighbours.
- **Checking by eye** (dev only): `tuning/region-agent.js` lets an image-checking agent pick its own valleys with curl
  through the dev server's relay (`tuning/shot-relay.mjs`): random, at a point, by id, or the whole atlas, each a PNG
  drawn by `tuning/region-shots.js`. Start it in the generate page with
  `(await import('/tuning/region-agent.js')).serve()`.

## How it is built (`v2/js/region/`)

- **Frame** (`region-frame.js`): an azimuthal equidistant square about the valleys' mean position (true distances
  from the centre). The planet's heights, sea, lakes, climate and rivers are cropped to it on the page and handed to a
  module worker (`region-worker.js`).
- **The generator again** (`region-synth.js`): the planet's own height synthesis (belts, platforms, coasts and their
  fractal detail, then the fine ridged relief along the plates' old fronts) is drawn over the box twice. One pass is on
  a grid of at most 512² cells at that grid's spacing. The other is on a grid a quarter as fine, at the planet's mesh
  spacing. Their difference is the detail the planet's mesh was too coarse to hold: the same mountains, with the spurs,
  ridges and coves the generator draws when its mesh is this fine. It is added to the planet's finished (eroded)
  heights, so the planet's valleys, coasts and rivers stay where they are.
- **Ground** (`region-relief.js`): the planet's heights read bicubic, plus the generator's detail, plus warped noise
  read on the sphere (so overlapping regions agree) for the waves finer than the generator's grid, down to two cells:
  rolling on the plains, ridged in the mountains. Each wave is as steep as the land's kind (about 2° on plains, 6° in
  hill country, 20°+ in mountains, times a slow roughness noise of 0.3–1.6), capped by a relief that grows with the
  height. The planet's rivers are cut in as wandering valleys, and where one enters the box its water comes in as an
  inflow. Temperature follows the detail down the lapse rate. The colour from space is read from the planet's land
  only; where the new detail puts land on the planet's sea, the nearest land's colour fills it.
- **Erosion** (`region-erode.js`, 16 rounds): a priority flood drains the ground to the sea and the box's edge, each
  cell flows to its steepest neighbour, the water gathers (runoff by Pike's formula from rain and temperature, plus the
  inflows), streams cut by implicit stream power (0.3·√Q), pits silt up halfway and slopes creep. Nothing goes deeper
  than 1.5× the detail's height below the start, so the planet's own heights hold.
- **Lakes**: the planet's, and pits more than 1 m deep, which are lakes where the water can keep them (rain at least
  0.6 of the evaporation's demand, or more than 5 m³/s coming in) and dry pans elsewhere. A pit under about 150 km²
  (6 cells or more) that is not one of the planet's lakes is filled to its spill height, as slopes, wind and water
  would fill it.
- **Pictures** (`region-paint.js`, `region-view.js`): hillshade from the north-west, stronger the coarser the cells;
  snow eased in where the detail runs colder than the planet's pixel; rivers drawn as wide as their water.
