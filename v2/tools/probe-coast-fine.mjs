// The coast up close (docs/coast-processes.md): a moment finished at full detail, then windows opened on its coasts at
// each zoom the page reaches — with the fine detail and without it (the picture's own coast) — and, for each of the
// coast's own modules turned off in turn, how far the close-up's coast strays from the picture's: land lost to the sea
// (rivers left drawn out at sea), sea turned to land, and how many separate bodies of land and sea a window holds (a
// barrier island and its lagoon add one of each).
//
//   node --max-old-space-size=16000 v2/tools/probe-coast-fine.mjs [--cells 2500000] [--levels 9,11,13] [--sites 40] [--seed 799224]
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
import { DRIFT } from '../js/finish/coast-drift.js';
import { HISTORY } from '../js/finish/coast-history.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 799224)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000)), TIME = Number(arg('--time', 290));
const CELLS = Number(arg('--cells', 2500000)), LEVELS = arg('--levels', '9,11,13').split(',').map(Number), SITES = Number(arg('--sites', 40));
const RASTER_W = 8192, WIN = 256;
const frameFile = path.join(ROOT, 'v2', 'out', 'frames', `frame-${SEED}-${CONT}-${SIM}-${TIME}.bin`);
if (!fs.existsSync(frameFile)) throw new Error(`no cached frame ${frameFile}: run render-moment.mjs for this moment first`);
const { frame } = v8.deserialize(fs.readFileSync(frameFile));
const simMesh = buildSimMesh(SIM, 12345), pool = await TerrainPool.create(simMesh);
const out = await finishPlanet({ frame, simMesh, seed: SEED, cells: CELLS, pool, closePool: true, driversWidth: 2048 });
const raster = finishRaster(out.mesh, out.z, out.ocean, RASTER_W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology);
raster.drivers = out.drivers;
const fin = { cells: CELLS, raster, rivers: out.rivers, climate: { ...out.climate.page, raster: raster.climate }, stats: out.stats };
const src = detailSource(fin, SEED), bare = { ...src, d: null };

// ── the sites: the picture's coast pixels (sea beside land), spread evenly over them ──
const coast = [], O = raster.ocean, H = RASTER_W >> 1;
for (let y = 1; y < H - 1; y++) for (let x = 0; x < RASTER_W; x++) {
    const i = y * RASTER_W + x;
    if (O[i] && (!O[i - 1] || !O[i + 1] || !O[i - RASTER_W] || !O[i + RASTER_W])) coast.push(i);
}
const sites = Array.from({ length: Math.min(SITES, coast.length) }, (_, k) => coast[Math.floor((k + 0.5) * coast.length / SITES)]);
console.log(`${CELLS.toLocaleString('en-US')} cells; ${coast.length.toLocaleString('en-US')} coast pixels of ${RASTER_W}; ${sites.length} sites`);

/** How many 4-connected bodies of value v a window's mask holds (of at least 4 pixels). */
function bodies(m, v) {
    const seen = new Uint8Array(m.length), st = [];
    let n = 0;
    for (let s = 0; s < m.length; s++) {
        if (seen[s] || m[s] !== v) continue;
        let size = 0; st.push(s); seen[s] = 1;
        while (st.length) {
            const p = st.pop(), x = p % WIN; size++;
            for (const q of [x > 0 ? p - 1 : -1, x < WIN - 1 ? p + 1 : -1, p - WIN, p + WIN]) if (q >= 0 && q < m.length && !seen[q] && m[q] === v) { seen[q] = 1; st.push(q); }
        }
        if (size >= 4) n++;
    }
    return n;
}

// (each case: a setting turned off, or the source it reads)
const noLit = { ...src, d: { ...src.d, wave: null } }, noRiv = { ...src, rvAll: null, rv: null };
const CASES = [
    ['all', () => {}, src],
    ['no drift', () => { DRIFT.maxPxKm = -1; }, src],
    ['no history', () => { HISTORY.riaDepthKm = 0; HISTORY.levels = 0; }, src],
    ['no littoral', () => {}, noLit],
    ['no rivers', () => {}, noRiv],
];
const keep = { maxPxKm: DRIFT.maxPxKm, riaDepthKm: HISTORY.riaDepthKm, levels: HISTORY.levels };
for (const L of LEVELS) {
    const W = 256 * 2 ** L, HE = W >> 1, k = W / RASTER_W;
    const wins = sites.map(s => {
        const px = s % RASTER_W, py = Math.floor(s / RASTER_W);
        const x0 = ((Math.round((px + 0.5) * k - WIN / 2) % W) + W) % W, y0 = Math.max(0, Math.min(HE - WIN, Math.round((py + 0.5) * k - WIN / 2)));
        const win = { W, x0, y0, w: WIN, h: WIN };
        const b = fineWindow(cropSource(bare, win), win);
        return { win, sea0: b.sea, h0: b.h };
    });
    // (the picture's own heights, smoothed between its pixels: how much of its land already lies below the sea)
    let under = 0, landN = 0;
    for (const { sea0, h0 } of wins) for (let p = 0; p < sea0.length; p++) if (!sea0[p]) { landN++; if (h0[p] < 0) under++; }
    console.log(`L${L} the picture's land below 0 m between its pixels: ${(100 * under / landN).toFixed(1)} %`);
    for (const [name, set, from] of CASES) {
        Object.assign(DRIFT, { maxPxKm: keep.maxPxKm }); Object.assign(HISTORY, { riaDepthKm: keep.riaDepthKm, levels: keep.levels }); set();
        let lost = 0, gained = 0, land0 = 0, sea0n = 0, dLand = 0, dSea = 0;
        for (const { win, sea0 } of wins) {
            const f = fineWindow(cropSource(from, win), win);
            for (let p = 0; p < sea0.length; p++) {
                if (sea0[p]) { sea0n++; if (!f.sea[p]) gained++; } else { land0++; if (f.sea[p]) lost++; }
            }
            dLand += bodies(f.sea, 0) - bodies(sea0, 0); dSea += bodies(f.sea, 1) - bodies(sea0, 1);
        }
        console.log(`L${L} (${(40030 / W).toFixed(3)} km/px) ${name.padEnd(10)} land → sea ${(100 * lost / land0).toFixed(1)} %, sea → land ${(100 * gained / sea0n).toFixed(1)} % (the windows' land ${(100 * land0 / (land0 + sea0n)).toFixed(0)} %, ` +
            `net ${(100 * (lost - gained) / (land0 + sea0n)).toFixed(1)} % of all to sea); ` +
            `bodies a window, more than the picture's: land ${(dLand / wins.length).toFixed(2)}, sea ${(dSea / wins.length).toFixed(2)}`);
    }
}
