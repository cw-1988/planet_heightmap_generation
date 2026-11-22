# Where a 2.5M finish spends its time

Measured with `v2/out/hash-finish.mjs` (Node, 8 workers, the meshes built ahead as the page builds them), 2026-11-22.
Each stage was timed with temporary timers, since removed. What each line led to is linked from
[finish-ladder.md](finish-ladder.md).

## Stages (s)

finish ~50 · surface 10.7–11.3 · climate 6.6 · rivers 7.8 (now 7.1) · water 5.1 · picture 5.8 · mesh 5.1 (absent in the
page: prebuilt) · final climate 3.7 · sea 2.2 · detail 2.1 · coast 1.8 · ice age 1.7 · wind 1.3 · farming 1.1.

## Climate (6.6 s)

The grid's temperature, winds and ocean solved together: 3.3 · rain 0.7 · temperature with clouds 1.3 · terrain cells and
Köppen 0.6 · the rest under 0.1 each. The per-cell part, which workers could split exactly, is only 0.6 s. The rest
is the grid's solve (`v2/js/climate/`), whose cost does not grow with the Detail.

## Rivers (7.8 s)

- Closed basins (`finish-basins.js`): 0.9–1.1 s, mostly its priority flood.
- The carving (`carve.js` `carveTerrain`): 6.3 s. Two rounds on the 2.5M mesh, about 2.2 s each; the 640K and 160K
  levels about 1 s; the rest goes to moving fields between the levels and the passes on the mesh shown.
- One 2.5M round: flood 0.9 · receivers 0.47 · drainage area 0.06 · river beds 0.35–0.42 · passes after 0.4–0.6.

The flood can't be split. Which of two cells with the same key comes off the heap first depends on the whole heap's
shape, and that choice decides parents on a flat, so a flood per landmass or per tile would not be guaranteed the same
bits. The rest could go to workers, but the page has no SharedArrayBuffer (no cross-origin isolation headers), so each
worker would need its own copy of the 2.5M mesh's adjacency: about 70 MB a level, for about 1.5 s of work a round. Done
instead: [carve-cell-order.md](carve-cell-order.md).

## Water (5.1 s)

Hydrology in `finish-hydro.js`. It was being changed by another session at the time, so it was left alone.
