# How high a Detail can go (the ceiling)

What the finish's top Details cost in time and memory, and how to measure a machine's own ceiling. The page's top
Detail is 10M (`evolution.html`, `#finishCells`), lowered to what the machine's memory holds
([detail-stops.md](detail-stops.md)). Back to [finish-ladder.md](finish-ladder.md).

## Measured

Node, seed 799224, 30 % continent, 290 Myr, 40K plate cells, the page's picture widths (`v2/tools/bench-ladder.mjs`,
which prints each pass's time and the process's peak memory, its pool's workers included). A desktop with 16 logical
CPUs and 31 GB of memory:

| Pass | Time | Peak memory | Held after | Biggest stages (s) |
|------|------|-------------|------------|--------------------|
| 160K (ladder) | 12.7 s | 1.42 GB | 0.52 GB | climate 4.3, surface 2.2, picture 2.0 |
| 2.5M (ladder) | 40.4 s | 2.44 GB | 2.03 GB | picture 7.6, surface 7.0, climate 4.6, rivers 4.5, mesh 4.0 |
| 10M (ladder) | 132.2 s | 4.93 GB | 4.50 GB | rivers 21.5, mesh 18.1, surface 16.8, water 16.7, picture 15.7, final climate 10.0 |
| 20M alone (8192 px) | 248.0 s | 8.20 GB | 7.13 GB | mesh 46.1, rivers 43.8, water 33.9, surface 27.9, picture 16.9, final climate 15.5, sea 14.5 |

The 10M ladder (160K → 2.5M → 10M) took 185 s in all, the menu's "~3 min". A 20M ladder would be about 300 s
(5 min): its 160K and 2.5M passes add ~53 s.

## How it scales

- **Memory:** about 1.6 GB fixed plus 0.33 GB per million cells (2.44 GB at 2.5M, 4.93 GB at 10M; it foretold the
  20M peak to within 0.01 GB). Every per-cell array is a typed array, 40 MB or more at 10M, and the finish lets each
  go as soon as it is done with. So 40M would need ~15 GB, 80M ~28 GB.
- **Time:** 10M → 20M took 1.9× (132 → 248 s). The mesh (18 → 46 s, Delaunay) and the rivers' carve (22 → 44 s) grow
  faster than the cells; the climate barely grows (its grids are in degrees, not cells), and the picture stays at
  8192 px.

## What limits it

- **In Node:** the machine's memory only. Typed arrays sit outside V8's heap, so `--max-old-space-size` matters little.
- **In the browser:** one tab's finishing worker holds the mesh and every array. A worker's own heap is capped near
  4 GB, but the typed arrays live outside it, so the true limit is what the browser lets one tab take (Chrome kills a
  tab that grows past what the system can spare). Each page's slider ends at the stop that fits half the
  machine's reported memory, touch devices at 610K (`maxStop` in `js/detail-stops.js`).
- **Waiting:** each doubling of the cells nearly doubles the wait: ~5 min for a 20M ladder, ~9–10 min for 40M.
- **The picture:** 8192 px wide from 5M cells up. At 10M a cell is already ~8 km, about 2 px of that picture, so a finer
  mesh needs a wider picture to show anything new (16384 px: a 4× larger picture and texture).

## Finding a machine's ceiling

Run passes up the sizes, one process each, and watch the peak:

    node --max-old-space-size=24000 v2/tools/bench-ladder.mjs --cells 160000,2500000,10000000
    node --max-old-space-size=24000 v2/tools/bench-ladder.mjs --cells 20000000

A size is safe when its peak stays under about half the machine's free memory (the browser, the OS and the page's
other workers need the rest). In the browser, the page's own run is the real test: Add detail at the size, with the
Task Manager (Shift+Esc in Chrome) showing the tab's memory.
