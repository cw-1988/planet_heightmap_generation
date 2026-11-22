# The Detail ladder: a new planet built coarse first, then finer step by step

A new planet (Generate or Import) is shown at 5,000 Detail first. Then it is shown at twice as many cells each step
(10,000, 20,000, 40,000 … 1,280,000) while that is below the Detail chosen, and then at the Detail itself. Each step
replaces the last on screen, as if the Detail slider were slid from left to right while it builds. Asked for by the owner,
2026-11-20. Back to [shared.md](shared.md); the rest of the load: [generate-load.md](generate-load.md).

**Why ×2** (`RUNG_STEP`, the owner, 2026-11-20): ×4 the cells is ×2 the sharpness (cells per km grow as the square
root), and that jumped too far between pictures. ×2 the cells is ×1.41 the sharpness: twice the pictures, each a smaller
step. The cost: the coarse steps together cost about as much as the last one does (1/2 + 1/4 + … of it), where at ×4
they cost a third of it.

**Progressive generation** (the switch under the Detail slider on Generate and Import, on by default, remembered on
the browser as `progressiveDetail`; the owner, 2026-11-20): off, the planet is built at the chosen Detail alone
(`detailSteps(N, false)` is `[N]`). It is faster, since none of the coarse steps' ground is drawn (about as much as the
last step at ×2), but nothing is shown until it is done. Which is better depends on the moment: watching it grow, or
getting the final planet sooner. Measured in the browser pane, 2026-11-20, at 204,000 Detail on a new seed: 8.6 s to
the button freed with it off, 17.8 s with it on (6 coarse steps).

The coarse steps are bare ground; the rivers come only at the chosen Detail (the per-step water, off since 2026-11-22):
[progressive-water.md](progressive-water.md).

## How

- **Worked out once** (`js/planet-worker.js` handleGenerate): the plates, their motion, the past and the Frame, on the
  first step's mesh. None of them depends on Detail (they live on the 40,000-cell sim mesh).
- **Drawn per step** (`js/detail-ladder.js`): each step projects the pieces on its own mesh (`piecesOn`), then draws only
  the ground on it (`groundOnMesh`, as Reapply draws it), with its hillshade. It is sent to the page as a `rung`
  (`sendRung`).
- **The last step is the planet as it always was**: the same mesh, the same ground, bit for bit. The finish (climate,
  rocks, food) runs only on it.
- **The meshes are built ahead** (`js/mesh-worker.js`, asked through `js/mesh-source.js`): all steps' meshes are
  requested at once, so the next one is triangulated on its own thread while the planet worker draws the ground on the one
  before. `SphereMesh.parts()` / `fromParts()` move a mesh between threads without working anything out again. If that
  thread fails, each mesh is built on the planet worker, as before.
- **On the page** (`js/rung-view.js`, used by `js/main.js` and `js/import-main.js`): the step shown is drawn in place of
  the old world, so a Rebuild shows the new planet growing over the old one. Each step logs
  `[build] Detail X of N shown at T s (mesh …, ground …)` to the console.
- **Import** (`importGround`): the image's heights sampled and shaped on each step's mesh, shown the same way.

## Why each step is a new picture, not a refined one

Each Detail is its own Fibonacci sphere with its own jitter; its points don't include the coarser step's, so a step
replaces the last instead of refining it. The ground keeps its shape between steps (the same plates, past and Frame);
the coasts and relief sharpen. A true refine-in-place would need nested meshes (such as a subdivided icosphere) under
every finish stage, the saved files and Evolution: a change of direction.
What a step could take over, and how to bring the ladder's cost close to the option off:
[progressive-reuse.md](progressive-reuse.md).

## What it costs

Measured in the app's browser pane, 2026-11-20, with the earlier ×4 steps (not yet measured at ×2: by the sum above the
chosen Detail's picture comes about 2/3 of the last step's ground later — ~8 s more at 2,560,000 — while a new picture
comes twice as often):

| Detail | Steps shown at (s) | First picture of the chosen Detail |
|---|---|---|
| 204,000 | 5k 3.0 · 20k 3.9 · 80k 5.3 | 8.4 s (was ~4 s without the ladder) |
| 2,560,000 | 5k 1.9 · 20k 2.7 · 80k 3.7 · 320k 7.1 · 1.28M 19.0 | 35.2 s (42.3 s before the meshes were built ahead) |

The steps add their own ground on top; at 2,560,000 the 1,280,000 step (~12 s) is most of it. What a step still spends
besides its ground is projecting the pieces on its mesh (`piecesOn`), not the mesh itself. Something is on screen from
~2 s, and it sharpens every few seconds instead of standing still.
