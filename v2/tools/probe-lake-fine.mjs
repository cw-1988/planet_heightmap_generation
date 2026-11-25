// The lakes up close (docs/lake-origins.md): a moment finished at full detail, then windows opened on its lakes at each
// zoom the page reaches, with and without the fine detail (fine-detail.js) — how much of each lake's water the close-up
// keeps, by the lake's level. The check that zooming in does not drain the lowland's shallow lakes and leave the tarns.
//
//   node --max-old-space-size=16000 v2/tools/probe-lake-fine.mjs [--cells 2500000] [--levels 6,8,9] [--sites 60] [--seed 799224]
//
// The moment's frame comes from render-moment.mjs's cache (v2/out/frames/), as probe-lakes.mjs's.

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { detailSource, cropSource, fineWindow } from '../js/finish/fine-detail.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 799224)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000)), TIME = Number(arg('--time', 290));
const CELLS = Number(arg('--cells', 2500000)), LEVELS = arg('--levels', '6,8,9').split(',').map(Number), SITES = Number(arg('--sites', 60));
const RASTER_W = 8192, WIN = 256, BANDS = [0.5, 1.5, 3, Infinity];
const frameFile = path.join(ROOT, 'v2', 'out', 'frames', `frame-${SEED}-${CONT}-${SIM}-${TIME}.bin`);
if (!fs.existsSync(frameFile)) throw new Error(`no cached frame ${frameFile}: run render-moment.mjs for this moment first`);
const { frame } = v8.deserialize(fs.readFileSync(frameFile));
const simMesh = buildSimMesh(SIM, 12345), pool = await TerrainPool.create(simMesh);
const out = await finishPlanet({ frame, simMesh, seed: SEED, cells: CELLS, pool, closePool: true, driversWidth: 2048 });
const raster = finishRaster(out.mesh, out.z, out.ocean, RASTER_W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology);
raster.drivers = out.drivers;
const fin = { cells: CELLS, raster, rivers: out.rivers, climate: { ...out.climate.page, raster: raster.climate }, stats: out.stats };
const src = detailSource(fin, SEED), bare = { ...src, d: null };

// ── the sites: lake pixels of the picture, spread evenly over its lakes' pixels ──
const lakePx = [];
for (let i = 0; i < raster.water.length; i++) if (raster.water[i]) lakePx.push(i);
const sites = Array.from({ length: Math.min(SITES, lakePx.length) }, (_, k) => lakePx[Math.floor((k + 0.5) * lakePx.length / SITES)]);
console.log(`${CELLS.toLocaleString('en-US')} cells; ${lakePx.length.toLocaleString('en-US')} lake pixels of ${RASTER_W}; ${sites.length} sites`);
for (const L of LEVELS) {
    const W = 256 * 2 ** L, HE = W >> 1, k = W / RASTER_W, kept = BANDS.map(() => [0, 0]);
    for (const s of sites) {
        const px = s % RASTER_W, py = Math.floor(s / RASTER_W), level = raster.waterLevel[s] / 1000;
        const x0 = ((Math.round((px + 0.5) * k - WIN / 2) % W) + W) % W, y0 = Math.max(0, Math.min(HE - WIN, Math.round((py + 0.5) * k - WIN / 2)));
        const win = { W, x0, y0, w: WIN, h: WIN }, count = f => { let n = 0; for (const v of f.wat) if (v) n++; return n; };
        const b = BANDS.findIndex(x => level < x);
        kept[b][0] += count(fineWindow(cropSource(bare, win), win));
        kept[b][1] += count(fineWindow(cropSource(src, win), win));
    }
    console.log(`L${L} (${(40030 / W).toFixed(2)} km/px) lake pixels without → with fine detail, by level <0.5 / 0.5–1.5 / 1.5–3 / >3 km: ` +
        kept.map(([a, d]) => `${a} → ${d}${a ? ` (${Math.round(100 * d / a)} %)` : ''}`).join(' / '));
}
