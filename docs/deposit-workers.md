# The deposits on workers

The Finish's **deposits** stage (`v2/js/geology/deposits.js`) puts the history's mineral systems, the climate's and the
rivers' deposits on a 0.5° grid of districts. Most of its time is the loop over the cells, and each cell only ever raises
grid cells to its own value (each keeps its richest). So from 300K cells that loop runs on worker threads by cell range:
`depositFieldsOnWorkers` and its worker `v2/js/geology/deposit-worker.js`, spawned by `terrain-pool.js`'s `spawn`, as
the final climate does ([final-cover-workers.md](final-cover-workers.md)).

- **Before the cells, on the finish's thread** (`depositSetup`): the record's systems on the grid, the ground's
  roughness and height over its surroundings, the aggregates' sources, each grid cell's rock shares.
- **The cells** (`depositCells`): each worker gets those grids once (shared memory where the page has it), then ranges of
  cells (4 per worker), each with its own slices of the per-cell inputs; the next range as soon as one is done. A range
  covers a span of grid cells (they are numbered in cell order) and hands back its rows over that span and its cells'
  placer sources.
- **After the cells, on the finish's thread** (`depositFinish`): the ranges merged (each grid cell its richest), then
  the placers down the rivers, the land's shares, the metals and the grid's holes filled.
- Below 300K cells, or where no worker starts, the same `depositCells` runs over all cells on the finish's own thread
  (`depositFields`, which the tools still call).

**The same values, bit for bit**, on one thread, on workers (any count) and with memory shared: the merge keeps the
maximum, and the loop's skip of a grid cell already richer never changes a value. Checked by hashing everything the
deposits return (`v2/tools/bench-deposits.mjs`, on inputs `bench-generate-memory.mjs --dump-deposits` writes out).

**One fix along the way** (`v2/js/geology/district-shapes.js`, `prepare()`): it read the lattice's data before
`corners()`, which can grow it, so the cell that made it grow read zeros. Which cell that was depended on the order the
cells came in, so ranges gave other values than one pass. It now reads the data after; the deposits differ slightly from
before at those few cells.

## Measured

Node, seed 2's Generate build, the deposits alone:

| Detail | one thread (before) | workers | workers, memory shared |
|---|---|---|---|
| 2,560,000 | 6.60 s | 3.45 s | 3.10 s |

In Generate, in the browser pane (8 workers, memory shared; 2026-11-24, a new seed each):

| Detail | deposits before | after | of which: setup · cells (workers' start) · after the cells |
|---|---|---|---|
| 1,400,000 | ~3.6 s (one thread, by Node's rate) | 3.3 s | 0.9 · 1.8 (0.4) · 0.6 |
| 10,000,000 | 37.4 s | 9.4 s | 2.5 · 5.6 (0.4) · 1.3 |

What remains is the setup and the finish on the finish's own thread, and at the smaller Details the workers' start.
