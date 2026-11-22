// Is a finish another planet, or the same one moved about? finish-similar.mjs judges cell by cell, which a climate
// border shifted by 20 km fails as surely as a desert turned forest. This compares saved runs (finish-similar.mjs
// --ref / --save) by what the planet is: its climates' areas, its zones by latitude, its rain and heights as
// distributions, its rivers' length — and how far a cell's Köppen class has to be looked for. Runs at other cell
// counts are resampled onto the first's mesh (nearest cell), so a Detail rung can stand as the yardstick:
//
//   node --max-old-space-size=16000 v2/tools/finish-kind.mjs --a ref-2500000 --b grid2-2500000,ref-640000 --yard ref-640000
//
// With --yard: a run (not the yardstick) is marked OUT on a measure that is more than twice as far from the exact
// finish as the yardstick (the Detail rung below) — a fast part may change no more than a Detail step already does,
// doubled; exits 1 when any is.

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';
import { KOPPEN_CLASSES } from '../js/climate/koppen.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const load = name => v8.deserialize(fs.readFileSync(path.join(ROOT, 'v2', 'out', 'similar', `${name}.bin`)));
const RIVER_KM2 = 1000, TRUNK_KM2 = 50000, BAND_DEG = 10;

/** For each cell of mesh `a`, the nearest cell of mesh `b` (buckets of about equal area, searched 3 × 3). */
function nearestCells(a, b) {
    const rows = 720, nb = b.xyz.length / 3, lat = z => Math.asin(Math.max(-1, Math.min(1, z)));
    const cols = Array.from({ length: rows }, (_, r) => Math.max(1, Math.round(2 * rows * Math.cos(((r + 0.5) / rows - 0.5) * Math.PI))));
    const key = (x, y, z) => { const r = Math.min(rows - 1, Math.floor((lat(z) / Math.PI + 0.5) * rows)); return [r, Math.floor(((Math.atan2(y, x) / (2 * Math.PI)) + 0.5) * cols[r]) % cols[r]]; };
    const bins = new Map();
    for (let c = 0; c < nb; c++) {
        const [r, k] = key(b.xyz[3 * c], b.xyz[3 * c + 1], b.xyz[3 * c + 2]), id = r * 4 * rows + k;
        (bins.get(id) ?? bins.set(id, []).get(id)).push(c);
    }
    const na = a.xyz.length / 3, out = new Int32Array(na);
    for (let c = 0; c < na; c++) {
        const x = a.xyz[3 * c], y = a.xyz[3 * c + 1], z = a.xyz[3 * c + 2], [r, k] = key(x, y, z);
        let best = -1, bd = Infinity;
        for (let dr = -1; dr <= 1; dr++) {
            const rr = r + dr;
            if (rr < 0 || rr >= rows) continue;
            const kc = Math.floor((k + 0.5) / cols[r] * cols[rr]);
            for (let dk = -1; dk <= 1; dk++) for (const j of bins.get(rr * 4 * rows + ((kc + dk) % cols[rr] + cols[rr]) % cols[rr]) ?? []) {
                const d = (b.xyz[3 * j] - x) ** 2 + (b.xyz[3 * j + 1] - y) ** 2 + (b.xyz[3 * j + 2] - z) ** 2;
                if (d < bd) { bd = d; best = j; }
            }
        }
        out[c] = best;
    }
    return out;
}

/** Run `f`'s fields on mesh `a`'s cells, by the map `m` (or as they are, same mesh). */
function resample(f, m) {
    if (!m) return f;
    const pick = arr => { const o = new arr.constructor(m.length); for (let c = 0; c < m.length; c++) o[c] = arr[m[c]]; return o; };
    return { z: pick(f.z), ocean: pick(f.ocean), koppen: pick(f.koppen), tAnnual: pick(f.tAnnual), pAnnual: pick(f.pAnnual) };
}

const quant = (v, q) => v[Math.floor(q * (v.length - 1))];
const sorted = vals => Float64Array.from(vals.filter(v => v === v)).sort();

/** What a run is, on its own mesh: the climates' land shares, the zones' land temperature and rain, distributions. */
function profile(mesh, f) {
    const n = f.z.length, cls = new Float64Array(KOPPEN_CLASSES.length), grp = {}, bands = 180 / BAND_DEG;
    const bt = new Float64Array(bands), bp = new Float64Array(bands), bn = new Float64Array(bands);
    const t = [], p = [], h = [];
    let land = 0, river = 0, trunk = 0;
    for (let c = 0; c < n; c++) {
        if (f.ocean[c]) continue;
        land++; cls[f.koppen[c]]++; h.push(f.z[c]);
        const g = KOPPEN_CLASSES[f.koppen[c]]?.code?.[0] ?? '?'; grp[g] = (grp[g] ?? 0) + 1;
        const b = Math.min(bands - 1, Math.floor((Math.asin(mesh.xyz[3 * c + 2]) * 180 / Math.PI + 90) / BAND_DEG));
        if (f.tAnnual[c] === f.tAnnual[c] && f.pAnnual[c] === f.pAnnual[c]) { bt[b] += f.tAnnual[c]; bp[b] += f.pAnnual[c]; bn[b]++; t.push(f.tAnnual[c]); p.push(f.pAnnual[c]); }
        if (f.area && f.area[c] >= RIVER_KM2 && f.lakeLevel[c] !== f.lakeLevel[c]) { river++; if (f.area[c] >= TRUNK_KM2) trunk++; }
    }
    const km = Math.sqrt(4 * Math.PI * 6371 ** 2 / n);
    for (const k in grp) grp[k] /= land;
    return { land: land / n, cls: cls.map(v => v / land), grp, bt, bp, bn, t: sorted(t), p: sorted(p), h: sorted(h), riverKm: river * km, trunkKm: trunk * km };
}

/** Half the summed differences of two share tables: the share of land that would have to change class. */
const shift = (a, b) => { let s = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) s += Math.abs((a[k] ?? 0) - (b[k] ?? 0)); return s / 2; };

/** The share of a's land cells whose own Köppen class is in b within `rings` rings of neighbours (on a's mesh). */
function koppenWithin(mesh, a, b, rings) {
    const { adjOffset, adjList } = mesh, n = a.z.length, seen = new Int32Array(n).fill(-1);
    let land = 0, hit = 0, ring = [], next = [];
    for (let c = 0; c < n; c++) {
        if (a.ocean[c]) continue;
        land++;
        if (b.koppen[c] === a.koppen[c]) { hit++; continue; }
        ring = [c]; seen[c] = c;
        let found = false;
        for (let r = 0; r < rings && !found; r++) {
            next = [];
            for (const i of ring) for (let k = adjOffset[i]; k < adjOffset[i + 1] && !found; k++) {
                const j = adjList[k];
                if (seen[j] === c) continue;
                seen[j] = c; next.push(j);
                if (b.koppen[j] === a.koppen[c]) found = true;
            }
            ring = next;
        }
        if (found) hit++;
    }
    return hit / Math.max(1, land);
}

const A = arg('--a', 'ref-2500000'), Bs = arg('--b', '').split(',').filter(Boolean);
const a = load(A), meshA = terrainMesh(a.z.length), pa = profile(meshA, a);
const rows = {};
const put = (name, col, v) => ((rows[name] ??= {})[col] = v);
for (const B of Bs) {
    const b = load(B), meshB = b.z.length === a.z.length ? meshA : terrainMesh(b.z.length);
    const pb = profile(meshB, b), m = meshB === meshA ? null : nearestCells(meshA, meshB), r = resample(b, m);
    let same = 0, land = 0, sq = 0; const rain = [];
    for (let c = 0; c < a.z.length; c++) {
        if (a.ocean[c]) continue;
        land++; if (r.koppen[c] === a.koppen[c]) same++;
        sq += (r.z[c] - a.z[c]) ** 2;
        rain.push(Math.abs(r.pAnnual[c] - a.pAnnual[c]) / Math.max(10, a.pAnnual[c]));
    }
    put('per cell: Köppen same', B, same / land);
    put('per cell: Köppen within 3 cells', B, koppenWithin(meshA, a, r, 3));
    put('per cell: Köppen within 8 cells', B, koppenWithin(meshA, a, r, 8));
    put('per cell: rain, median rel. diff', B, quant(sorted(rain), 0.5));
    put('per cell: land height RMS (km)', B, Math.sqrt(sq / land));
    put('whole: Köppen area to change class', B, shift({ ...pa.cls }, { ...pb.cls }));
    put('whole: main groups (ABCDE) area shift', B, shift(pa.grp, pb.grp));
    put('whole: land share diff', B, pb.land - pa.land);
    let dt = 0, dp = 0;
    for (let k = 0; k < pa.bn.length; k++) {
        if (pa.bn[k] < 0.005 * pa.t.length || pb.bn[k] < 0.005 * pb.t.length) continue;
        dt = Math.max(dt, Math.abs(pb.bt[k] / pb.bn[k] - pa.bt[k] / pa.bn[k]));
        dp = Math.max(dp, Math.abs(pb.bp[k] / pb.bn[k] / (pa.bp[k] / pa.bn[k]) - 1));
    }
    put(`zones (${BAND_DEG}°): worst land temp diff (°C)`, B, dt);
    put(`zones (${BAND_DEG}°): worst land rain rel. diff`, B, dp);
    for (const q of [0.1, 0.5, 0.9]) put(`whole: land rain p${q * 100} rel. diff`, B, quant(pb.p, q) / quant(pa.p, q) - 1);
    put('whole: land temp median diff (°C)', B, quant(pb.t, 0.5) - quant(pa.t, 0.5));
    for (const q of [0.5, 0.9, 0.99]) put(`whole: land height p${q * 100} diff (km)`, B, quant(pb.h, q) - quant(pa.h, q));
    put('whole: river length rel. diff', B, pb.riverKm / pa.riverKm - 1);
    put('whole: trunk river length rel. diff', B, pb.trunkKm / pa.trunkKm - 1);
}
// (how far a value is from the exact finish: a kept share by what it misses, a difference by its size)
const off = (name, v) => (name.startsWith('per cell: Köppen') ? 1 - v : Math.abs(v));
const YARD = arg('--yard', null);
let out = 0;
console.log(`against ${A}:`.padEnd(42) + Bs.map(s => s.padStart(18)).join(''));
for (const [name, cols] of Object.entries(rows)) console.log(name.padEnd(42) + Bs.map(s => {
    const bad = YARD && s !== YARD && off(name, cols[s]) > 2 * off(name, cols[YARD]) + 0.002;
    if (bad) out++;
    return `${bad ? 'OUT ' : ''}${cols[s].toFixed(3)}`.padStart(18);
}).join(''));
if (YARD) console.log(out ? `${out} measure(s) more than twice the yardstick's (${YARD})` : `within twice the yardstick (${YARD}) on every measure`);
process.exit(out ? 1 : 0);
