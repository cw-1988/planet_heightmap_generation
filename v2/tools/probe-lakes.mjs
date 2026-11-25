// The lakes at each detail (docs/lake-origins.md): the finish run to its terrain (its rivers and lakes) at each of several
// cell counts for one cached moment, and per detail the lakes' share of the land, their fates, origins and heights — the
// check that the lakes a world gets do not hang on its detail.
//
//   node --max-old-space-size=16000 v2/tools/probe-lakes.mjs --cells 160000,640000,2500000 [--seed 799224] [--cont 30] [--time 290] [--sim 40000] [--lakes 0] [--dam 0]
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
import { finishPlanet } from '../js/finish/finish.js';
import { FINISH } from '../js/finish/finish-config.js';
import { lakeOverrides } from '../js/finish/lake-amount.js';
import { Water } from '../js/finish/finish-hydro.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 799224)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000)), TIME = Number(arg('--time', 290));
const PASSES = arg('--cells', '160000,640000,2500000').split(',').map(Number), F = { ...FINISH, ...lakeOverrides(Number(arg('--lakes', 0))) };
if (arg('--dam', null) !== null) F.damRatio = Number(arg('--dam'));   // (--dam 0: no blocked valleys, as before them)
const frameFile = path.join(ROOT, 'v2', 'out', 'frames', `frame-${SEED}-${CONT}-${SIM}-${TIME}.bin`);
if (!fs.existsSync(frameFile)) throw new Error(`no cached frame ${frameFile}: run render-moment.mjs for this moment first`);
const { frame } = v8.deserialize(fs.readFileSync(frameFile));
const simMesh = buildSimMesh(SIM, 12345);
const BANDS = [0.5, 1.5, 3, Infinity];                               // (the lakes' levels, km: lowland … high mountains)
for (const cells of PASSES) {
    const t0 = performance.now(), pool = await TerrainPool.create(simMesh);
    let got = null;
    const fin = await finishPlanet({ frame, simMesh, seed: SEED, cells, pool, closePool: true, F, onTerrain: (d) => { got = d; return true; } });
    const { lake, lakeLevel, ocean } = got, n = lake.length, cellKm2 = 510.1e6 / n;
    let land = 0;
    const fresh = BANDS.map(() => 0);
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        land++;
        if (lake[c] === Water.FRESH) fresh[BANDS.findIndex(b => lakeLevel[c] < b)]++;
    }
    const w = fin.stats.water, tot = fresh.reduce((a, b) => a + b, 0);
    console.log(`\n── ${cells.toLocaleString('en-US')} cells (${((performance.now() - t0) / 1000).toFixed(0)} s) ──`);
    console.log(`fresh lakes ${w.freshLakes}, salt ${w.saltLakes}, pans ${w.pans}; fresh water ${(100 * tot / land).toFixed(2)} % of land, ${Math.round(tot * cellKm2).toLocaleString('en-US')} km²`);
    console.log(`fresh by level (km) <0.5 / 0.5–1.5 / 1.5–3 / >3: ${fresh.map(f => (100 * f / Math.max(1, tot)).toFixed(0) + ' %').join(' / ')}`);
    console.log(`by origin: ${JSON.stringify(w.byOriginShare)}`);
    console.log(`fates (count, km²): ${JSON.stringify(w.fates.all)}`);
}
