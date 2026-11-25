// Times the City size view (evolution/city-view.js) headless: its people grid, its sum within the reach by cart, its haul
// by water, and painting a texture with it — at several reaches, on the Evolution page's last moment.
// Usage: node v2/tools/bench-city.mjs [cells=320000] [texture width=4096]

import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { farmOptions, peopleGrid } from '../js/evolution/farming-view.js';
import { cityGrid, cityColorAt, cityLine } from '../js/evolution/city-view.js';
import { waterHaul } from '../js/evolution/city-haul.js';

const CELLS = +(process.argv[2] ?? 320000), TEX = +(process.argv[3] ?? 4096), SEED = 12345, SIM = 20000;
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
const pic = finishRaster(out.mesh, out.z, out.ocean, 4096, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
const fin = { raster: pic, climate: { ...out.climate.page, raster: pic.climate }, rivers: out.rivers };
console.log(`${CELLS} cells; farming picture ${pic.farming.w} × ${pic.farming.h}; texture ${TEX} × ${TEX >> 1}`);

const time = (label, f) => { const t = performance.now(), r = f(); console.log(`  ${label}: ${(performance.now() - t).toFixed(0)} ms`); return r; };
time('people grid (once per moment and options)', () => peopleGrid(fin));
for (const reach of [0.5, 1, 3, 6, 12]) {
    farmOptions.reach = reach;
    console.log(`reach ${reach} days`);
    const G = time('city grid, all of it', () => cityGrid(fin));
    console.log(`    (grid ${G.w} × ${G.h})`);
    time('  of which the haul by water', () => waterHaul(fin, { w: G.w, h: G.h, mass: new Float64Array(G.w * G.h).fill(1) }, reach * 25));
    const at = cityColorAt(fin, TEX), c = [0, 0, 0];
    time('paint the texture\'s pixels', () => { for (let y = 0; y < TEX >> 1; y++) for (let x = 0; x < TEX; x++) at(x, y, c); });
    time('1000 hover readouts', () => { for (let k = 0; k < 1000; k++) cityLine(fin, (k * 0.618) % 1, (k * 0.382) % 1); });
}
