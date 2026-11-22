# Fast mode: the parts tried

Each trial ran `v2/tools/finish-similar.mjs` against the exact finish (seed 799224, 30 %, 290 Myr). None passed, so
none is kept. Back to [fast-mode.md](fast-mode.md).

| Part | Cells | Saved | Out of limits |
|------|-------|-------|---------------|
| Climate, one coupling round instead of the set ones | 2.5M | climate 5.4 → 4.2 s | Köppen same 0.62, rain off 31 %, trunks kept 0.79 |
| Carve, one round on the finest mesh | 2.5M | rivers 6.0 → 5.1 s | trunks kept 0.92 (≥ 0.95), land height RMS 0.058 km (≤ 0.03) |
| Climate grid at 2° instead of 1° | 250K | climate 0.7 s less, finish 13.8 → 13.2 s | Köppen same 0.71, rain median 0.18, mean temperature 0.74 °C, land RMS 0.12 km |
| Climate grid at 2° instead of 1° | 2.5M | climate 5.4 → 3.6 s, finish none (39.9 s against 36.8 s, noisy) | Köppen same 0.72, trunks kept 0.81, rain median 0.18, land RMS 0.17 km |

## Why they fail

The climate is not a leaf: its rain drives the erosion, the rivers and the lakes, and the final climate reads the land
those leave. Any climate shortcut moves the rain by tens of per cent in places, and the land, rivers and Köppen map move
with it: a change in kind, not detail. The carve's lone round saves too little (under a second of ~37 s) to be worth a
borderline fail.

## What would pass

Speed-ups that compute the same thing faster rather than something coarser: the GPU for the surface's noise and the
picture, and the floods split per landmass (see "What is left" in [fast-mode.md](fast-mode.md)).
