# Aggregates: sand, gravel, crushed rock and silica sand

The bulk building materials of a world, beside its building stone and clay (`v2/js/geology/aggregates.js`, settings in
`geology-config.js` `deposits.aggregates`, written by `deposits.js` in the finish's `deposits` stage). Four kinds of
deposit, group `building`:

| Kind | Where it comes from | Use |
|---|---|---|
| **Sand and gravel** (`gravel`) | River channels and terraces (by discharge, coarser upstream where the ground is rough; gorges carry little), glacial outwash in the till band beyond the old ice edge, eskers and kames on once-glaciated ground, beach and coastal sand on the shore | Concrete, mortar, road base |
| **Desert sand** (`desertSand`) | The ergs (wind-blown sand seas) | Fill only: wind-rounded grains bind poorly, so it is poor for concrete. Kept at a low weight (`ergCap` 0.3) |
| **Crushed rock** (`crushedRock`) | Quarries in hard rock (granite, gneiss, basalt, quartzite, limestone…) where no sand and gravel lies within ~60 km (`nearKm`) | Concrete and road aggregate where gravel is lacking |
| **Silica sand** (`silicaSand`) | Quartz sandstone, and clean, well-sorted beach sand (wave-sorted, not a reef's carbonate sand nor a cold coast's shingle); clean dune sand a little | Glass, foundry moulds |

## Bulk and local

Aggregates are everywhere in small amounts, so only notable ground shows: each source passes a floor (`floor` 0.25) and
is banded poor · moderate · rich like every deposit. Sand and gravel, desert sand and crushed rock are bulk and local —
hauled a short way, quarried near the town that uses them — so they have no numbered districts (`NO_DISTRICTS` in
`evolution/geology-view.js`, with wood, clay and the building stones). Silica sand is rarer and carried farther: it
keeps districts and a story (the cover's basin, from `districts.js`).

## Scale

Every band is in kilometres (`riverBandKm`, `beachBandKm`, `nearKm`), so the result holds at every detail.

## Ages and saves

The building age reads them as one resource, *Sand, gravel and glass sand* (`ages.js`). The four
rows were added before the metals', so saves moved to finish version 3 (`save/versions.js`); an older moment gains four
empty rows (`save/migrations.js` `depositRowsAdded`). The district thresholds were recalibrated
(`node v2/tools/calibrate-districts.mjs`).
