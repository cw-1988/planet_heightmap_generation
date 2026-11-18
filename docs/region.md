# Region (fork addition)

A piece of the planet, one valley or several, opened as a flat map at a few km a cell or finer. The planet's generator
draws its ground again at that detail, then it is worn down again at that scale: valleys cut, rivers found, lakes and
dry pans. This is the first step of the regional zoom. Climate and Food at regional scale come next, then settlements
and roads. In that last step the region's rivers and passes go back to the planet's towns and roads.

## Use

- **Region** (the button under the layer tabs, `js/region-pick.js`) turns picking on. The land is cut into valleys
  along its natural borders: divides, rivers and coasts. The valley under the pointer is lightened, and a click takes it
  in or out (the sea is refused); a drag still turns the globe. The chosen valleys are tinted magenta.
- **Valleys**: small (about 30,000 km²), medium (150,000) or large (600,000). A new size starts the choice again.
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

The planet's finish sends its drainage out: each cell's receiver, the area it drains and whether it is sea. A river is
a cell draining at least the valley size. Its stretches break at a head, a confluence, or a length over 2√size km, and
each land cell joins the stretch its water first reaches, on the bank it comes from, so a valley's borders are the
divides and the river itself. Land that drains straight to the coast or to a sink is cut into chunks of about the same
size. Last, any piece under a third of the size (and never under a dozen of the planet's cells) merges into the
neighbour it shares the longest border with, so no valley is a speck.

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
