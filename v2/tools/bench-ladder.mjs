// What Add detail's ladder of passes costs (docs/finish-ladder.md): the Finish run at each detail of the ladder in turn,
// in one process — as the page's finishing worker runs them, keeping the meshes it built — each pass timed to its
// picture, against the last pass run alone in a fresh process (run this twice: the ladder, then the last detail alone).
//
//   node --max-old-space-size=16000 v2/tools/bench-ladder.mjs --cells 160000,640000,2500000 [--seed 799224] [--cont 30] [--time 290] [--sim 40000] [--width 4096: else the page's own]
//
// Each pass prints its time and the process's peak memory so far (docs/finish-ceiling.md: how high a Detail can go).
//
// The moment's frame comes from render-moment.mjs's cache (v2/out/frames/): run that once for the moment first.

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { keepOnlyTerrainMesh } from '../js/terrain/terrain-mesh.js';
import { ladderCells } from '../js/terrain/synthesize.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 799224)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000)), TIME = Number(arg('--time', 290));
const PASSES = arg('--cells', '160000,640000,2500000').split(',').map(Number), W = Number(arg('--width', 0));
const frameFile = path.join(ROOT, 'v2', 'out', 'frames', `frame-${SEED}-${CONT}-${SIM}-${TIME}.bin`);
if (!fs.existsSync(frameFile)) throw new Error(`no cached frame ${frameFile}: run render-moment.mjs for this moment first`);
const { frame } = v8.deserialize(fs.readFileSync(frameFile));
const simMesh = buildSimMesh(SIM, 12345), last = PASSES[PASSES.length - 1];
const t0 = performance.now(), rows = [];
for (const cells of PASSES) {
    const p0 = performance.now();
    // (as the worker keeps them: this pass's meshes, and the last pass's with the coarser ones its carving climbs)
    keepOnlyTerrainMesh(cells, last, ...ladderCells(SIM, Math.max(cells, last)));
    const pool = await TerrainPool.create(simMesh);
    const fin = await finishPlanet({ frame, simMesh, seed: SEED, cells, pool, closePool: true });
    // (the page's picture widths unless --width: a coarse pass before the last at 2048, the rest at 4096, 10M at 8192)
    const width = W || (cells !== last && cells < 1e6 ? 2048 : cells >= 5e6 ? 8192 : 4096);
    const r0 = performance.now();
    finishRaster(fin.mesh, fin.z, fin.ocean, width, null, fin.lake, fin.lakeLevel, fin.climate.cell, fin.geology, fin.farming, null, fin.pond);
    fin.ms.picture = performance.now() - r0;
    const secs = (performance.now() - p0) / 1000, at = (performance.now() - t0) / 1000;
    rows.push({ cells, secs, at, mesh: (fin.ms.mesh ?? 0) / 1000 });
    // (peak memory so far: the whole process, its pool's workers included — what a Detail needs, docs/finish-ceiling.md)
    const peakGB = process.resourceUsage().maxRSS / 1048576, nowGB = process.memoryUsage().rss / 1073741824;
    console.log(`pass ${cells.toLocaleString()} cells: ${secs.toFixed(1)} s, on screen at ${at.toFixed(1)} s; memory peak ${peakGB.toFixed(2)} GB, after ${nowGB.toFixed(2)} GB; stages s:${Object.entries(fin.ms).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(' · ')}`);
}
console.log(`ladder ${PASSES.map(c => c / 1000 + 'K').join(' → ')}: ${rows.at(-1).at.toFixed(1)} s in all`);
process.exit(0);
