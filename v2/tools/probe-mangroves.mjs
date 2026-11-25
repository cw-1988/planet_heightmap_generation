// Where the warm coasts' kinds grow (docs/coral-reefs-mangroves.md): a moment finished, then every coast pixel of its
// detail drivers read through littoral.js coastClasses — how many coasts are warm enough for mangroves and reefs, how
// sheltered those warm coasts are, and how many end up with mangroves or reefs, with the factor that cut the rest.
//
//   node --max-old-space-size=12000 v2/tools/probe-mangroves.mjs [--cells 640000] [--seed 799224]
//
// The moment's frame comes from render-moment.mjs's cache (v2/out/frames/), as probe-coast-fine.mjs's.

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { coastClasses, winterOf, worldLittoral, LITTORAL, LIT_N } from '../js/finish/littoral.js';
import { coastCoverAt } from '../js/finish/coast-readout.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 799224)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000)), TIME = Number(arg('--time', 290));
const CELLS = Number(arg('--cells', 640000));
const frameFile = path.join(ROOT, 'v2', 'out', 'frames', `frame-${SEED}-${CONT}-${SIM}-${TIME}.bin`);
if (!fs.existsSync(frameFile)) throw new Error(`no cached frame ${frameFile}: run render-moment.mjs for this moment first`);
const { frame } = v8.deserialize(fs.readFileSync(frameFile));
const simMesh = buildSimMesh(SIM, 12345), pool = await TerrainPool.create(simMesh);
const out = await finishPlanet({ frame, simMesh, seed: SEED, cells: CELLS, pool, closePool: true });
const d = out.drivers, N = d.w * d.h, Lt = LITTORAL;
if (!d.winter) throw new Error('no winter driver');

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(2) : '-');
const cls = [0, 0, 0, 0, 0];
let coast = 0, warm = 0, mg1 = 0, mg5 = 0, reef1 = 0, warmReef = 0;
const waves = [], calm = [], mud = [], dry = [];
for (let p = 0; p < N; p++) {
    const wave = d.wave[p] / 255, tideM = d.tide[p] / 255 * Lt.tideMaxM, sand = d.sand[p] / 255;
    if (!(wave + tideM + sand > 0)) continue;
    coast++;
    const wC = winterOf(d.winter[p] / 255), muddy = d.muddy[p] / 255, wet = d.wet ? d.wet[p] / 255 : 0.5;
    coastClasses(wave, tideM, sand, 0, 2 * d.rugged[p] / 255, 0.5, cls, wC, muddy, wet);
    if (cls[3] > 0.1) reef1++;
    if (wC >= Lt.reefC[1]) warmReef++;
    if (wC < Lt.mangroveC[1]) continue;
    warm++; waves.push(wave);
    calm.push(1 - smooth(Lt.mangroveCalm[0], Lt.mangroveCalm[1], wave));
    mud.push(Math.max(0, smooth(0.15, 0.6, muddy), 0.5)); dry.push(0.35 + 0.65 * smooth(0.2, 0.45, wet));
    if (cls[4] > 0.1) mg1++;
    if (cls[4] > 0.5) mg5++;
}
for (const a of [waves, calm, mud, dry]) a.sort((x, y) => x - y);
const pc = n => `${n} (${(100 * n / Math.max(1, warm)).toFixed(1)}% of warm)`;
console.log(`drivers ${d.w}×${d.h}: coast px ${coast}, warm (winter ≥ ${Lt.mangroveC[1]} °C) ${warm} (${(100 * warm / coast).toFixed(1)}%)`);
console.log(`warm coasts' waves: p10 ${q(waves, 0.1)} p25 ${q(waves, 0.25)} p50 ${q(waves, 0.5)} p75 ${q(waves, 0.75)} p90 ${q(waves, 0.9)}`);
console.log(`calm factor: p50 ${q(calm, 0.5)} p75 ${q(calm, 0.75)} p90 ${q(calm, 0.9)} · mud factor p50 ${q(mud, 0.5)} · wet factor p50 ${q(dry, 0.5)}`);
console.log(`mangroves > 0.1: ${pc(mg1)}, > 0.5: ${pc(mg5)} · reefs > 0.1: ${reef1} of ${warmReef} reef-warm`);

// ── as drawn: the world picture's shore colours (worldLittoral) at the page's widths — pixels with a visible mangrove
// canopy (≥ 25% cover) or reef flat, against the picture's coast pixels ──
for (const W of [2048, 8192]) {
    const fr = finishRaster(out.mesh, out.z, out.ocean, W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology);
    const ras = { h: Float32Array.from(fr.heightM, m => m / 1000), sea: fr.sea ?? fr.ocean };
    const lit = worldLittoral({ drivers: d }, ras, W);
    let shore = 0, mgPx = 0, reefPx = 0;
    for (let y = 0; y < W / 2; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!ras.sea[i] && (ras.sea[y * W + (x + 1) % W] || ras.sea[y * W + (x + W - 1) % W])) shore++;
        if (lit[LIT_N * i + 5] >= 64) mgPx++;
        if (ras.sea[i] && lit[LIT_N * i] >= 0.25 * 0.6 * 255 * Lt.shareMax) reefPx++;
    }
    // (the hover's words, coast-readout.js: how many pixels of the picture it names mangroves or a reef on)
    let saidMg = 0, saidReef = 0;
    const R = { ...fr, drivers: d };
    for (let y = 0; y < W / 2; y += 2) for (let x = 0; x < W; x += 2) {
        for (const c of coastCoverAt(R, (x + 0.5) / W, (y + 0.5) / (W / 2))) if (c.kind === 'mangrove') saidMg++; else saidReef++;
    }
    console.log(`readout (every 2nd px): says mangroves at ${saidMg}, coral reef at ${saidReef}`);
    console.log(`world picture ${W}: coast px ${shore}, mangrove px ${mgPx} (${(100 * mgPx / shore).toFixed(2)}% of coast), reef px ${reefPx}`);
}
