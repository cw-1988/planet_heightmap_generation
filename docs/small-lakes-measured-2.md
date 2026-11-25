# Small lakes: measured, round 2 (2026-11-20)

The second measurement of [small-lakes.md](small-lakes.md), after the owner's "i need lakes not sprinkles" on two
zoomed windows: a 200 mm cold steppe (BSk, 53°N) and a 435 mm continental plain by a big river (Dwb, 54°N, 86°W), both
dotted with hundreds of specks. Same seed and settings as [round 1](small-lakes-measured.md): `kw90o25briyrb5smb3i9rb`,
Detail 2.56 M, Small lakes 0, picture 8192 × 4096, random land points uniform over the sphere's area.

## What was wrong

- Size: seven octaves, equal area each, down to 0.31 km lattices. Lakes were drawn down to ~1 px across, so most of
  them were specks; the biggest small lake was ~14 km.
- Discs: a lake is a ball cut by the surface. A ball cut near its edge leaves a tiny disc, so even big octaves made
  specks.
- Dryness: the gate was rain ÷ (300 + 55 T) mm, which underrates evaporation in the cold. The 200 mm cold steppe counted
  as wet.

## Changed

Octaves 40 km … 1.25 km weighted by τ = 2.14; elongated, wandering shores; lakes cross cell faces and merge; an overlap
correction; the Köppen dry line as the gate; a lake drawn only once its disc is 5 px across (2.5 on the world's
picture). Details in [small-lakes.md](small-lakes.md).

## Balance (% of land outside the mesh's lakes)

| Drawn down to | Drawn | Share |
|---|---|---|
| 0.05 km lakes (full zoom) | 1.90 | 1.92 |
| 1 km lakes | 1.68 | 1.94 |
| 12 km lakes (the world's picture, 2.5 px) | 0.54 | 1.93 |

By latitude at full zoom: 0.61, 0.16, 0.20, 2.58, 10.07, 5.27 % (0–15° … 75–90°), the share 0.56, 0.20, 0.18, 2.52,
9.94, 5.51. On the world's picture the 60–75° band shows 3 %; the worker's real 8192 px picture marks 0.79 % of its land pixels
(a lake's edge pixels round up), against 0.83 % before, now in fewer, bigger lakes. A constant share draws exactly (Node, 300 000 points: 2.06
for 2 %, 10.03 for 10 %, 40.4 for 40 %).

## Windows (200 × 200 km at 0.2 km a pixel, lakes counted as connected water)

| Place | Lakes | Water | Biggest (km²) | Under 9 px | Median lake | Time (1 M px) |
|---|---|---|---|---|---|---|
| Dwb plain, 54°N 86°W, before | 128 | 0.56 % | 108, 28, 9 | 100 under 1 km² | — | 0.43 s |
| Dwb plain, after | 34 | 0.50 % | 108, 28, 9 | 3 | 34 px (1.4 km²) | 0.68 s |
| Lake district, 71°N 103°E, before | 4 768 | 19.5 % | 790, 393, 343 | 3 982 under 1 km² | — | — |
| Lake district, after | 826 | 16.7 % | 788, 393, 345 | 24 | 45 px (1.8 km²) | 0.96 s |

A cold steppe spot (53°N 110°W): share 0.24 %, drawn 0.17 % over a 1.6° box.
