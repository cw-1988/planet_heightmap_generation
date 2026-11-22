# The carving's passes in cell order

`carveLevel` (`v2/js/terrain/carve.js`) walked every pass after its priority flood in the flood's order: from the sea
inward, so each step jumps somewhere else in memory. Several of those passes don't need that order. Each cell's result
depends only on its own values, or is a min over its neighbours. They now run in the cells' own order, over the cells
the flood reached (`rank[c] >= 0`):

- the receivers (the steepest way down; reads `rank` to know which neighbours came first);
- the history's rivers as a floor for the bed, and an active belt's hold;
- the share of a cell its valley takes, and the valley sides carried into the cells beside it (a min);
- the land floor above a closed basin.

The land test is a lookup array built once per level, rather than a closure that reads two fields.

These passes stay in the flood's order, since each needs its receiver done first: drainage area, the river beds' walk,
"rivers run downhill", the slope limit. The same split applies in `v2/js/finish/finish-basins.js`: its tectonic-hollow
marks are per cell; its lake patches and inflows keep the flood's order.

## Result

At 2.5M cells, one round's receivers: 0.47 → 0.08 s. The finish's rivers stage: 7.8 → 6.6 s. The 126 hashed arrays are
the same at 2.5M and 250K (`v2/out/hash-finish.mjs`). Where the rest of the stage goes: [finish-profile.md](finish-profile.md).
