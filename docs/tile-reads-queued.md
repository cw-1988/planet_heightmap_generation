# Tile reads, two at a time

Part of [view-switch-lag.md](view-switch-lag.md). Measured 2026-11-22 on the Generate page, zoomed in on land.

## What lagged

A layer switch while zoomed in repaints every detail tile in view for the new look. A tile's full data (~1.6 MB) is
kept on disk in IndexedDB (`TileStore`, `v2/js/evolution/tile-store.js`) and read back for the repaint
(`DetailTiles.full`, `detail-tiles.js`). All of a view's reads went out in the same frame: **~156 reads at once**.

IndexedDB hands each value back on the page's main thread, where it is deserialised in the `onsuccess` task. That work
is not counted as script: a profiler's long-task view shows only `IDBRequest.onsuccess`. The Long Animation Frame API
(LoAF) found it. With all reads arriving together, 3–5 frames per switch ran 45–100 ms, for about a quarter second, even
zoomed out.

## The fix

`TileStore.get` queues reads in the order asked (the view's middle first, as `DetailTiles` asks) and keeps `READS = 2`
under way. Each finished read starts the next. A read whose `signal` was aborted, whose tile was dropped, or whose tile
is still being written (served from memory) leaves the queue without touching the disk.

| Switch, zoomed in on land | Long animation frames | Longest frame | Frames over 25 ms | All reads done |
|---------------------------|-----------------------|---------------|-------------------|----------------|
| reads all at once | 3–5 per switch | 45–100 ms | 3–5 | not timed |
| two at a time | none | 31–49 ms | 1–5 | 427–505 ms |

Each tile now arrives a little later, but the tiles still come in nearest first, and no frame stalls.

## Keep it so

- Never ask for many large IndexedDB values at once from the page: their deserialisation lands on the main thread,
  outside any script budget. Queue them.
- Time IndexedDB work with LoAF (`PerformanceObserver` on `long-animation-frame`), not with timers around the call.
