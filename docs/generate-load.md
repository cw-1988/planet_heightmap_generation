# A new planet, from Generate to its finished layers

What the page shows between Generate (or an image imported) and the finished world, and why: a 204,000-Detail planet
used to sit as a black sphere for ~8 s, then show its first picture for another ~17 s before the detailed terrain landed
with a ~440 ms freeze. Measured 2026-11-20 on the owner's Windows laptop, Generate at 204,000 Detail. Back to
[shared.md](shared.md).

## The steps, in order

1. **The sketch** (`js/world-sketch.js`) — as soon as the plates are projected (~1 s), the planet worker sends land and
   sea: the ground rising inland and deepening offshore, with a little rolling relief, hillshaded. The page shows it
   until the present-day world arrives, so a new planet never starts as an empty sphere. Nothing of it is kept.
2. **The first picture** (~5.5 s, was ~8 s) — the present-day world's ground. Its surface is drawn on a pool of worker
   threads (`v2/js/terrain/terrain-pool.js`, made when the planet worker starts, on the fixed sim mesh): the same ground,
   bit for bit, as drawn on one thread (`node v2/tools/check-present-pool.mjs` checks it).
3. **The terrain** (~13 s into the finish) — the finish (`v2/js/finish/finish.js`) knows the final heights, sea, lakes,
   rivers and drain once its water stage is done, ~60 % of the way through. It hands them over then (`onTerrain`); the
   finish worker draws their picture and the rivers' valley lines for the tiles, and sends them as `terrain`. The page
   shows that world (`js/finish-landing.js`: `partial`), with Satellite, Geology and Food still locked, and export and
   Open region waiting.
4. **The finished world** (~19 s) — the climate, rocks and food. Its `done` lands on the terrain's own picture object
   and rivers, so nothing drawn from them is drawn again; with the terrain already shown, the page doesn't repaint. The
   final picture reuses the pixels' located cells from step 3 (up to 2048 px wide: ~75 MB, ~0.6 s saved).

Node bench (seed 2, 204,000): terrain at 7.7 s of a 12.8 s finish; the terrain's picture 0.5 s; the final picture 1.9 s
with the stored cells, 2.5 s without. The early heights, sea, lakes, rivers and drain equal the final ones, the picture
made from stored cells equals a fresh one, and the valley lines made off the terrain's picture equal those off the final
one.

## The page's long tasks left

- **The terrain landing**: ~260 ms, the picture painted (~150 ms) and the rivers drawn on it (~110 ms). It replaces the
  old ~440 ms freeze, earlier.
- **The finished world**: the zoomed tiles' first crops (~40 ms); the valley lines (~120 ms on the page before) now come
  from the worker.

## Evolution

Evolution's Add detail doesn't land early: its passes already show a picture at each step, and a partial moment would
lock its climate layers again between passes.

## Measuring

`v2/tools/input-replay/record.js` records what a person does on a page (pointer, wheel, clicks, keys) and how the page
keeps up (late frames, long tasks, texture uploads); `replay.js` plays a recording back at the same times and places.
Usage is in each file's header. In the browser the finish's climate ran ~8.5 s against ~6 s in Node; the planet worker
does nothing after it sends the first picture, so that gap isn't the page's own work competing.
