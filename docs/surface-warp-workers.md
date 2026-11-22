# The surface's warp on the workers, and the distances kept

What was left to cut in the finish's surface and rivers stages at 2.5M cells, with the output kept bit for bit.

## Where the surface's time went

The surface is drawn by the terrain pool ([terrain-pool-balance.md](terrain-pool-balance.md)). Before it, the finish's
thread warped all 2.5M positions (three octaves of noise each, `warpPositions` in `finish.js`): about 1 s in which the
workers sat idle. While they drew, the thread built the carving's ladder ahead (`prepareCarve`, `meanderValues`).

Measured (temporary timers, since removed), the surface ends when the pool does, not the thread: with the meshes built
ahead as the page builds them, the thread's prep was done after 2.0 s, the pool after 9.6 s; without (the bench as it
was), the prep after 8.5 s, still under the pool.

## Changed

- The warp runs on the workers, each on its own chunks as they arrive (`v2/js/terrain/surface-warp.js`; the finish
  passes `warp` with the mesh, `terrain-pool.js` hands it on with the chunks, `terrain-worker.js` applies it). Each
  position's warp reads only that position, so the values are the same.
- Both edge-length caches compute each edge once and copy it to the entry back (`backEntry` in `v2/js/core/min-heap.js`;
  `edgeKmOf` there, `infoOf` in `carve.js`): the reverse edge's differences only flip sign, and its dot product has the
  same terms in the same order, so the values are the same at half the `asin`/`acos`.
- The finished mesh's edge lengths (`edgeKmOf`) are kept from stage to stage up to `PREP_CELLS` (3M) instead of being
  built anew after the rivers, the ice age, the sea and the geology (`midEdgeKm` in `finish.js`); above it they still go
  between stages (240 MB at 10M), and always at the end.

## What can't be cut

- The pool's own work is the surface's noise arithmetic. More workers than 8 do not help on an 8-core, 16-thread CPU
  (measured again below), and the noise (`fast-noise.js`) is already V1's arithmetic with nothing left to drop.
- The rivers' floods (closed basins, each carving level) can't be split or reordered: which of two equal keys leaves the
  heap first depends on the heap's whole shape ([finish-profile.md](finish-profile.md)).

## Result

2.5M cells, meshes built ahead (`PREPARE=1`), HEAD and the change alternated, all 126 hashes identical (and at 250K,
and with `OROGEN_SHARED=1`):

| run | surface | rivers | finish |
| --- | --- | --- | --- |
| before, 1 · 2 | 9.9 · 10.6 | 6.1 · 6.4 | 40.0 · 41.6 |
| after, 1 · 2 | 9.5 · 9.1 | 6.3 · 6.6 | 40.3 · 40.2 |
| after, shared memory on | 8.5 | 6.7 | 39.2 |

So the surface gains about 0.9 s (10.25 → 9.3). The rivers gain nothing measurable: the halved `asin`/`acos` and the
kept edge lengths (~0.15 s per rebuild) are below the run-to-run spread of about 0.5 s.

Pool size, re-measured with the change: 8 workers, surface 9.3 s · 12 workers, 10.2 s · 15 workers, 12.5 s. Eight stays.
