// Where Generate's build memory goes (docs/generate-memory.md): its whole build at one Detail, in one Node process — the
// planet worker's present-day world on its terrain pool (let go when the finish starts), what the page and the finish are
// sent, the finish and its picture — holding what each thread holds while the next one runs, as the browser tab does. A
// sampler on its own thread reads the process's memory every 20 ms, so each stage gets its own peak; at the stages'
// seams, the typed arrays each holder keeps are summed.
//
//   OROGEN_SHARED=1 node --max-old-space-size=24000 v2/tools/bench-generate-memory.mjs --cells 2560000 [--seed 2] [--width 0: the page's]
//     [--dump-deposits file: the deposits' inputs written there, for v2/tools/bench-deposits.mjs]
//
// OROGEN_SHARED=1: memory shared, as the isolated page has it (core/shared-memory.js) — the one mesh read by all; without
// it, each thread's copy, as with ?isolate=0.
//
// Not the browser: no page heap, GPU buffers or renderer; Node's RSS counts the pool's worker threads, as the tab's
// process does. The stages' shares are the point, not the total.

import { Worker } from 'node:worker_threads';
import Delaunator from 'delaunator';
import { setDelaunator, buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { generateCoarsePlates } from '../../js/coarse-plates.js';
import { applyPlatePhysics } from '../../js/plate-physics.js';
import { piecesOn, regionsOf, regionLandOf } from '../../js/detail-ladder.js';
import { buildPresentPlates } from '../js/present/plates.js';
import { presentLayout } from '../js/present/layout.js';
import { presentWorld, presentTerrainMesh, presentTerrainOverrides } from '../js/present/world.js';
import { finishFrame, storyFrame } from '../js/present/layers.js';
import { finishConfigOf, finishOverrides } from '../js/present/knobs.js';
import { hillshade } from '../js/view/terrain-shade.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { FINISH } from '../js/finish/finish-config.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { meshFromArrays } from '../js/core/sim-mesh.js';
import { driverWidth } from '../js/finish/finish-drivers.js';
import fs from 'node:fs';
import v8 from 'node:v8';

setDelaunator(Delaunator);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--cells', 2560000)), SEED = Number(arg('--seed', 2));
const WIDTH = Number(arg('--width', 0)) || Math.min(8192, Math.max(2048, 2 ** Math.round(Math.log2(4 * Math.sqrt(N)))));   // (js/main.js finishWidth)
const GB = b => (b / 1073741824).toFixed(2), MB = b => Math.round(b / 1048576);

// ── the sampler: its own thread, the process's memory every 20 ms, the peak kept per stage ──
const STAGES = [], shared = new SharedArrayBuffer(8 + 8 * 2 * 64), stageNow = new Int32Array(shared, 0, 1), peaks = new Float64Array(shared, 8, 2 * 64);
const sampler = new Worker(`
    const { workerData } = require('node:worker_threads');
    const stage = new Int32Array(workerData, 0, 1), peaks = new Float64Array(workerData, 8, 128);
    setInterval(() => { const m = process.memoryUsage(), s = Atomics.load(stage, 0);
        if (m.rss > peaks[2 * s]) peaks[2 * s] = m.rss; if (m.arrayBuffers > peaks[2 * s + 1]) peaks[2 * s + 1] = m.arrayBuffers; }, 20);`,
    { eval: true, workerData: shared });
sampler.unref();
const stage = name => { STAGES.push(name); Atomics.store(stageNow, 0, STAGES.length - 1); };
const tick = () => new Promise(r => setTimeout(r, 60));   // (a sample after each synchronous stage)

// ── what each holder keeps: the typed arrays reachable from it, each buffer counted once over all holders ──
const seen = new Set();
function bytesOf(root, depth = 0, own = new Set()) {
    if (!root || typeof root !== 'object' || depth > 8 || own.has(root)) return 0;
    own.add(root);
    if (ArrayBuffer.isView(root)) { if (seen.has(root.buffer)) return 0; seen.add(root.buffer); return root.buffer.byteLength; }
    if (root instanceof ArrayBuffer || root instanceof SharedArrayBuffer) { if (seen.has(root)) return 0; seen.add(root); return root.byteLength; }
    let s = 0;
    const vals = root instanceof Map ? [...root.keys(), ...root.values()] : root instanceof Set ? [...root] : Array.isArray(root) ? root : Object.values(root);
    for (const v of vals) s += bytesOf(v, depth + 1, own);
    return s;
}
/** A holder's own fields, largest first (each buffer counted where first met). */
function inventory(title, holders) {
    seen.clear();
    console.log(`\n── held ${title} (process ${GB(process.memoryUsage().rss)} GB, array buffers ${GB(process.memoryUsage().arrayBuffers)} GB)`);
    for (const [name, obj] of Object.entries(holders)) {
        const parts = Object.entries(obj).map(([k, v]) => [k, bytesOf(v)]).filter(([, b]) => b > 4 << 20).sort((a, b) => b[1] - a[1]);
        const total = parts.reduce((s, [, b]) => s + b, 0);
        console.log(`  ${name}: ${MB(total)} MB — ${parts.slice(0, 14).map(([k, b]) => `${k} ${MB(b)}`).join(', ')}`);
    }
}

// ── the planet worker (js/planet-worker.js handleGenerate, Progressive generation off: the Detail alone) ──
const t0 = performance.now();
const P = 80, knobs = { nMag: 0.4, terrainWarp: 0.75, smoothing: 0.1, hydraulicErosion: 0.5, thermalErosion: 0.1, ridgeSharpening: 0.5, glacialErosion: 0.5 };
stage('pool + plates');
const pool = await TerrainPool.create(await import('../js/present/layout.js').then(m => m.presentSimMesh()));
const g = generateCoarsePlates(SEED, P, 4, 0.35, 0.3), coarse = { coarseMesh: g.coarseMesh, coarse_xyz: g.coarse_xyz, coarse_r_plate: g.coarse_r_plate, coarsePlateSeeds: g.coarsePlateSeeds };
stage('mesh');
const built = buildSphere(N, 0.75, makeRng(SEED));
await tick();
stage('pieces on mesh');
const { mesh, r_xyz, r_plate } = piecesOn(N, built, SEED, coarse, P);
const plateIsOcean = new Set(g.coarsePlateIsOcean), pieceVec = JSON.parse(JSON.stringify(g.coarsePlateVec));
applyPlatePhysics(pieceVec, g.coarsePlateSeeds, plateIsOcean, g.coarse_r_plate, g.coarseMesh, g.coarse_xyz, SEED);
const L = presentLayout({ seed: SEED, P, coarse: g, pieceOcean: plateIsOcean, pieceVec }), plates = buildPresentPlates(L);
const { regionCell, regionPlate } = regionsOf(L, plates, mesh, r_xyz, r_plate);
const present = { L, P: plates, regionCell, regionPlate, r_plate, base: { P: plates, pieceLand: Uint8Array.from(L.pieceIds, id => (plateIsOcean.has(id) ? 0 : 1)) } };
await tick();
stage('present world (ground)');
pool.keepOnly(presentTerrainMesh(mesh, r_xyz));
const pieceLand = Uint8Array.from(L.pieceIds, id => (plateIsOcean.has(id) ? 0 : 1));
present.world = await presentWorld(present, pieceLand, mesh, r_xyz, { seed: SEED, knobs, regionLand: regionLandOf(r_plate, plateIsOcean), regionCell, regionPlate, finish: finishConfigOf(knobs), unedited: present.base, pool });
for (const k of ['drainage', 'receivers', 'order', 'lava', 'young', 'cut']) delete present.world[k];   // (planet-worker.js unread)
if (!present.world.shade) present.world.shade = hillshade(presentTerrainMesh(mesh, r_xyz), present.world.heightKm);
await tick();
const planetWorker = { mesh, r_xyz, r_plate, tMesh: presentTerrainMesh(mesh, r_xyz), ...present.world, L: present.L, plates: present.P, regionCell, regionPlate };

// ── what the page is sent (sharedPayload: copies) and keeps; the surface for the finish (sendSurface: copies) ──
stage('payload to page');
const tm = presentTerrainMesh(mesh, r_xyz), w = present.world, sim = L.sim;
const ff = finishFrame(w.frame, w.belts.record);
const own = a => (a.buffer instanceof SharedArrayBuffer ? a : a.slice());   // (planet-worker.js copyOrShare: a shared mesh not copied)
const page = {
    meshArrays: { numCells: tm.numCells, xyz: own(tm.xyz), adjOffset: own(tm.adjOffset), adjList: own(tm.adjList) },
    heightKm: w.heightKm.slice(), shade: w.shade.slice(), story: storyFrame(ff), regionCell: regionCell.slice(),
    finishJob: { frame: Object.fromEntries(Object.entries(ff).map(([k, v]) => [k, ArrayBuffer.isView(v) ? v.slice() : v])),
        simMesh: { numCells: sim.numCells, xyz: sim.xyz.slice(), adjOffset: sim.adjOffset.slice(), adjList: sim.adjList.slice() } },
};
// (sendSurface: the heights a copy, the rest handed over — the planet worker keeps none of it — and the terrain pool let go)
const s = w.surface;
const surface = { heightKm: s.heightKm.slice(), recCell: s.recCell, cues: s.cues, carveIn: s.carveIn };
s.carveIn = s.recCell = s.cues = null;
await tick();
inventory(`before the finish (${(performance.now() - t0) / 1000 | 0} s)`, { planetWorker, page, 'surface (to the finish)': { surface } });
const before = process.memoryUsage().rss;
pool.terminate();
await new Promise(r => setTimeout(r, 1500));
console.log(`  the terrain pool, let go, held ${GB(before - process.memoryUsage().rss)} GB (process ${GB(before)} → ${GB(process.memoryUsage().rss)} GB)`);

// ── the finish worker (v2/js/finish/finish-worker.js on Generate's own mesh and surface), then its picture ──
// (the page's mesh arrays are posted, not transferred — the worker's own copies, or the one shared mesh; the page keeps meshArrays)
const pm = page.meshArrays, job = { mesh: { numCells: pm.numCells, xyz: own(pm.xyz), adjOffset: own(pm.adjOffset), adjList: own(pm.adjList) } };
const fMesh = meshFromArrays(job.mesh), fSim = meshFromArrays(page.finishJob.simMesh);
let terrainAt = null;
const out = await finishPlanet({ frame: page.finishJob.frame, simMesh: fSim, seed: SEED, cells: fMesh.numCells, pool: null, driversWidth: driverWidth(WIDTH),
    mesh: fMesh, surface: () => surface, cfg: terrainConfig(presentTerrainOverrides({ knobs })), F: { ...FINISH, ...finishOverrides(knobs) },
    onStage: st => stage(`finish: ${st}`),
    inspect: arg('--dump-deposits', null) && ((what, o) => {
        if (what !== 'deposits') return;
        const m = o.mesh, sm = o.simMesh;
        fs.writeFileSync(arg('--dump-deposits'), v8.serialize({ ...o, mesh: { numCells: m.numCells, xyz: m.xyz, adjOffset: m.adjOffset, adjList: m.adjList, edgeKm: m.edgeKm },
            simMesh: { numCells: sm.numCells, xyz: sm.xyz, adjOffset: sm.adjOffset, adjList: sm.adjList }, on: { gridStep: o.on.grid.step, lat: o.on.lat, lon: o.on.lon } }));
    }),
    onTerrain: async t => {   // (earlyTerrain: the terrain's own picture, as the page asks for it)
        stage('finish: terrain picture');
        terrainAt = finishRaster(t.mesh, t.z, t.ocean, WIDTH, null, t.lake, t.lakeLevel, null, null, null, null, t.pond);
        return false;
    } });
inventory('after the finish', { planetWorker, page, finish: out, terrainPicture: { terrainAt } });
stage('finish: picture');
const raster = finishRaster(out.mesh, out.z, out.ocean, WIDTH, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming, null, out.pond);
await tick();
inventory('after the picture', { planetWorker, page, finish: out, picture: { raster } });
stage('done');
await tick();

console.log(`\n── peak per stage, ${N.toLocaleString()} cells, picture ${WIDTH} px, ${((performance.now() - t0) / 1000).toFixed(0)} s (process RSS · array buffers)`);
let prev = 0;
STAGES.forEach((name, i) => {
    const rss = peaks[2 * i], ab = peaks[2 * i + 1];
    if (!rss) return;
    console.log(`  ${name.padEnd(28)} ${GB(rss).padStart(6)} GB · ${GB(ab).padStart(6)} GB${rss > prev ? '' : ''}`);
    prev = Math.max(prev, rss);
});
console.log(`  max RSS ${GB(process.resourceUsage().maxRSS * 1024)} GB · finish ms: ${Object.entries(out.ms).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(' · ')}`);
process.exit(0);
