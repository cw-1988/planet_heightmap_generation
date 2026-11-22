# Fast mode: a quicker finish that may differ in detail

The exact finish is checked by hash (`v2/out/hash-finish.mjs`): every speed-up so far left every bit the same. The fast
mode drops that rule for the parts it names. A fast part may change details, not the planet's kind, and is checked by
measure against the exact finish (`v2/tools/finish-similar.mjs`), not by hash. Back to
[finish-ladder.md](finish-ladder.md).

## The switch

- Off by default. Planet codes (`js/planet-code.js`) reproduce on every machine only with the exact finish, so it stays
  the default; a fast finish is the user's choice in this browser.
- One part so far, `climate`: the climate's temperature ↔ winds ↔ ocean rounds (~2.5 s at 2.5M) kept from a pass of
  the same moment at most 4× coarser, in the same worker (`roundsKey`, `keptRounds` in `fast-mode.js`). The rain and the
  clouds' temperature still run on the finer surface. It pays where a finer pass follows a pass within a Detail step:
  10M after Add detail's 2.5M pass, or a Detail raised one step on a moment already detailed. The default ladder to
  2.5M (160K, then 2.5M) gains nothing: from 160K the rounds differ too much ([fast-mode-trials.md](fast-mode-trials.md)).
- A new part needs its entry in `FAST_PARTS` and its `FP.has(name)` in `finishPlanet`.
- `?fast=1` (all parts) or `?fast=a,b` (a comma list of parts) on any app page; this browser remembers it
  (`localStorage` `orogen.fast`), `?fast=0` forgets it. `v2/js/finish/fast-mode.js` holds the parts (`FAST_PARTS`),
  `fastParts(spec)` and `pageFast()`.
- Every page's finishes go through `FinishService.finish` (`v2/js/evolution/finish-view.js`), which sends `fast` to the
  finish's worker, which hands it to `finishPlanet({ fast })`. A fast finish carries the mark `stats.fast` (the parts'
  names), logged with the finish's stages in the console.
- In Node: `finishPlanet({ …, fast: fastParts('a,b') })`; the similarity tool takes `--fast`.

## The similarity check

```
node --max-old-space-size=16000 v2/tools/finish-similar.mjs --cells 2500000 --ref
node --max-old-space-size=16000 v2/tools/finish-similar.mjs --cells 2500000 --fast <part,part…>
```

`--ref` runs the exact finish once (the moment `hash-finish.mjs` uses: seed 799224, 30 %, 290 Myr, 40K plate cells)
and keeps its heights, sea, drainage, lakes and cell climate in `v2/out/similar/` (ignored by git). `--fast` runs a fast
mix and compares, cell for cell on the same mesh, against the limits in `v2/tools/finish-similar-measures.mjs`:

| Measure | Limit | What |
|---------|-------|------|
| landHeightRmsKm | ≤ 0.03 | the land's heights, root mean square (km) |
| heightP99Km | ≤ 0.2 | the worst 1 % of cells (km) |
| seaChanged | ≤ 0.002 | share of cells that turned sea or land |
| riversKept, riversTrue | ≥ 0.9 | rivers (≥ 1000 km²) with a river of the other finish within a cell, both ways |
| trunksKept | ≥ 0.95 | the big rivers (≥ 50 000 km²) within two cells |
| lakeArea | ≤ 0.1 | the lakes' area, relative |
| tempMeanC, tempP99C | ≤ 0.3, ≤ 1 | the year's mean temperature, mean and worst 1 % (°C) |
| rainMedian, rainMean | ≤ 0.03, ≤ 0.06 | the year's rain on land, relative |
| koppenSame | ≥ 0.97 | land cells with the same Köppen class |

The temperature's tail is judged at 99 %, not at its worst cell: a carved valley a cell over moves that cell's height by
hundreds of metres, and the lapse rate (6.5 °C per km) takes its temperature with it.

The per-cell limits are stricter than a Detail step on the land (the 640K finish is 0.3 km RMS from the 2.5M one), so
a part is also judged against that step: `v2/tools/finish-kind.mjs --a ref-2500000 --b <run>,ref-640000 --yard
ref-640000` (runs kept by `finish-similar.mjs --save`). It compares climate areas, 10° zones, distributions and Köppen
within a few cells. A part passes when it is no more than twice the yardstick on every measure. For the land and the
rivers, and for the Köppen class, this check is the one that counts: a Detail step keeps only 87 % of cells' class, so
`koppenSame` ≥ 0.97 fails a border moved by a cell. The per-cell temperature and rain limits still apply.
`finish-similar.mjs --pass 640000` runs that pass first, untimed, as Add detail's ladder does.

## The parts tried

See [fast-mode-trials.md](fast-mode-trials.md): what each part changed, what it saved, and which were kept.

## What is left

The big costs are not in Node-testable approximations: the surface (~9 s, on the pool already), the picture (~4 s),
the rivers' floods (serial by nature). The way on is the GPU for the surface's noise and the picture (browser only, so
tested in the page), and the floods split per landmass, each a fast part checked by the measures above.
