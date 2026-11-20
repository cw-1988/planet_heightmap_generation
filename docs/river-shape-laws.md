# River shapes by measured laws

Up close, a river's channel, bends and valley come from laws measured on real rivers, not from shapes set by eye
(2026-11-20). The laws live in `v2/js/finish/river-hydraulics.js`. The meanders (`river-meander.js`), the valleys
(`river-valleys.js`) and the page's drawn rivers (`river-draw.js`) all read them. `q` is the flow in m³/s.

| Shape | Law | Source | Before (by eye) |
|---|---|---|---|
| Channel width | 7.2 m · q^0.50 (1,000 m³/s ≈ 228 m) | Moody & Troutman 2002, after Leopold & Maddock 1953 | 6 m · √q |
| Channel depth | 0.27 m · q^0.39 (1,000 m³/s ≈ 3.9 m), cut into the floor across the channel | the same | none |
| Shortest bend | 10.9 channel widths | Leopold & Wolman 1960 | 50 m · √q |
| Swing of a wave | 1.35 / 10.9 of its length to each side (belt 2.7 widths) | the same | 0.2 of its length |
| Where bends stop | slope above 0.013 · q^-0.44: braided or torrent, no bends of its own | Leopold & Wolman 1957 | bends everywhere |
| Valley depth | the picture's height at the line minus the river's own carved ground (its running minimum downstream), at most 3 km | the stream-power gorges already cut in `finish-hydro.js` | a fixed depth |
| Valley sides | threshold hillslope, tan 0.7 (35°) at the bank, easing to the land at the rim (mean 0.35) | Roering et al. 1999, Montgomery 2001 | 0.04 (2.3°) |

## How each is wired

- **The river's ground**: `finish-hydro.js` keeps each line point's carved height (`R.z`, km).
  - `riverParts` takes its running minimum downstream, so a river never climbs.
  - It also reads the slope there (centred, m/m) and carries both on every LINE entry (S0 S1, z0 z1).
- **Bends**: `meanderAt(s, end, q, slope, …)` sums the waves from 16 km down to the river's own bend.
  - `meanderShare(q, slope)` eases from 1 at half the braiding slope to 0 at 1.5 times it.
  - It removes the waves within 3–8 bend lengths; the longer ones are the valley's and stay.
- **Valley**: `carveValleys` cuts `depth · (side profile) + channel depth`.
  - The side profile reaches out to `width/2 + depth / 0.35`.
- **Unchanged drawing choices**: the bed (`BED`, 2 channels wide) and the 16 km widest wave are still set by eye.
  - They set how the page looks, not a measured shape.

## What changes on the map

- Plains rivers sit almost level with their land. Their valley depth is near zero, as on real lowland rivers; only the
  channel is cut.
- Mountain rivers run straighter, without the tight bends of their own, and sit in steep V valleys as deep as the
  gorges the erosion cut.
- The meanders are smaller: a bend swings about 12 % of its length to each side, not 20 %.

`v2/tools/check-river-joins.mjs` checks the channel against the law. It also checks that a steep river loses its own
bends but keeps its swing, and that the confluences still join.
