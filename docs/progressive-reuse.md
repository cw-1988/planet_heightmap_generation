# Progressive generation closer to its off time (an idea, 2026-11-22)

The owner asked whether the Detail ladder's finer steps could build on the coarser ones, like a progressive JPEG, so
that Progressive generation costs about what it costs off (8.6 s off, 17.8 s on at 204,000 Detail:
[progressive-detail.md](progressive-detail.md)). Not built yet.

## Why a step can't take over the one before it

A progressive JPEG only adds: each scan's coefficients stay, and the next scan adds finer ones. The ground has three
parts, and only one of them could work that way:

- **The mesh**: each Detail is its own Fibonacci sphere with its own jitter, so no step's points are in the next. This
  could be changed: pick the coarse steps as evenly spread subsets of the final points. The final mesh would stay as it
  is.
- **The surface** (`surfaceRange`, `v2/js/terrain/synthesize.js`): a point's height comes from its position, but each
  wave is faded by the mesh's spacing (`fade1`/`fade2` by `edgeKm`), so the same point has another height at another
  Detail. With nested points, only the coarse waves could be kept and the fine ones added. That saves little, because
  the surface already runs on every core (`TerrainPool`).
- **The carving** (`carveTerrain` in `groundFrom`, `v2/js/present/world.js`): the rivers' erosion over the whole mesh,
  on the planet worker's single thread. It depends on every cell's neighbours, so a coarse result can't be kept. It
  could seed the fine run (start from the coarse ground, carve for less time), but then the final planet would differ
  from a build with the option off, and the last step would no longer be bit for bit the same.

So reuse saves only a small part, and the expensive part can't be reused without changing the final planet.

## What would get close

The final step always costs what the off build costs. The extra time is the coarse steps run **before** it. Two
ways to cut that:

1. **Fewer coarse steps**: stop the ladder at N/8 and then build N. The coarse steps add about 1/4 of the final step's
   time instead of 1/1 (+25 %, not +100 %). The last jump is ×8 in cells (×2.8 in sharpness). One line in
   `detailRungs`.
2. **The coarse steps beside the final step, not before it**: start the final build at once and draw the coarse steps
   on a second worker. The screen fills from about 2 s as now, and the final planet comes close to the off time. The
   cost is CPU contention: the surface already uses every core, so this works best while the final step carves on its
   one thread. This needs measuring before it is built. It also needs a rule that a coarse step arriving after the
   final one is dropped.

Neither changes the final planet.
