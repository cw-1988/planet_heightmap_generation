# Fast mode: the climate's rounds kept from a coarser pass

The one fast part kept so far (`climate`, [fast-mode.md](fast-mode.md)). Trials at 2.5M against the exact finish, seed
799224, 30 %, 290 Myr. Back to [fast-mode-trials.md](fast-mode-trials.md).

## Where the climate's time goes

On the 1° grid the climate costs the same whatever the mesh (`tuning/climate/grid-step-check.mjs`, Earth at 160K, two
runs each):

| Stage | 1° | 2° |
|-------|----|----|
| temperature ↔ winds ↔ ocean (2 rounds) | 2.2 s | 0.7–0.9 s |
| rain | 0.4–0.5 s | 0.35 s |
| temperature with clouds | 0.6–0.8 s | 0.2 s |

The coupled rounds are two thirds of it. They read only the land as the 1° grid sees it (its land share and heights per
grid cell), which a pass of the same moment at a coarser Detail has already solved.

## The trial

`climate`'s rounds come from the pass before, if it is at most 4× coarser, from the same worker. They are taken before
the clouds (`stages.coupled` in `core.js`). The rain and the clouds' temperature then run on the finer pass's own
surface. Judged with `finish-kind.mjs --yard ref-640000`:

| Measure | from 640K | from 160K | exact 640K (yardstick) |
|---------|-----------|-----------|------------------------|
| Köppen same, per cell | 0.964 | 0.932 | 0.869 |
| … within 3 cells | 0.998 | 0.995 | 0.987 |
| land area that changes class | 0.3 % | 0.8 % | 0.7 % |
| worst 10° zone, land temperature | 0.07 °C | 0.23 °C | 0.13 °C |
| worst 10° zone, land rain | 1.2 % | 3.7 % | 3.4 % |
| land rain p10 | −0.4 % | −4.4 % (out) | −1.5 % |
| temperature p99, per cell | 0.94 °C | 1.7 °C | |
| climate stage | 4.5 → 2.0 s | 4.5 → 2.2 s | |

From 640K, every measure is within the yardstick and under it, so the part is kept. From 160K, the dry tail moves by
three times the yardstick and the worst cells by 1.7 °C: at 160K a 1° grid cell holds two or three mesh cells, so its
coasts and heights are a different land to the winds. Starting one round from 160K's rounds instead (`warm`, tried
then removed) was worse than taking them as they are: the worst zone moved 1.2 °C. The exact climate is two rounds from
a cold start, not a settled state, so a third round changes it.

## Where it pays

Only where a pass within a Detail step comes first: Add detail at 10M (its ladder is 160K, 2.5M, 10M), or a Detail
raised one step on a moment already detailed (640K, then 2.5M). The default 2.5M ladder (160K, then 2.5M) gains nothing,
and adding a 640K pass for it costs far more than 2.5 s.

## Coarser or not: the Earth question

Whether the 2° grid's blur is closer to Earth than the 1° grid could be scored against Beck's Köppen map. Its data is not
in this checkout (`tuning/climate/data/ref1deg`). `fetch-references.mjs` downloads it (figshare and NOAA PSL), then
`regrid-references.mjs` and `grid-step-check.mjs --steps 1,2` give the score. The 1° grid is the one the climate was
tuned against Earth on.
