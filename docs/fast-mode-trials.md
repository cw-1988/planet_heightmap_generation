# Fast mode: the parts tried

Each trial ran `v2/tools/finish-similar.mjs` against the exact finish (seed 799224, 30 %, 290 Myr). None passed, so
none is kept. Back to [fast-mode.md](fast-mode.md).

| Part | Cells | Saved | Out of limits |
|------|-------|-------|---------------|
| Climate, one coupling round instead of the set ones | 2.5M | climate 5.4 → 4.2 s | Köppen same 0.62, rain off 31 %, trunks kept 0.79 |
| Carve, one round on the finest mesh | 2.5M | rivers 6.0 → 5.1 s | trunks kept 0.92 (≥ 0.95), land height RMS 0.058 km (≤ 0.03) |
| Climate grid at 2° instead of 1° | 250K | climate 0.7 s less, finish 13.8 → 13.2 s | Köppen same 0.71, rain median 0.18, mean temperature 0.74 °C, land RMS 0.12 km |
| Climate grid at 2° instead of 1° | 2.5M | climate 5.4 → 3.6 s, finish none (39.9 s against 36.8 s, noisy) | Köppen same 0.72, trunks kept 0.81, rain median 0.18, land RMS 0.17 km |

## Moved, or another planet?

The cell-by-cell check fails a border moved by 20 km as surely as a desert turned forest, and its land-height limit is
stricter than a Detail step: the exact 640K and 1.25M finishes, resampled onto the 2.5M mesh, differ from it by
0.29–0.31 km RMS in land height and keep only 87–90 % of cells' Köppen class. So `v2/tools/finish-kind.mjs` compares by
what the planet is, with the 640K rung as the yardstick (a fast part may change no more than twice what a Detail step
does). At 2.5M, against the exact finish:

| Measure | 2° grid | one round | 640K rung | 1.25M rung |
|---------|---------|-----------|-----------|------------|
| Köppen same, per cell | 0.72 | 0.62 | 0.87 | 0.90 |
| … the class within 3 cells (~40 km) | 0.88 | 0.80 | 0.99 | 0.995 |
| … within 8 cells (~110 km) | 0.94 | 0.88 | 0.996 | 0.999 |
| land area that changes class | 5 % | 12 % | 0.7 % | 0.3 % |
| worst 10° zone, land temperature | 1.0 °C | 2.2 °C | 0.13 °C | 0.07 °C |
| worst 10° zone, land rain | 20 % | 44 % | 3 % | 2 % |
| land height RMS, per cell | 0.17 km | 0.15 km | 0.31 km | 0.29 km |
| land height p90 / p99 | −44 / −41 m | −19 / −49 m | +40 / +34 m | +21 / +13 m |
| river / trunk-river length | +0.2 / +1.7 % | −0.2 / +0.1 % | −7 / −3.5 % | −3.6 / −0.7 % |

The land and rivers are the same planet: they move less than a Detail step moves them. The climate is not just shifted:
whole latitude bands come out a degree warmer or colder and a fifth wetter or drier, and 5–12 % of the land changes
class. A Detail step moves the climate's borders by a cell or two and leaves the zones within 0.1 °C. The coarser grid
blurs the mountains' rain shadows and the coasts' reach inland, and one coupling round leaves the winds and temperature
short of where they settle, so both change what climate a region has, not just where its border lies.

Times: the 2° grid's finish took 30.2 s and the one round's 31.8 s, against 36.8 s for an exact run made earlier. In the
same runs the rivers and water, which the climate does not touch, ran 2 s faster, so the machine's own spread hides most
of the gain: about 2 s from the 2° grid, about 1.4 s from the one round.

## Why they fail

The climate is not a leaf: its rain drives the erosion, the rivers and the lakes, and the final climate reads the land
those leave. Any climate shortcut moves the rain by tens of per cent in places, and the land, rivers and Köppen map move
with it: a change in kind, not detail. The carve's lone round saves too little (under a second of ~37 s) to be worth a
borderline fail.

## What would pass

Speed-ups that compute the same thing faster rather than something coarser: the GPU for the surface's noise and the
picture, and the floods split per landmass (see "What is left" in [fast-mode.md](fast-mode.md)).
