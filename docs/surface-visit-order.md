# The surface's points swept by longitude

What a terrain worker's own time turned out to be, and the cut that followed, with the output kept bit for bit.

## Where a worker's time went

A CPU profile of a 2.5M finish (`node --cpu-prof`, the pool's 8 threads) credited `runJob` with about 1.4 s of its own
per worker. Read per line, it is all on the one line that calls `surfaceRange`: the surface's work, not the job's.
Inside `surfaceRange` the costliest lines are plain reads: the coast raster's five fields at a point's three corners,
then the sim cells' records. They are slow because of the order: a chunk is a run of the Fibonacci sphere's indices,
a thin band of latitude whose consecutive points lie about 137° apart, so each point's reads miss the cache.

## Changed

`terrain-worker.js` sorts each chunk's points by longitude once (`sweepOrder`, a stable counting sort into 4096 bins,
kept with the chunk), and `surfaceRange` visits them in that order (`order`, its last argument). Each point is still
written at its own index and depends on nothing read for another point, so any order gives the same values.

## Result

2.5M cells, meshes built ahead (`PREPARE=1`), HEAD and the change alternated; all 126 hashes identical (and at 250K):

| run | surface | finish |
| --- | --- | --- |
| before, 1 · 2 | 10.2 · 9.9 | 45.4 · 45.1 |
| after, 1 · 2 | 9.4 · 9.3 | 43.1 · 45.1 |

The machine was busier than in [surface-warp-workers.md](surface-warp-workers.md)'s runs (the same HEAD then gave
9.3), so read the difference, not the totals: the surface gains about 0.7 s. A run on a quiet machine gave 8.5.
