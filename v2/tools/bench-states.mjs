// Times the States build (evolution/states-view.js) headless, step by step, on a finished moment with the farming picture
// at its widest (so the states' grid is at its largest, 1024 × 512).
// Usage: node v2/tools/bench-states.mjs [cells=320000] [picture width=4096]

import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { statesWork } from '../js/evolution/states-view.js';

const CELLS = +(process.argv[2] ?? 320000), W = +(process.argv[3] ?? 4096), SEED = 12345, SIM = 20000;
const mesh = labMesh(SIM), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const world = scene.build(mesh, SEED, { continentalFraction: 0.3 });
world.config.heights = terrainConfig({});
world.config.geology.records = true;
let last = null;
simulate(world, { untilMyr: 400, drive: w => scene.drive(w), snapshotEveryMyr: 10, keepFrames: false, onFrame: f => { last = f; } });
const frame = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS].map(k => [k, last[k]]));
frame.plates = last.plates.map(p => p && { quat: p.quat });
const pool = await TerrainPool.create(mesh);
const out = await finishPlanet({ frame, simMesh: mesh, seed: SEED, cells: CELLS, pool });
pool.terminate();
const pic = finishRaster(out.mesh, out.z, out.ocean, W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
const fin = { raster: pic, climate: { ...out.climate.page, raster: pic.climate }, rivers: out.rivers };
console.log(`${CELLS} cells; farming picture ${pic.farming.w} × ${pic.farming.h}`);

const t0 = performance.now();
let t = t0, was = 'start';
const r = statesWork(fin, null, (words) => {
    const now = performance.now();
    console.log(`  ${was}: ${((now - t) / 1000).toFixed(2)} s`);
    t = now; was = words;
});
console.log(`  ${was}: ${((performance.now() - t) / 1000).toFixed(2)} s (and the metrics and City grid sent back)`);
console.log(`all: ${((performance.now() - t0) / 1000).toFixed(1)} s; ${r.out.states?.length ?? '?'} states, ${r.out.caps.length} capitals`);
