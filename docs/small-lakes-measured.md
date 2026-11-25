# Small lakes: measured, 2026-11-20

The first measurement of [small-lakes.md](small-lakes.md), of the first version (replaced: [round
2](small-lakes-measured-2.md)). Seed `kw90o25briyrb5smb3i9rb` on Generate, Detail 2.56 M,
Small lakes 0, picture 8192 × 4096. 400 000 random land points, uniform over the sphere's area, each tested at full
resolution (every octave down to 0.31 km).

## The finish's shares (`stats.ponds`, % of land cells)

| Glacial | Thermokarst | Floodplain | Humid | Base | Total |
|---|---|---|---|---|---|
| 1.47 | 0.28 | 0.03 | 0.11 | 0.09 | 1.98 |

## Drawn, by latitude (% of that band's land)

| Latitude | 0–15° | 15–30° | 30–45° | 45–60° | 60–75° | 75–90° |
|---|---|---|---|---|---|---|
| Land in band | 4.0 | 17.5 | 35.4 | 32.8 | 8.9 | 1.5 |
| Small lakes | 0.37 | 0.12 | 0.14 | 2.40 | 10.14 | 6.38 |
| Mesh lakes | 0.64 | 0.72 | 0.25 | 1.02 | 3.47 | 1.14 |

On all land the small lakes cover 1.87 % against an expected share of 1.92 %, so the draw is unbiased (Delesse). Mesh
lakes add 0.90 %, for 2.8 % in all; Earth is ~3.7 %. The 60–75° band is like Finland or the Canadian Shield (~10 %),
the dry subtropics almost bare.

## Drawn, by height (% of that band's land)

| Height | < 200 m | 200–500 | 500–1000 | 1–2 km | 2–3 km | > 3 km |
|---|---|---|---|---|---|---|
| Land | 20.6 | 35.4 | 23.3 | 12.7 | 3.9 | 4.1 |
| Small lakes | 2.97 | 1.92 | 1.53 | 1.22 | 0.98 | 0.67 |

The lowland holds the most. What remains high up is the ice age's flat ground (a glaciated plateau holds lakes, as
Tibet's does).

## Pictures and windows

- The world's picture draws the 20 km and 10 km octaves: 0.83 % of its land pixels.
- A 51 km window at 71° (share 28 %) drew 19 % water in 0.28 s through the zoom path (`pondsInWindow`).

## Changed after it

- Floodplain lakes were first set on the river's own cell only, for discharges of 200–5000 m³/s. That gave 0.01 %. They
  now cover the meander belt (0.06 km × √Q), on the river's cell and its neighbours: 0.03 %. This world's big rivers
  are few. Its tropics are dry.
- A test with a float-overflowing random generator (only 2 340 distinct points) first looked like a hash bias.
  Re-tested with `Math.random`, the per-lake hashes are unbiased; nothing was changed for it.
