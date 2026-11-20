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

## Keep it so

- A shader loop in code that reaches the globe or the map: give it a bound fxc can't fold (a uniform), and read
  textures in it with `textureLod`.
- A canvas that is uploaded to a texture over and over: make its context with `willReadFrequently: true`.
- Test on the land, zoomed in, with fast drags; the ocean has no detail tiles and hides the cost.
