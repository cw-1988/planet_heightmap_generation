# A new planet, from Generate to its finished layers

What the page shows between Generate (or an image imported) and the finished world, and why: a 204,000-Detail planet
used to sit as a black sphere for ~8 s, then show its first picture for another ~17 s before the detailed terrain landed
with a ~440 ms freeze. Measured 2026-11-20 on the owner's Windows laptop, Generate at 204,000 Detail. Back to
[shared.md](shared.md).

## The steps, in order

1. **The sketch** (`js/world-sketch.js`) — as soon as the plates are projected (~1 s), the planet worker sends land and
   sea: the ground rising inland and deepening offshore, with a little rolling relief, hillshaded. The page shows it
   until the first step of the Detail ladder arrives, so a new planet never starts as an empty sphere. Nothing of it is kept.
2. **The Detail ladder** (from ~2–3 s) — the ground at 5,000 Detail, then ×2 each step up to the Detail chosen, each
   shown in place of the last (skipped with Progressive generation off): [progressive-detail.md](progressive-detail.md).
3. **The first picture** (~8.4 s at 204,000; ~4 s before the ladder) — the present-day world's ground at the Detail
   chosen, the ladder's last step. Its surface is drawn on a pool of worker
   threads (`v2/js/terrain/terrain-pool.js`, made when the planet worker starts, on the fixed sim mesh): the same ground,
   bit for bit, as drawn on one thread (`node v2/tools/check-present-pool.mjs` checks it).
4. **The terrain** (~13 s into the finish) — the finish (`v2/js/finish/finish.js`) knows the final heights, sea, lakes,
   rivers and drain once its water stage is done, ~60 % of the way through. It hands them over then (`onTerrain`); the
   finish worker draws their picture and the rivers' valley lines for the tiles, and sends them as `terrain`. The page
   shows that world (`js/finish-landing.js`: `partial`), with Satellite, Geology and Food still locked, and export and
   Open region waiting.
5. **The finished world** (~19 s) — the climate, rocks and food. Its `done` lands on the terrain's own picture object
   and rivers, so nothing drawn from them is drawn again; with the terrain already shown, the page doesn't repaint. The
   final picture reuses the pixels' located cells from step 4 (up to 2048 px wide: ~75 MB, ~0.6 s saved).

Node bench (seed 2, 204,000): terrain at 7.7 s of a 12.8 s finish; the terrain's picture 0.5 s; the final picture 1.9 s
with the stored cells, 2.5 s without. The early heights, sea, lakes, rivers and drain equal the final ones, the picture
made from stored cells equals a fresh one, and the valley lines made off the terrain's picture equal those off the final
one.

## The page's long tasks left

- **The terrain landing**: ~90 ms for the picture, then ~60 ms a frame later for the rivers (`planet-view.js`
  paintFinished: rivers not yet traced for a moment are drawn on the next frame). It replaces one ~260 ms task, and before
  that the old ~440 ms freeze.
- **The finished world**: the zoomed tiles' first crops (~40 ms); the valley lines (~120 ms on the page before) now come
  from the worker.

## Evolution

Evolution's Add detail doesn't land early: its passes already show a picture at each step, and a partial moment would
lock its climate layers again between passes.

## Measuring

`v2/tools/input-replay/record.js` records what a person does on a page (pointer, wheel, clicks, keys) and how the page
keeps up (late frames, long tasks, texture uploads); `replay.js` plays a recording back at the same times and places.
Usage is in each file's header.

In the app's browser pane the finish's climate ran ~8.5 s against ~6 s in Node. The gap is not the page's work competing
with it. The climate alone, in a worker on an idle page, took 5.5–6.6 s against 3.0–3.5 s in Node. A plain arithmetic
loop showed the same gap: 3.4 s against 2.15 s. So the pane runs JavaScript ~1.6× slower than Node on this machine, for
any code. Only a cheaper or parallel climate would shorten it there.

A long-task log in that pane needs its tab in front: a tab behind another gets no animation frames, so it paints nothing
and logs no long tasks.
