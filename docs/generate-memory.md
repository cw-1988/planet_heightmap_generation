# Where Generate's build memory goes

Generate's Detail ladder cost about 0.9 GB per million cells ([detail-stops.md](detail-stops.md)). Evolution's finish
costs 0.33 GB. This page asks why: is the gap a cost of Generate's build, or memory held twice? The answer, and the
three changes it led to, are below; the tables up to them are from before. Measured 2026-11-24 with
`v2/tools/bench-generate-memory.mjs`, seed 2, the default knobs:

```
OROGEN_SHARED=1 node --max-old-space-size=28000 v2/tools/bench-generate-memory.mjs --cells 10000000
```

The tool runs the whole build in one Node process:

- the planet worker's present-day world, drawn on its terrain pool;
- the copies the page and the finish are sent;
- the finish, run on Generate's own mesh and surface;
- the 8192 px picture.

Each holder keeps what it holds in the browser while the next one runs. A sampler thread reads the process's RSS every
20 ms and keeps the peak per stage. At the stages' seams, the tool sums the typed arrays each holder keeps. Node has no
page heap, GPU buffers or renderer, so its total runs under the browser's +10.2 GB. The shares are the point.

## Peak per stage (process RSS, GB)

| Stage | 2.5M | 10M |
|---|---|---|
| planet worker: present world (ground) | 1.81 | 4.58 |
| copies to the page and the finish | 1.93 | 5.10 |
| finish: rivers | 2.62 | 6.89 |
| finish: final climate | 3.53 | 7.79 |
| finish: farming (the peak) | 3.44 | 8.35 |
| finish: picture | 4.01 | 7.95 |
| **max** | **4.0** | **8.3** |

Node's slope is 0.58 GB per million cells. The browser's other ~0.3 is the page's globe and pictures.

## What is held at the finish's end (10M)

| Holder | MB | Largest parts |
|---|---|---|
| the planet worker's world | 1,303 | surface 563, mesh 267, terrain mesh 153, r_xyz 114, mask 76 |
| the planet worker's terrain pool (workers' heaps, meshes kept on them) | ~1,020 | measured by terminating it at the end; 650 at 2.5M |
| the page's copies | 502 | mesh arrays 381, heightKm, shade, regionCell 38 each |
| the finish | 1,378 | mesh 420, climate 368, drainage 172, farming 162, geology 102 |
| the finish's surface (a copy of the planet worker's) | 563 | its z and carving inputs |
| pictures | 760 | final 536, terrain-only 224 |

**The finish itself costs what Evolution's does.** Its own ~1.9 GB plus its pictures is in line with Evolution's
finish. Generate's extra comes from what stays alive beside the finish. The planet worker and its pool sit idle through
the whole finish, holding ~2.3 GB. Three threads each hold the same mesh: the planet worker, the page and the finish,
~1.3 GB together.

## What came off (2026-11-24)

The three changes this page proposed are in. Estimated first, at 10M: the pool ~1.0 GB, the surface ~0.56, the shared
mesh ~0.7; together ~2.3 GB.

- **The terrain pool is let go while a finish runs.** js/planet-worker.js `sendSurface` terminates it (`dropPool`) as it
  hands the surface over. The next thing that draws ground (a Rebuild, a brush, a Detail change, a second finish's
  surface) starts it again (`poolFor`) and sends it the meshes it needs. A pool still starting when it is let go is
  terminated once it has started.
- **The surface is handed over, not copied.** The planet worker sends the finish its surface's receivers, cues and
  carving inputs as transfers, and keeps only a copy of the heights. A second finish on the same world (a FINISHED
  slider, a Reapply) has the rest drawn again first (`surfaceRest`, `presentSurfaceRest` in v2/js/present/world.js), on
  a pool started again: bit for bit the first one's (`node v2/tools/check-present-pool.mjs`).
- **One mesh, shared.** With isolation on (the default, [shared-memory.md](shared-memory.md)), `presentTerrainMesh`
  builds the terrain mesh's positions and neighbour lists in `SharedArrayBuffer`s. The page and the finish are sent that
  same mesh; a plain one is still copied and transferred (`copyOrShare` in js/planet-worker.js). Nothing writes into it.

### Measured again (Node, `OROGEN_SHARED=1`)

| | 2.5M | 10M |
|---|---|---|
| max RSS before | 4.01 GB | 8.3 GB |
| max RSS after | 2.87 GB | 5.94 GB |
| saved | 1.14 GB | 2.35 GB |
| the pool, when let go | 0.58 GB | 1.03 GB |
| the page's copies | 130 → ~36 MB | 502 → 120 MB |
| the surface the planet worker keeps | 141 → 10 MB | 563 → 38 MB |
| the finish's own mesh | 105 → 10 MB | 420 → 38 MB |

The saving is about 0.72 + 0.163·M GB, so Node's build now costs about 0.42 GB per million cells, and the 10M peak is
still the finish's farming stage. In the browser the 10M peak fell from +10.2 to +7.4 GB, and the largest process from
11.4 to 7.5 GB ([detail-stops.md](detail-stops.md)); `PEAK_GB` in js/detail-stops.js is now 1.2 + 0.65·M for
Generate and Import (7.7 GB at 10M). With `?isolate=0` the mesh copies come back (~0.7 GB more at 10M); the pool and the surface
savings stay (2.5M without sharing: 3.03 GB, against 2.87 shared and 4.01 before).

### What it costs

- A second finish on the same world waits for the surface to be drawn again on a pool started again: about 1 s at
  180K in the browser, more at high Detail, against a finish of tens of seconds.
- The next ground after a finish waits for the pool to start (its workers load in well under a second) and to be sent
  its meshes again.
- With isolation on, the shared mesh stays as long as the world. It did before too, as three copies.

The rest is the finish's own working state, which Evolution pays too, plus Generate's page world, which it needs to show
and edit the planet. Generate stays above Evolution's 0.33 GB per million cells.
