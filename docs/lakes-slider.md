# The Lakes slider

A slider in Generate's and Import's Climate section and Evolution's World section, −1 to 1 (default 0). It sets how
readily the land's hollows hold water, from a world without lakes to a lake district. Asked for by the owner, 2026-11-20
("maybe he actually wants a swamp world or one entirely without lakes"). Code: `v2/js/finish/lake-amount.js`. Back to
[generate.md](generate.md) · [import.md](import.md) · [evolution.md](evolution.md).

## On Evolution

It changes Add detail only: the previews' climates are keyed without it, a detailed moment with it (`detailKey` in
`evolution-main.js`, "greenhouse|rain|lakes"). A changed Lakes marks the detailed moment stale, so Add detail again
re-finishes it. The link carries `&lakes=`, a planet file's settings `lakes`; an older file's moment reads as Lakes 0.

## What it moves

The page passes `lakes` in its climate options. The finish worker (`finish-worker.js`) turns it into overrides of the
finish config (`lakeOverrides`). Each value is multiplied by its range factor to the power |x|, so 0 is the finish as
tuned.

| Config | −1 (factor) | +1 (factor) | What it decides |
|---|---|---|---|
| `lakeMinKm2` | — (∞: no lakes) | 50 km² (÷6) | The smallest hollow that is a lake |
| `lakeMinDepthM` | 60 m (×4) | 5 m (÷3) | …and its least depth |
| `lakeKeepKm2`, `lakeHugeKm2` | ×10 | ÷50 | How big a lake must be for its river to keep it, not cut through |
| `breachKm`, `seaBreachKm` | ×2, ×1.5 | ÷4 | How deep an overflow cuts its outlet ([basin-lakes.md](basin-lakes.md)) |
| `lakeSiltKm` | ×5 | ÷10 | The sediment rivers fill a lake with |

At −1, `lakeMinKm2` is ∞, so no water is kept anywhere. A closed basin keeps only its salt pan, a fresh one drains.

## In the planet code

Lakes ±0 keeps the 22-character code as before. Any other value adds a lowest base-21 digit, so the code has 23
characters (`js/planet-code.js`, `LAKES_LEN`). Older codes decode with Lakes 0.

## What it is not

- Not wetlands. A swamp world needs wet land cover (marsh, bog, floodplain forest) where the ground is flat and the
  water table high. That is the land-cover model's job, not more lakes. At +1 you get many small lakes and ponds, not a
  swamp.
- Not rain. More water comes from Precipitation; the Lakes slider changes which hollows keep the water they get.
