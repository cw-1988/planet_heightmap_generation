# Export past 16,384 px (fork addition, from PR #155)

Exported maps may be up to 65,536 px wide (`EXPORT_MAX_BANDS` in `v2/js/evolution/export.js`). Back to
[generate.md](generate.md).

## When it is offered

- Only on a computer, in a browser that can save straight to a file or a folder (`showSaveFilePicker` and
  `showDirectoryPicker`: Chrome and Edge).
- Only for a world with the detail finer than its mesh (`fin.raster.drivers`), since the band is drawn with it.
- Up to 16,384 px nothing changes: the map is drawn whole in memory, as before.

## How a band run works

- `bandRows(W)` (`v2/js/evolution/export-bands.js`) picks the band's height: a power of 2, 16 to 1,024 rows, about 16 M
  pixels a band.
- `drawBand` draws the detail for rows y0−1 to y0+n+1 through the page's `fine(…, win)`, so the hillshade has its
  neighbours above and below.
- `produceBand` hands back that band's rows of each map: colours, heights, masks, the climate's, the rivers (drawn on
  8,192-wide canvases with `drawRiversWindow`) and Generate's Plates (`producePlatesBand`, `js/main.js`).
- `runBands` (`v2/js/view/export-panel.js`) writes each map's PNG as the bands arrive, through PngStream workers
  (`v2/js/view/png-stream.js`). The map may also be cut into 16,384-px tiles.
- A run of files with no map in it (the README, the planet file) draws no detail at all.

## Other export fixes taken with it

- An export's band runs before any view tile (`DetailService.run`, `detail-view.js`). Before, a zoomed view kept asking
  for tiles and the export waited behind them.
- `DetailService.window` sends at most 4 bands at a time, each next one as one comes back, so the view's tiles still get
  workers during an export.
- A PngStream stops when the disk refuses a write, instead of filling memory.
- Export canvases are made with `willReadFrequently`, so Chrome keeps them on the CPU.
- Rivers on an export wider than the picture are drawn with `drawRiversWindow` on the fine detail's own lines.

## Checked (2026-11-22)

- Every module loads in the page with no error; `node --check` and `check-style` pass.
- A 1,024-px export in the page saves its zip (1.3 MB) with no error.
- A band run at 32,768 px or more was not run end to end: it needs a real folder picked by the user.
