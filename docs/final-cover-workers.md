# The final climate on workers

The Finish's **final climate** stage works out each land cell's own climate, cover and colours, its measures beyond
Köppen, the deposits' climate tests and the farming's months. Each cell is its own, so from 300K cells it runs on
worker threads by cell range: `v2/js/finish/final-cover.js` (`finalCover`, `coverRange`) and its worker
`v2/js/finish/cover-worker.js`, spawned by `terrain-pool.js`'s `spawn`.

- Each worker gets the grid's climate once, then ranges of cells (4 per worker), the next as soon as one is done.
- The one thing not per cell is the Satellite view's soft families: a 1024-wide grid keeps the first few places of each
  of its cells, in cell order. Each range records its candidates; the finish's thread replays them in range order, so
  the grid is the same as one pass in order.
- Below 300K cells, or where no worker starts (a page with no nested workers), the same `coverRange` runs over all
  cells on the finish's own thread.

## Measured

The moment of `bench-ladder.mjs` (seed 799224), the picture at 4096 px:

| Detail | final climate before | after | finish before | after |
|---|---|---|---|---|
| 2.5M | 11.4 s | 3.6 s | 58.3 s | 49.5 s |

Every array the finish and the picture hand back hashes the same before and after, at 2.5M (workers) and at 250K
(on the finish's own thread): `z`, `ocean`, the climate's cells, the farming, the stats and the whole raster.
