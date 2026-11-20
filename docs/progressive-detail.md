# Idea: a new planet growing finer as it builds (a maybe)

The owner asked, 2026-11-20, why a new planet can't start very coarse and grow more detailed, as if the Detail slider
were slid from left to right while it builds. This is an idea, not a plan. Back to [shared.md](shared.md); the load as it
is: [generate-load.md](generate-load.md).

## What already happens

Generate already climbs in coarse-to-fine steps:

1. the sketch (~1 s);
2. the present-day world on the fixed 40,000-cell sim mesh (~5 s);
3. the terrain at the chosen Detail (~14 s);
4. the climate, rocks and food on it (~19 s).

Evolution's Add detail climbs too: a pass at each smaller Detail on its list whose cost is at most half the next one's
(`evolution-main.js` finishPasses).

## Why it isn't a smooth slide

- **Each Detail is a different mesh.** Each level is its own Fibonacci sphere with its own jitter. Its points don't
  include the coarser level's points, so a finer level can't refine a coarser one: it replaces it. Each level redoes
  the ground, carving, rivers and picture from the start.
- **The rivers re-route on each mesh.** Flow follows the cells, so courses and lakes shift between levels. The picture
  would jump, not sharpen.
- **The slow part doesn't scale with Detail.** The climate alone took 3.3 s at 12,000 points and 3.0–3.5 s at 204,000
  (Node, 2026-11-20). In the browser pane it is ~5.5 s. Add detail's cost model is 13.5 s fixed plus 15.6 s per million
  cells. So a coarse level saves little on the climate. It has to run once, on the final mesh.

## What it could be

- **A terrain-only rung between 40,000 and the final Detail.** For 204,000 that would be ~50,000 cells, with ground,
  carve, rivers and picture but no climate. That gives a sharper picture some seconds before step 3. It costs that rung's
  time on top, and its rivers jump when the final level lands.
- **Nested meshes**, such as a subdivided icosphere, where each level keeps the last level's points. Only these would
  allow a true refine-in-place. That means changing the mesh under every finish stage, the saved files and Evolution:
  a change of direction.
