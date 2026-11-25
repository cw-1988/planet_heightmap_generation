# Plate edit tint

Generate shows its plate edits in two ways. While Ctrl (⌘) is held, the piece under the pointer lightens. Each pending
piece is tinted green when it will rise as land and blue when it will sink. The globe's shader draws both over the
picture and its zoomed-in tiles, the same way the region pick's valleys are drawn ([region.md](region.md)).

## Why not painted

The tint used to be painted into the picture's canvas, through PlanetView's `extraLines`. Its key held the pending
pieces and the hovered one, so each hover did one of three things:

- redrew the lines and uploaded the whole texture;
- repainted the whole picture, when that picture was live;
- on the GPU path, redrew and uploaded a 32 MB overlay.

Zoomed in, every patch tile was painted again, a batch per frame, so the highlight spread across the screen
tile by tile. A piece's first hover also built a 4096-wide mask, one nearest-cell lookup per pixel. Painting a plate
had cost as much as painting the planet.

## How it is drawn

- **The piece grid** (`js/piece-overlay.js`): the piece + 1 under each pixel of a 2048 × 1024 grid (RG bytes, the first
  row the south). It is read off the grid's nearest cells (`js/region-grid.js` `pixelCells`), which are built a few
  rows per frame and shared with the region pick. It goes to the GPU once per world, when the world is finished or
  an edit needs it. It is not rebuilt for each step of a build under way. (The waiting cuts of the Split tool, removed
  in 2026-11, were drawn on it too, as violet parts.)
- **The paint layer** (`js/piece-overlay.js` `paint`): the grid's B byte is the character last painted on each pixel
  (0 none, + 128 while it waits for Apply), each stroke's discs laid in order, the eraser's writing 0. A new stroke
  adds only its new discs; a changed list draws them all again. A stroke kept to chosen plates writes only the pixels
  whose piece is one of them. The shader blends the four texels' character colours
  (`uPaintCols`, the categorical tokens), at 0.5 while waiting and 0.38 once applied (0 when Layer is off).
- **The state** (one texel per piece, 256 wide): RGB the tint (sRGB), A its share (0.38; 0 when not pending). It is
  sent again only when the set of pending pieces changes. While Paint is on, the plates chosen to paint in are tinted
  amber (a pending piece's green or blue wins over it).
- **The hover**: one uniform.
- **The shader** (`v2/js/app/piece-glsl.js` `withPieces`, called in both the globe's and the flat map's shaders under
  `withRegion`): it reads the four bilinear texels around the point, blends the pending tints by share, and draws a
  crisp 0.5 contour (`fwidth`), so the edge follows the piece's outline at any zoom. Hover mixes toward white
  at 0.22. There are no loops (fxc safety).

A hover now costs a uniform write, and a click costs a texture of a few kilobytes. The picture, its tiles and the
lines are not touched. The Plates view's motion arrows are still painted (`js/generate-plates.js` `drawPlateLines`),
keyed only on the world's version and the layer.
