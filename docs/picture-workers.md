# The finished picture on workers

The Finish's last step draws the planet as an equirectangular picture: heights, sea, water, the climate grid, rock and
farming per pixel. Each row reads only the mesh and the cells' fields, so from 1024 px wide it is drawn on worker threads
by bands of rows: `v2/js/finish/finish-raster.js` (`rasterBand`, `rasterFinish`), `v2/js/finish/raster-workers.js`
(`finishRasterAsync`) and the worker `v2/js/finish/raster-worker.js`, spawned by `terrain-pool.js`'s `spawn`.

- At most 4 workers, 4 bands each; each worker gets the mesh and the fields once (a copy, about 350 MB at 2.5M,
  held only while the picture is drawn, then the workers stop), then bands, the next as soon as one is done. The
  finish's own thread draws bands too ([picture-shares.md](picture-shares.md)). Cross-origin isolated (the default; `?isolate=0` off),
  the workers share one copy and there are as many as the pool's ([shared-memory.md](shared-memory.md)).
- Band starts are multiples of the climate grid's step, so each band's climate rows are whole; the bands are joined in
  row order.
- What reads the picture whole runs on the finish's thread after the join: the small lakes (`pondRaster`) and the
  terrain look's setup; the terrain look's rows go back to the same workers in a second round
  ([terrain-look-workers.md](terrain-look-workers.md)).
- Below 1024 px (until 2026-11-22: below 300K cells, though the cost goes with the pixels), with reused cells (`located`), or where no worker starts, `finishRaster` draws it on the finish's
  own thread, and the result is the same.

## Measured

2.5M cells, seed of `v2/out/hash-finish.mjs`: picture 9.7 s → 7.1 s. All 126 hashed arrays of the finish and the
picture are the same before and after (2.5M on workers, 250K on the finish's thread).

## The hang it once had

The first version hung after every band was in: the count of bands done was raised inside `onRow?.(++done / n)`, and
optional chaining skips the arguments when `onRow` is null, so it never counted. The count now goes up on its own line.
The same shape was fixed in `detail-view.js` and `history-runner.js`.
