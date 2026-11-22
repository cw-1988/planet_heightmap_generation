# The detail's drivers, the grid's blur and the hydrology flood: exact hoists

2026-11-22, at 2.5M. The hashes are the same at 2.5M and 250K (`v2/out/hash-finish.mjs`). That script now also hashes
the drivers (`fin.drivers`, 23 fields), so a change in the detail stage can't slip past it.

## What changed

All of these keep the same operations in the same order:

- **`finish-drivers.js` `detailDrivers`**
  - Each column's longitude, cosine and sine are worked out once, not for every pixel.
  - The per-pixel closure is now a plain function `angleIn`.
  - The rugged pass works out the wrapped columns once per pixel, not for each of its nine reads.
  - `blur3` handles the row ends apart from the middle, and finds the rows above and below once per row.
- **The records** (`deriveRecords`: margins and belts on the sim mesh, about 0.4 s at any size). `finish.js` now works
  them out while the surface's workers run, and passes them to the drivers as `rec`.
- **`finish-grid.js` `run`** (the climate grid's box blur)
  - The row pass splits into three stretches: the wrap at the left, the middle, the wrap at the right. The middle has
    no wrap tests.
  - The column pass picks one of four loops up front: add and drop, add only, drop only, or neither.
- **`finish-hydro.js` `hydrology()`'s flood**: its `ocean[nb]` test is dropped, because the ocean already holds rank
  −2 ([flood-redundant-tests.md](flood-redundant-tests.md)).

## Measured

At 2.5M, the detail stage went from 2.1 s to 1.3 s. Before, the 1.9 s inside it split into records 0.41 s, the pixel
loop 0.98 s, rugged 0.12 s and the blur 0.2 s. The whole finish took 37.1 s, within its run-to-run range of 35–37.5 s.
The surface stage (8.1 s) stays in its noise, since the records fit inside the workers' wait.

## Not done

- **The pixel loop on workers (about 1 s).** Most of its time goes to `mesh.index.nearest`. Without shared memory,
  each worker would need its own copy of the mesh's index and the fields it reads, about 200 MB, before it could
  start. The gain at best is under 1 s, so it was left as is.
