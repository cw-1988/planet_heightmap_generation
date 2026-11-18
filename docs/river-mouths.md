# River mouths end at the shore

The map's rivers (`fin.rivers`, `v2/js/finish/finish-hydro.js`) are lists of cell centres. A river's last step went
to the centre of the first water cell (the sea or a lake), so every drawn river ran on past its coast by half a cell or
more. Cells are ~54 km across, so the line reached tens of km out to sea. This was a bug, not a delta.

**Fix:** the last point is the shore: the midpoint of the last land cell's centre and the water cell's centre, put
back on the sphere (`pushShore`).

**Measured** (medium, the test planet), how far past the coast a mouth's last point lies:

| | Median | p90 | Max | River points on sea pixels |
|---|---|---|---|---|
| Before | 31.6 km | 45.2 km | 101.3 km | 3,943 |
| After | 4.2 km | 9.9 km | 50.7 km | 2,110 |

What is left is the coast's own shape: the midpoint of two cell centres is not exactly the drawn coastline, which is
a contour of the height picture. The region pick's river edges follow the same points
([region-rivers-vs-cells.md](region-rivers-vs-cells.md)): 10 of their 7,227 chords (8.5 px in all) still lie over the
sea.
