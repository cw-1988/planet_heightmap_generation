# The terrain pool's balance

The finish's surface is drawn by the terrain pool (`v2/js/terrain/terrain-pool.js`, 8 workers on an 8-core desktop). Its
cells are cut into chunks, dealt round-robin. Each worker keeps its own chunks' positions and samplers between frames.
The first worker builds the frame's plan and hands it to the others.

## Measured at 2.5M cells, 8 workers, before

- Plan: 0.71 s, on the first worker only. The other seven waited 0.75–0.91 s for it.
- Sampler (warp and point location): 0.48–0.60 s a worker, after the plan arrived.
- `surfaceRange`, the per-cell surface: 7.1–8.3 s a worker. With 8 chunks a worker, the workers ended 1.2 s apart.
- More workers do not help: 12 took as long as 8, and 15 were slower (9.7 · 9.7 · 11.1 s).

## Changed

- A waiting worker builds its samplers as soon as the job arrives. The samplers need only the mesh, the seed and the
  warp settings, not the plan, so they are done during the planner's 0.7 s (`terrain-worker.js` `sampleChunks`).
- Chunks are finer on a fine mesh: 8 a worker, up to 32, with at least ~10K cells each (`chunksPerWorker`). Land and sea
  even out better between the workers. A small mesh's frames, on the evolution page, keep 8 a worker and few messages.

Every cell still depends only on its position and the plan, so the heights are the same whichever worker draws them.

## Result

The surface stage at 2.5M, with the meshes built ahead as the page builds them: 10.9 → 10.7 s. The 126 hashed arrays are
the same at 2.5M and 250K (`v2/out/hash-finish.mjs`).

The rest of the stage is `surfaceRange`'s own noise arithmetic, about 60 s of CPU spread over 8 cores. Making it faster
means changing the noise code itself, with every float operation kept the same.
