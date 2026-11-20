# Basin lakes: how deep an outlet cuts, the water balance, and sediment

How a basin behind a high rim ends up: a gorge to the sea, a lake, a salt pan or a filled plain. Changed 2026-11-20 after
the owner asked why rivers on seed `kw90o25briyrb5smb3i9rb` (21.8N 98.9W to 18.7N 94.5W) cut through a ~600 m higher
plateau to the sea instead of forming a lake in the valley west of it. Code: `v2/js/finish/finish-hydro.js` (the
trapped-sea branch), `v2/js/finish/lake-silt.js`. Config: `seaBreachKm`, `seaBreachQ`, `lakeSiltKm` in
`finish-config.js`. Back to the [v2 README](../v2/README.md) (the finish's hydrology).

## What was wrong

- A remnant of the sea trapped in a basin (its floor below sea level) that its river could keep full was cut through its
  rim **down to 3 m above sea level, whatever the rim's height**: a gorge hundreds of metres deep and hundreds of
  kilometres long. Rivers can cut gorges through rising ground (antecedent rivers: the Colorado, the Indus), but not
  everywhere and not always all the way down.
- The test for "its river keeps it full" compared the inflow with the evaporation of the hole below sea level only, not
  with that of the whole lake up to its sill.
- The rules "every river needs to end at ocean not lake", "no closed basins" and lakes over trapped seas "too enormous"
  are quoted from the upstream author (raguilar011095, the v3.0.1 merge, ed466f9). They are not the owner's.
- Just fixing the evaporation test drowned the region: one 520 000 km² lake at ~1 km, because the plateau lies inside
  the same basin.

## The rule now

1. **The outlet's cut is bounded.** The river spilling over the rim cuts it down by at most `seaBreachKm` (0.8 km),
   all of it by `seaBreachQ[1]` (3 000 m³/s), less for a smaller river (log scale from `seaBreachQ[0]`, 100 m³/s). It
   never cuts below `seaCutFloorKm`. Analogues: Lake Bonneville cut Red Rock Pass ~110 m; Lake Idaho cut Hells Canyon.
2. **Below that outlet, the water balance decides.** The basin's cells under the outlet level are wetted lowest first
   while the inflow still covers their evaporation (`lakeDeficit`). If the inflow can wet them all, the lake fills to the
   outlet and spills through the gorge. Otherwise it is closed: a terminal salt sea where it is big for its river or on
   an old deep sea floor (the Caspian, the Dead Sea), else a salt pan.
3. **Rivers fill fresh lakes with sediment** (`lake-silt.js`). Every fresh lake gets `lakeSiltKm` × its catchment's
   area of sediment (10 m off the catchment; a young glacial lake `glacialSiltShare` of that, 12 000 years of it). It
   traps that by Brune's curve: the share it keeps falls with the share of its basin still open water, so the volume
   left is V0·e^(−S/V0) and no lake drops from full to nothing at a threshold. Deltas build out from the inlets, the
   biggest river's furthest, round the deep water before over it, to 1 m above the level. Pieces left under
   `lakeMinKm2` are filled too. This replaced the size-for-river cut (`lakeKeepKm2`), which kept only lakes big for
   their river and so left one lake on a continent. Analogues: the Pannonian lake (filled), the Rhône in Lake Geneva.
4. **A land basin its river cannot fill is closed**, as in 2: a salt lake or a salt pan on its lowest ground, no longer
   cut through to the sea (the Great Basin, the Altiplano's salars).

`water.fates` in the hydrology's stats counts per fate (no origin, too small, lake, salt, pan, drained, filled) the
hollows and their area, all and within 35° of the equator.

## Measured on the seed (the region 17–23N, 94–101W)

| Version | The trapped basin |
|---|---|
| Before (cut to 3 m) | No lake; the river runs through a gorge cut ~600 m into the plateau |
| Evaporation over the whole basin only | One salt lake of 521 620 km² at 996 m: the whole region flooded |
| Bounded cut (0.8 km), no sediment | A fresh lake of 214 138 km² at 421 m |
| + sediment 30 m | No lake left: a dead-flat plain at ~422 m |
| + sediment 10 m, Lakes −0.1 | A lake of ~36 000 km² at 388 m in the basin's deepest part, a filled plain around it; the only lake in the continent's south |

With Brune trapping, no size-for-river cut and closed land basins (now). "Pieces" are the lakes between 5S–50N and
135–60W (the old rule: 21 at −0.1):

| Lakes | The basin's lake | Pieces | Fresh lakes on the planet |
|---|---|---|---|
| 0 | 107 193 km² at 421 m | 53 | 1 235 |
| −0.1 | 74 119 km² at 388 m | 45 | 719 |
| −0.2 | 43 435 km² at 353 m (the old rule: none) | 43 | 688 |

## What is physics and what is a choice

- Physics: fill-and-spill, the closed basin's water balance, outlets cut by their overflow, deltas filling lakes.
- Choices tuned by eye: the cut's depth (0.8 km) and its river sizes, and the sediment depth (10 m). The true answer per
  river depends on the uplift's history (an antecedent river keeps its gorge, a younger rim dams a lake). The finish
  doesn't read that history yet.
- The [Lakes slider](lakes-slider.md) scales these choices for a world with fewer or more lakes.
