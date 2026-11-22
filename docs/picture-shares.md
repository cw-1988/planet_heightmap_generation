# The picture's shares, and the finish's thread drawing too

The picture's workers ([picture-workers.md](picture-workers.md), [terrain-look-workers.md](terrain-look-workers.md))
each get a copy of what they read: the mesh and the fields for the bands, the look's setup for its rows. Measured at
2.5M cells (seed of `v2/out/hash-finish.mjs`, 4 workers):

- Starting the 4 workers: 0.1 s.
- Sending the mesh and fields: 0.10–0.13 s a worker, 0.47 s in all, one after another on the finish's thread (a
  structured clone is a copy of every array). Each worker then reads its copy in, side by side.
- Sending the look's setup: 0.03–0.05 s a worker.

Without SharedArrayBuffer (the page has no cross-origin isolation headers) the copy can't be skipped, and every array
sent is read per pixel. With shared memory (on by default) it is skipped: [shared-memory.md](shared-memory.md). Sending it earlier would cost the finish's thread the same time and keep four copies in memory
longer.

What was slack instead: while the workers drew, the finish's thread only waited. It now draws bands too, in both rounds
(`alsoHere` in `v2/js/finish/raster-workers.js`), from the arrays it already holds, uncopied. Between its bands it lets
the workers' messages in. Each worker is handed two bands at the start, so one is waiting while this thread is busy. A
band is the same `rasterBand` or `lookRows` call as on a worker, with the same noise seed, so the pixels are the same.

## Result

2.5M cells: picture 6.07 → 5.72 s (bands 2.66 → 2.46 s, the look's rows 2.52 → 2.37 s with its 0.96 s setup). The 126
hashed arrays are the same at 2.5M and 250K.

## Workers by width, not by cells

The picture used workers only from 300K cells, a threshold that belongs to the final cover, whose work grows with the
cells. The picture's work grows with its pixels, so at 250K and 4096 px it took 9.7 s on one thread, more than at
2.5M on workers. It now uses workers from 1024 px wide at any Detail (`WORKERS_FROM_WIDTH`); the copies of a small mesh
are small. 250K cells, 4096 px: picture 9.7 → 4.6 s, the 126 hashes the same as on one thread. 160K at 4096 px: 4.5 s.
The ladder's first pass (160K, 2048 px) gains the same way.

What is left in the picture runs whole on the finish's thread: the look's setup (0.96 s) and the small lakes (0.7 s).
