# The region pick's valley edges

How a valley's edge away from rivers and coasts gets its shape. Hub: [region.md](region.md). Along an edge river the edge
is the drawn line ([region-rivers-vs-cells.md](region-rivers-vs-cells.md)); at the sea it is the drawn coast
([region-coast.md](region-coast.md)).

## What was wrong (owner, 2026-11-18)

- **Noses** ("what are those weird noses?"): the flood (`js/region-flood.js`) runs up every gully a pixel or two wide
  from the valley it drains into. Such an edge came out as a comb of fingers up to a cell long, and each finger was
  drawn as a rounded nose.
- **Boxes** ("weird rectangular shapes instead of going for the actual valley shape"), from two causes:
  - The shader read the four texels round a place by their bilinear shares. That draws each texel's straight sides and
    square corners, so an edge became a staircase of boxes at any zoom.
  - The first tidy used a square window of equal votes. It pulled edges into rows and columns and off their ridges:
    20.1 % of non-river edge length cut across a slope, against 18.2 % for the raw flood.

## What it does now

- **Tidy** (`js/region-tidy.js`, called in `region-grid.js` after the flood): each pixel on an edge with no river near
  it takes the valley with the most weight in a round window. The window has a reach of 2 px, and its votes fall off
  as a Gaussian with σ 1 px. Up to 8 passes run.
  - A finger or notch narrower than the window goes; a valley's own shape stays.
  - Pixels within 2 px of an edge river's wall stay as they are, and the walls and the sea cast no votes. So no valley
    reaches across a river, and the coast stays the map's.
- **Drawing** (`v2/js/app/region-glsl.js` `regionSmooth`, mirrored by `js/region-lines.js` `smooth` for the pick): away
  from the edge rivers, a place takes the land valley with the most cubic B-spline weight over the 4 × 4 texels round
  it. The outline is a smooth curve at any zoom, with no texel steps or square corners.
  - No river line falls inside that 4 × 4: a texel within 3.5 px of a line is flagged, and on a flagged texel the old
    line-aware reading runs.

## Measured (test planet, medium valleys)

| | Thin px (fingers) | Edges across a slope |
|---|---|---|
| Raw flood | 556 | 18.2 % |
| Square tidy | — | 20.1 % |
| Round tidy (now) | 499 | 18.2 % |

- Shader vs pick, full screen, green-box valley view (lat 12.04, lon −92.4): 95,256 points. The two differ at 111,
  each within 1 screen px of an edge (where the pixel centre is sampled), and nowhere else.
- Shader vs pick at 8 views spread round the chosen valleys' coast: 0 off-edge differences once the tiles have loaded.

## What is left

Straight edges on slopes, such as the east side of the green-box valley (col 511/512, rows 577–588), are already
straight in the raw flood. The valleys are decided on the ~50 km cells, while the floods run on the pixels' heights.
Where a cell's valley and the pixels' own drainage disagree (there, a gully at col 509 drains into the next valley's
channel), the two floods rise side by side and meet on a line. Neither the tidy nor the drawing can fix this, because
both only smooth the edge. The fix is to build the valleys from the raster's own drainage.
