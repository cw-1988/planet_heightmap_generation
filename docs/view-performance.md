# The globe and map, smooth on Windows

Two things froze or lagged the whole desktop (not only the page) on the Generate page at 204,000 Detail, Windows 11, an
RTX 4070 Laptop GPU on a 4K display: the switch from Globe to Map, and panning and zooming. Both stalled the browser's
GPU process, which also draws the desktop app around the page. Measured 2026-11-20. Back to [shared.md](shared.md).

## The switch to Map: a 42-second shader compile

Chrome on Windows runs WebGL through ANGLE on Direct3D 11, and D3D's compiler (fxc) unrolls every loop whose bound is a
constant. The region pick's shader (`v2/js/app/region-glsl.js`) has nested constant loops (16 × 16, 9, 49 × 9), and
`regionAt` was inlined five times (once, then four rim taps). The map's fragment shader took **42.3 s** to compile; the
GPU process blocked the whole time.

| Map shader | Compile |
|------------|---------|
| as it was | 42.3 s |
| without the region code | 1.1 s |
| without the region code and the clouds | 0.3 s |
| loop bounds × `uRegionN` (a uniform, always 1), the rim taps a loop | 2.05 s |

The fix, in two parts:

- **Bounds fxc can't know**: every loop in REGION_GLSL runs to `n * uRegionN`, and the four rim taps are one loop, so
  `regionAt` is inlined once. Reads inside the loops use `textureLod` (no derivatives), including `patchPx` in
  `globe-view.js`; a derivative read inside a loop makes fxc unroll it anyway. The clouds' storm loop
  (`v2/js/view/clouds.js`) runs to `uCloudStorms` the same way.
- **Compiled ahead**: `GlobeView.prewarmMap()` builds the map's scene after the globe's first frame and compiles it with
  `renderer.compileAsync` (KHR_parallel_shader_compile: on ANGLE's worker threads, not the GPU process's own). The
  switch then has nothing to compile.

After both, with the shader uncached: the longest frame on loading was 162 ms, and on the switch to Map none over 100 ms
(it was 3.3 s with the bounds fix alone, 42 s before).

ANGLE caches compiled programs on disk, so a shader compiles slowly only the first time after it changes. To time one,
compile a copy with a random comment in it.

## Panning and zooming: the tile uploads

The zoomed tiles (258 × 258 px, `paintTile` in `v2/js/view/planet-view.js`) were painted on ordinary 2D canvases, which
Chrome keeps on the GPU. Uploading one into the patch texture (`putPatchTile`, `texSubImage2D`) read it back through the
shared GPU: **9.3 ms of GPU on average, 17.5 ms at most, per tile**, against 0.04 ms for drawing the globe. A pan uploads
dozens.

The fix: the tiles' canvases are made with `getContext('2d', { willReadFrequently: true })` (`TILE_CTX`), which keeps
them in memory, so the upload is a plain copy.

| Fast pans and zooms over the largest continent | Uploads | GPU per upload | Frames over 100 ms |
|------------------------------------------------|---------|----------------|--------------------|
| before (globe) | — | 9.3 ms avg, 17.5 max | — |
| after, map | 176 | 0.15 ms avg | 1 (146 ms) |
| after, globe | 149 | 0.16 ms avg, 3.4 max | 0 |

## Zoomed in: one river segment across the map

At Detail 2.56M the zoomed view lagged constantly: a **~330 ms main-thread task every ~400 ms**, nearly all of it
`drawRiversWindow` (`v2/js/evolution/river-draw.js`) inside `paintTileBase`, ~340 ms per tile. A window takes the
segments whose middle lies within a margin of it, and that margin is half the longest segment (`S.maxLen`). Two of
the 347,009 segments were 2,047 px long (99th percentile: 0.49 px), so the margin covered the whole map. Every tile
then drew every river in the world, three times over (once per date-line turn).

The cause was the confluence smoothing from 2026-11-20 (`riverParts`, `v2/js/finish/river-valleys.js`). In one case a
reach crosses the map's edge at its last raw point, which is the confluence. That point then makes a one-point part,
which is dropped. The join point `M1` went onto the part before it, which lies on the far side of the map. Now only a
part that holds the reach's last point (`pts.end === i1 - 1`) gets the join.

| Zoomed in on land, 2.56M | Per tile | Long tasks | Frames |
|--------------------------|----------|------------|--------|
| before | ~340 ms | ~330 ms every ~400 ms | — |
| after | 9 ms avg, 23 max | one of ~60 ms in 6 s | 57 fps |

The guard: `v2/tools/check-river-joins.mjs` builds a main stem and a tributary that cross the date line, one at the
confluence. It fails if any segment is 2 px long or more. `riverSegments` logs `[rivers] a drawn segment … px long`
when the longest segment is over a quarter of the map.

## Zoomed in: every segment tested for every tile

With that fixed, zooming in still stuttered as the tiles streamed in: frames of 60–85 ms, nearly all of it
`DetailService.pump` (`v2/js/evolution/detail-view.js`). Before posting a tile to a worker, `pump` crops the rivers to its
window on the main thread (`cropSource` → `cropLines`, `v2/js/finish/river-valleys.js`). `cropLines` tested all of the
planet's ~258,000 segments three times (once per date-line turn): ~15 ms a tile, several tiles a frame.

The fix: `cropLines` indexes the segments once per lines array by their middles on a 4 px grid of the texture
(`lineGrid`, cached in a WeakMap) and reads only the cells under the window, out to the farthest a segment reaches from
its middle. It returns the same segments in the same order.

| `cropLines`, 2.56M, one window | Time |
|--------------------------------|------|
| before | 14.3 ms |
| after | 1.06 ms (the grid once: 12 ms) |

The guard: `v2/tools/check-river-joins.mjs` compares the grid's crop with testing every segment for windows at every
level, across the date line and at the poles.

## Zoomed in: a canvas copied into the sRGB patch

The last stutter: when a zoom settled at the deepest level, the page froze for 0.6–0.75 s with the main thread idle (no
long task). `TileLayers.lay` lays again the tiles it already holds (79 of them), and each was copied straight from its
canvas into the patch atlas (`putPatchTile`, `v2/js/app/globe-view.js`), a texture three.js makes `SRGB8_ALPHA8`. A
canvas kept in memory (`TILE_CTX`, above) copied into an sRGB texture takes Chrome's slow path: ~11 ms of the GPU
process per tile, which `lay`'s budget can't see, since the call itself returns at once.

| 258 × 258 tiles into a 4644 × 4902 texture | Longest frame |
|--------------------------------------------|---------------|
| 79 canvases → sRGB | 904 ms |
| 8 canvases → sRGB | 40 ms |
| 79 canvases → RGBA, or 79 pixel arrays → sRGB | 17 ms |

The fix: `putPatchTile` sends the canvas's pixels (`getImageData`, ~1–1.5 ms a tile, counted in `lay`'s budget). The
picture is unchanged. Two zooms out and in over land at 2.56M then ran at 60 fps with no frame over 40 ms.

## Switching layers

[switch-without-stall.md](switch-without-stall.md): a finished picture painted a slice at a time between frames, kept
and painted ahead, so no layer switch stalls the page.

## Keep it so

- A shader loop in code that reaches the globe or the map: give it a bound fxc can't fold (a uniform), and read
  textures in it with `textureLod`.
- A canvas that is uploaded to a texture over and over: make its context with `willReadFrequently: true`, and send it
  as pixels (`getImageData`), never as the canvas, into an sRGB texture.
- Time a texture upload by the frames after it, not the call: its GPU cost shows as a gap with no long task.
- Test on the land, zoomed in, with fast drags; the ocean has no detail tiles and hides the cost.
- No drawn line may cross the map's edge. A window's margin grows with the longest segment, so one wrapped segment
  makes every tile draw everything. Run `node v2/tools/check-river-joins.mjs` after any change to `riverParts`.
- Nothing done per tile on the main thread may walk all of the planet's lines or cells: index them once, read the
  window's part.
