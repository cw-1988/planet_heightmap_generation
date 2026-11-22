# Fast mode: the climate's rounds on 2°, the rain and clouds on 1° (tried, not kept)

The 2° grid ([fast-mode-trials.md](fast-mode-trials.md)) saves ~2 s but blurs the rain shadows and the coasts. The
split kept the slow part, the coupled temperature ↔ winds ↔ ocean rounds, coarse, and left the rain and the clouds'
round on the exact grids: the temperature and ocean stages on 2° for the rounds (a `gridDeg` on the stage context), their
solved state interpolated to 1° for the clouds' warm start. All four mixes failed and the code was removed. Seed 799224,
30 %, 290 Myr, 2.5M, against the exact finish, judged with `finish-kind.mjs --yard ref-640000`.

| Mix | climate stage | worst 10° zone, land temperature | worst zone, rain | Köppen within 3 cells |
|-----|---------------|----------------------------------|------------------|-----------------------|
| 2° grid, everything (for comparison) | 2.5 s | 1.0 °C | 20 % | 0.88 |
| split: rounds on 2°, clouds' round on 1° | 3.2 s | 2.0 °C | 7.9 % | 0.95 |
| A: the clouds' round on 2° too | 2.8 s | 3.0 °C | 7.7 % | 0.93 |
| B: the clouds' round on 1°, cold started | 3.6 s | 6.6 °C | 7.9 % | 0.93 |
| D: only the first round on 2° | 4.0 s | 1.2 °C | 7.8 % | 0.97 |
| exact 640K (the yardstick; limit twice it) | 4.5 s | 0.13 °C | 3.4 % | 0.99 |

## What went wrong: the cold land

The rain on the exact grid did its job: on land the exact climate puts above 0 °C, the share of cells more than 3 °C off
fell from the 2° grid's 1.8–5.6 % to 0.1–0.7 %, and the worst rain zone from 20 % to 8 %. The error moved to the cold
land: between −20 and −10 °C, 21 % of the land is more than 3 °C off, its height unchanged (100 m). The snow and ice
cover there has two steady states (an ice sheet keeps itself cold: `temperature.js`, `perennial`), and a temperature
solved on another grid, or started from another state, lands some cells in the other one. A cold start (B) flips the
most (−30 to −20 °C: 55 % off by 5.6 °C on average). No mix of grids keeps the snow line where the 1° rounds put it, so
the shift cannot be made up for this way.
