# Add detail in passes (the ladder)

Add detail refines a moment the way a render sharpens: a coarse pass first, shown as soon as it is done, then the
Detail chosen, which replaces it. What it costs, and how the passes are picked. Back to [evolution.md](evolution.md).

## How it runs

- `finishPasses(final)` in `v2/js/evolution/evolution-main.js` picks the passes; `finishMoment` runs them one after
  another through the one finishing worker (`finisher.finish`), each shown when done (`B.finishes` holds the last).
- The worker keeps the final pass's meshes from the start (`keepCells` in `v2/js/finish/finish-worker.js`), so a coarse
  pass doesn't throw away what the last one will need; small devices keep only the pass under way.
- Cancel keeps the last pass done (its note says "kept at 160K"); it exports as it is. Add detail again goes on from the
  next pass up, not from the first.
- The card's badge reads `Pass 2/2 · 2.5M`, the button `Cancel · 55%`, the bar weighs each pass by its cost.
- Developer toggle: `?passes=1` in the address bar runs the chosen Detail alone, as before the ladder.

## The cost model and the rule

A pass costs about **21.5 s fixed** (climate ~6 s; the picture, geology and the surface's worker pool ~10 s at 4096 px)
**+ 15.6 s per million cells**. A coarse pass before the last paints a 2048-px picture, about 8 s less.

A pass is added below the last only when it costs at most **half** the pass above it, judged at full width. So:

| Detail | Passes | First on screen |
|--------|--------|-----------------|
| 160K, 640K | one | as before |
| 2.5M | 160K → 2.5M | ~16.5 s |
| 10M | 160K → 2.5M → 10M | ~16.5 s |

640K is never a stop on the way to 2.5M: it costs nearly as much as 160K's fixed part and shows little more, and at
2048 px it would slip in ahead of 160K (a later first look for more time in all).

## Timings

Node, seed 799224, 30 % continent, 290 Myr, 40K plate cells (`v2/tools/bench-ladder.mjs`), one process per row:

| Run | Passes (s) | In all | Over 2.5M alone |
|-----|-----------|---------|-----------------|
| 2.5M alone, 4096 px | 60.7 | 60.7 s | — |
| 160K → 640K → 2.5M, 4096 px (the first plan) | 24.2 · 29.7 · 60.4 | 114.2 s | +88 % |
| 640K → 2.5M, 4096 px | 30.5 · 60.6 | 91.2 s | +50 % |
| 160K → 2.5M, 4096 px | 24.6 · 60.3 | 84.9 s | +40 % |
| 160K at 2048 px → 2.5M (the ladder as shipped) | 16.5 · 61.7 | 78.3 s | +29 % |
| 160K alone, 2048 px | 16.5 | 16.5 s | |

Stages at 160K (s): mesh 0.3 · surface 2.8 · climate 6.2 · rivers 0.5 · ice age 0.8 · wind 1.1 · detail 0.8 ·
final climate 1.8 — the climate's fixed cost is most of a coarse pass. At 2.5M: mesh 4.1 · surface 10.0 · climate 6.3 ·
rivers 7.0 · water 4.2 · final climate 10.5 (since on workers: 3.6, [final-cover-workers.md](final-cover-workers.md)); the picture on workers: 9.7 → 7.1
([picture-workers.md](picture-workers.md)), its terrain look's rows too: 7.1 → 5.0
([terrain-look-workers.md](terrain-look-workers.md)); the surface's pool better balanced: 10.9 → 10.7
([terrain-pool-balance.md](terrain-pool-balance.md)); the carving's passes in cell order: rivers 7.8 → 6.6
([carve-cell-order.md](carve-cell-order.md)); the finish's thread drawing picture bands too: 6.1 → 5.7, and
workers for the picture at every Detail: 9.7 → 4.6 at 250K ([picture-shares.md](picture-shares.md)); with the `?isolate=1` toggle, shared memory for the picture's workers: 5.7 → 4.0
([shared-memory.md](shared-memory.md)); the surface's warp on the pool's workers and the edge lengths kept: surface 10.25 → 9.3
([surface-warp-workers.md](surface-warp-workers.md)); the surface's points swept by longitude: about 0.7 s more
([surface-visit-order.md](surface-visit-order.md)); the rivers' months summed side by side: water about 0.4 s
([river-years-interleaved.md](river-years-interleaved.md)); the sea's flood only as far as needed: sea 2.2 → 1.8
([sea-flood-lazy.md](sea-flood-lazy.md)); where the rest goes: [finish-profile.md](finish-profile.md).

In the page, while the history was still being simulated beside it: 160K on screen at 21 s, 2.5M done at 114 s (both
slowed by the history's own worker).

So the ladder costs about a third more than the Detail alone (+29 %, 78 s against 61 s at 2.5M): the price of seeing
the moment after 16.5 s instead of 61. `?passes=1` is there for whoever would rather wait once.

## Run the bench

```
node v2/tools/render-moment.mjs …            # once, for the moment's cached frame (v2/out/frames/)
node --max-old-space-size=16000 v2/tools/bench-ladder.mjs --cells 160000,2500000
node --max-old-space-size=16000 v2/tools/bench-ladder.mjs --cells 2500000
```

It needs `delaunator` and `pngjs` installed at the repo root (`npm install --no-save --no-package-lock delaunator@5.0.1
pngjs`). Without `--width` it paints at the page's widths.
