# Region (fork addition)

A piece of the planet, or several, opened as a flat map at a few km a cell or finer, its ground inherited from the
planet and worn down again at that scale: valleys cut, rivers found, lakes and dry pans. This is the first step of the
regional zoom. Climate and Food at regional scale come next, then settlements and roads. In that last step the
region's rivers and passes go back to the planet's towns and roads.

## Use

- **Region** (the button under the layer tabs, `js/region-pick.js`) turns picking on. A click on the planet takes the
  land piece under it in or out (a sea piece is refused: raise it first); a drag still turns the globe. The chosen pieces are tinted magenta. **Split** them first
  (Terrain tab) to give a country its outline.
- **Border** (50–400 km): the land around the pieces that is simulated with them, so their edges know what lies
  beyond (passes, rivers coming in, the neighbours). The box is the pieces' reach from their centre plus the border on
  each side (200–6000 km). What falls in the box past the border is still simulated but drawn greyed.
- **Detail**: 1024 or 2048 cells a side. The Open button shows the box's width and the cell size.
- **Open** needs the planet finished. The window shows its stage while it builds (about 6 s at 1024 cells), then the
  map. Wheel to zoom about the pointer, drag to pan; **Satellite** (the planet's colour from space, lit by the region's
  relief) or **Relief** (height bands); **Rivers from** 1–100 m³/s; the readout under the pointer gives height and
  slope (or sea depth, a lake's surface, a dry pan), the water, the climate, the place and which part of the region it
  is in. Esc or Close shuts it.

## How it is built (`v2/js/region/`)

- **Frame** (`region-frame.js`): an azimuthal equidistant square about the pieces' mean position (true distances from
  the centre). The planet's heights, sea, lakes, climate and rivers are cropped to it on the page and handed to a
  module worker (`region-worker.js`).
- **Ground** (`region-relief.js`): the planet's heights read bicubic, plus the detail the planet is too coarse to hold,
  warped noise read on the sphere (so overlapping regions agree), from about the planet's pixel down to two cells:
  rolling on the plains, ridged in the mountains. Each wave is as steep as the land's kind (about 2° on plains, 6° in
  hill country, 20°+ in mountains, times a slow roughness noise of 0.3–1.6), capped by a relief that grows with the
  height, so hills show at any cell size without lifting the plains. The planet's rivers are cut in as
  wandering valleys, and where one enters the box its water comes in as an inflow. Temperature follows the detail down
  the lapse rate.
- **Erosion** (`region-erode.js`, 16 rounds): a priority flood drains the ground to the sea and the box's edge, each
  cell flows to its steepest neighbour, the water gathers (runoff by Pike's formula from rain and temperature, plus the
  inflows), streams cut by implicit stream power (0.3·√Q), pits silt up halfway and slopes creep. Nothing goes deeper
  than 1.5× the detail's height below the start, so the planet's own heights hold.
- **Lakes**: the planet's, and pits more than 1 m deep where the water can keep them (rain at least 0.6 of the
  evaporation's demand, or more than 5 m³/s coming in). Other pits are dry pans when they cover at least about
  150 km² (6 cells or more); smaller dry hollows are filled to their spill height, as slopes and wind would fill them.
- **Pictures** (`region-paint.js`, `region-view.js`): hillshade from the north-west, stronger the coarser the cells;
  snow eased in where the detail runs colder than the planet's pixel; rivers drawn as wide as their water.
