# The view switch lag (Satellite and every layer)

Reported: the switch to Satellite lags. Measured 2026-11-22 on the Generate page, zoomed in on land, with the Long
Animation Frame API. Every layer switch had the same causes; Satellite had two of its own. Back to
[view-performance.md](view-performance.md).

| Switch | Before | After |
|--------|--------|-------|
| Satellite: the zoomed tiles | blank, then a 1.5–2.4 s stall | painted in the frames after, no stall |
| Clouds turned on (Satellite) | one 763 ms task | built ahead while idle |
| Any layer, frames while the tiles repaint | 20–66 ms, plus 45–100 ms from the reads | 31–49 ms at most, 1–5 over 25 ms |

## The causes and fixes

- **Satellite tiles before Satellite's colours**: a zoomed tile on Satellite drew its season's styled colours itself,
  all at once, the first time. `paintTileBase` (`v2/js/view/planet-view.js`) now waits for `satelliteReady` and leaves
  them to `prepareSatelliteSoon`, which prepares them a slice at a time.
- **A tile in one go**: a tile was painted whole, past the frame's budget (`PATCH_BUDGET_MS`). It is now painted
  `TILE_BAND` (16) rows at a time (`paintWindow`'s `rows` option, `finish-view.js`). `TileLayers.lay`
  (`detail-view.js`) passes its deadline in, and the painting goes on next frame.
- **The clouds' noise on demand**: the first clouds built their Worley noise texture in one 763 ms task. It is now built
  `NOISE_ROWS` (4) rows at a time in idle time from the start (`prepareCloudNoise`, `v2/js/view/clouds.js`;
  `cloudNoiseSoon`, `globe-view.js`). Clouds asked for meanwhile show once it is done.
- **The rivers' canvas on the GPU**: `drawOnLand` (`v2/js/evolution/river-draw.js`) drew a tile's rivers on an ordinary
  2D canvas. Chrome keeps that on the GPU, so the tile's next `getImageData` forced a readback: a 54 ms task per switch.
  Its canvases now use `willReadFrequently`, like the tiles themselves.
- **Every tile's data read back at once**: [tile-reads-queued.md](tile-reads-queued.md).

## Ruled out

Measured and not the cause: GL texture uploads, shader compiles, timers, the GPU's draw cost (a drag runs at a 17 ms
median), and DOM style and layout.
