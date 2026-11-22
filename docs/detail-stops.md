# The Detail stops and this machine's finest

One Detail slider, the same on every page that has one: Generate's and Import's **Detail**, Evolution's **Add detail**,
and its history's **Terrain detail** menu (160K, 640K, 2.5M), capped the same way. The code is `js/detail-stops.js`. Back to
[shared.md](shared.md).

## The stops

There are 20 stops from 5,000 to 10,000,000 cells. Each is about 1.5× the one before (×2000^(1/19), rounded to two
figures):

5K · 8K · 11K · 17K · 25K · 37K · 55K · 82K · 120K · 180K · 270K · 410K · 610K · 910K · 1.4M · 2M · 3M · 4.5M · 6.7M · 10M

| Page | Slider | From | Default |
|------|--------|------|---------|
| Generate, Import | `#sN` (the stop's index) | 5K | 180K |
| Evolution, Add detail | `#finishCells` | 120K | 3M |
| Evolution, Terrain detail | `#terrainCells` (a menu) | its options | — options above the machine's finest are removed |

The label reads, for example, "2M cells · 17 km": the cell count and the cell spacing on an Earth-sized planet.
Add detail's passes are picked from these stops too ([finish-ladder.md](finish-ladder.md)).

The owner asked for it on 2026-11-22: "lets try 10m as max in the slider, can we do a stop slider, that 1.5x-es a tevery
step?", then "can we make the max machine dependent? for all sliders that use those kind of detials".

## The machine's finest stop

Each page's slider ends at the finest stop whose modelled peak memory fits the page's budget (`maxStop`):

- **Budget:** half the machine's memory as the browser reports it (`navigator.deviceMemory`), the same "safe" share as
  [finish-ceiling.md](finish-ceiling.md). Older Chrome reports at most 8 even when there is more, so a reported 8 is
  taken as 16. Where the browser reports nothing, the budget is 8 GB.
- **Touch devices:** a phone or tablet stops at 610K on every page, whatever it reports, because its browser closes a
  tab well under 2 GB.
- **Peak models** (GB, the page and its workers together, M = millions of cells):

  | Page | Peak | Where it comes from |
  |------|------|---------------------|
  | Generate, Import | 1.5 + 0.9·M | the measurement below (Import builds through the same worker and finish) |
  | Evolution | 3.1 + 0.33·M | the finish's 1.6 + 0.33·M in Node ([finish-ceiling.md](finish-ceiling.md)), plus the page |

- **A closed tab lowers it.** A build writes `detailBuilding:<page>` to localStorage before it starts and removes it
  when it ends or the page is left. If the key is still there at the next load, the browser closed the tab mid-build,
  so that page's slider now ends one stop below (`detailCap:<page>`). A later build that succeeds above the cap removes
  the cap.
- **Developer override:** `?maxdetail=<cells>` in the address bar sets the finest stop directly and ignores the cap.

The warning under the slider uses the same model. Above 3/4 of the budget it is red: "Near this machine's memory —
slow, and the tab may close". Above 2/5 it is orange: "High detail — slow to build".

## Measured: Generate

Measured on 2026-11-22 in the app's browser pane, on a desktop with 32 GB that reports `deviceMemory` 32, so its
budget is 16 GB. The page started from a 180K world. The sampler summed the private memory of every Claude-app process
twice a second.

| Detail | Peak over the start | Largest single process | First picture | Done |
|--------|---------------------|------------------------|---------------|------|
| 2.56M (from a page already holding 2.56M) | +4.7 GB | 5.1 GB | — | — |
| 10M | +10.2 GB | 11.4 GB | 133 s | ~300 s |

At 10M the progressive steps came at 2.3 s (5K), 40.6 s (2.56M) and 80.3 s (5.12M). The finish's terrain landed
94 s after the first picture, and the rest about 70 s later. The model, 1.5 + 0.9·M, gives 10.5 GB at 10M: just over
the measured peak, with room for the page itself. It also gives 3.8 GB at 2.56M, under that run's +4.7 GB, but that
run started with a 2.56M world already held.

With this model, the slider ends at these stops (desktop, no crash cap):

| Memory reported | Budget | Generate, Import | Evolution |
|-----------------|--------|------------------|-----------|
| 32 GB or more, or 8 (taken as 16) | 16 GB | 10M | 10M |
| 16 GB, or nothing reported | 8 GB | 6.7M | 10M |
| 4 GB | 2 GB | 410K | none fits, so its lowest stop, 120K |

## Planet codes

A planet code stores Detail as one of 2,556 steps that end at 2,560,000. A Detail above that is added after the
code's base as `.` followed by its thousands in base 36, and before any `-toggles`. Codes at or under 2.56M are
unchanged. `tuning/check-detail-code.mjs` round-trips every stop.
