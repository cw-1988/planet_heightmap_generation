# The region pick's coast

The coast of a chosen valley is the coast the map draws, at any zoom: what is land on screen is in a valley, what is
sea is not. Hub: [region.md](region.md).

## The drawn coast

- **The picture** (`v2/js/evolution/finish-view.js` `rasterAt`): at 2048 px each pixel is the raster's own
  `ocean` pixel; at the sharp 4096 px a place is sea where the bilinear share of the four `ocean` pixels round it is
  ≥ ½. Shown with linear filtering, the 2048 picture's coast also falls where that share is ½.
- **The zoomed tiles** (`v2/js/finish/fine-detail.js`): a finer coast of their own. A tile pixel is sea only where
  its height (the picture's heights enlarged by a Catmull–Rom, plus the detail) is below 0 near `seaB`; anywhere the
  curve is above 0 it is land. At a steep coast the curve crosses 0 well out in the picture's sea pixel, so the tiles'
  land reaches up to ~1.6 grid pixels (~30 km) past the picture's coast.

## How the pick follows it

- **The grid** (`js/region-flood.js`): a pixel is sea exactly where `raster.ocean` is. Land the map draws under a
  sea cell of the mesh, which no valley's flood reaches, joins the valley it borders (spreading from the land round
  it); an island with none becomes a valley of its own (`landOfSeaCells`).
- **Away from tiles** (`v2/js/app/region-glsl.js` `regionAt`, `js/region-lines.js` `readAt`): a place is sea when
  the sea's share of the four texels round it is ≥ ½, the picture's rule. Otherwise it is the valley with the most
  weight of the land texels only, so the sea never outvotes the land. Away from rivers that weight is the 4 × 4
  B-spline's ([region-edges.md](region-edges.md)).
- **Under tiles**: each tile marks its sea in its alpha (`v2/js/view/planet-view.js` `paintTileBase`: 255 land, 128
  sea; rivers and lines drawn `source-atop` keep it). The shader reads it back (`globe-view.js` `patchSea`: share
  2 × (1 − alpha), mixed by how much the tiles cover the place) and the pick asks the tile (`region-pick.js`
  `unitUnder` → `pv.patchAt(...).ocean`). Land the tiles draw past the grid's coast takes the valley of the nearest land
  texel of the 7 × 7 round it (`FAR` = 3 in region-lines.js, the same loop in the shader), clear of the edge rivers'
  lines.

## What went wrong before

- The four texels' valley was the one with the most weight, the sea counted as one valley: along a coast where two
  valleys meet, or a thin land texel against the sea, the sea won and a strip of drawn land stayed unchosen.
- The tiles' finer coast was ignored: their land past the grid's coast was sea to the pick (the green strip in a bay).
- 61 land pixels of the picture lay under sea cells no flood reached; the grid made them sea.
- Land the tiles draw past the grid's coast looked for a valley only in the 3 × 3 texels round it, so it found land
  only within ~1 texel. The tiles' land reaches further on steep coasts, and that drawn land stayed unchosen: a
  green strip a few screen pixels wide round a whole bay when zoomed in. The first check, from small crops, missed it.

## Measured

Test planet, medium valleys: grid sea vs `raster.ocean` 0 pixels off either way (61 before). Over 400,000 samples,
0 where the picture's share says land and the pick says sea or the reverse. The shader vs `readAt` at 49,152 points
round coasts and edge rivers (no tiles): 0 different. Every valley one piece; the river-side check 90.6%.
