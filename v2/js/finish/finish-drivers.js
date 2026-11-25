// What the detail finer than the mesh is drawn from (plans/V2_FINE_DETAIL_PLAN.md; fine-detail.js): a small picture of
// bytes the finish leaves beside its picture of heights — regional fields, each from a cause the finish worked out: where
// the ice age's glaciers were and which way its sheets flowed, how cold the coast is, how active the margin, the fold
// belts and rifts with their strike, the sand seas and the wind, how wet, how young the belt, how rugged, the sea's waves,
// tide and sand on each coast, its winter's warmth, its rivers' mud and the way its waves travel. Saved with the
// moment; a moment without them gets no detail finer than its mesh.

import { CoastKind, deriveRecords, kindType, kindSide } from '../terrain/records.js';
import { OrogenyType, BeltSide } from '../tectonics/model/crust.js';
import { report } from '../core/progress.js';

const R = 6371, D2R = Math.PI / 180, TAU = 2 * Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const byte = v => Math.max(0, Math.min(255, Math.round(255 * v)));

/** The fields, in order (each a Uint8Array of w × h; directions as angles in the place's own east–north frame). */
export const DRIVER_FIELDS = [
    'ice',        // the ice age's glaciers and sheets (0 … 1)
    'scour',      // how thick the ice sheet was over this ground (0 … 1: lake districts where low and calm)
    'iceDir',     // which way the ice flowed (0 … 2π)
    'cold',       // how cold the coast's summer is (0 warm: rias … 1 cold: fjords — the carve's fjord measure)
    'active',     // an active margin (a trench, a collision, an arc, a transform) rather than a passive one
    'fold',       // a fold belt's or a rift's grain (0 … 1)
    'foldDir',    // which way across its strike, toward its far edge (0 … 2π: the way its thrusts face)
    'foldKind',   // 0 folds and thrusts, 255 a rift's tilted blocks
    'erg',        // a sand sea (0 … 1)
    'wind',       // which way the year's wind blows (0 … 2π)
    'duneMode',   // how much the seasons' winds cross (0: dunes across the wind … 1: along it)
    'wet',        // the year's rain (log: 100 mm … 4000 mm)
    'young',      // how active the belt is (1 while the history still raises it)
    'rugged',     // the relief within ~20 km (0 … 2 km)
    'wave',       // how exposed the coast is to the waves (0 … 1: a storm's significant height 0.5 … 4 m — finish-coast.js)
    'tide',       // the coast's tidal range (0 … 12 m)
    'sand',       // the sand the coast is given (0 … 1: soft rock worn back, the rivers' load carried along the shore)
    // (added after: a moment finished before them has none — its readers check)
    'winter',     // the coldest month at sea level (−10 … 35 °C: finish-coast.js COAST.winterC — reefs, mangroves)
    'muddy',      // the rivers' mud in the coast's water (0 … 1)
    'waveE',      // which way the waves travel, east and north (128 ± 127 × their energy's mean direction: the longshore drift)
    'waveN',
];

/** The drivers' picture's width for a finished picture of width `rasterW`: half of it, at most 2048. */
export const driverWidth = rasterW => Math.max(256, Math.min(2048, rasterW >> 1));

/**
 * @param {Object} o  { mesh, z (km, finished), lat, lon (degrees), ice, iceH (km), iceS (km: its surface), erg, wind
 *                     ({year, jan, jul}: [u, v] on climGrid), climGrid, warmSl (°C), rain (mm), young (bytes: the belt's activity), frame,
 *                     simMesh, cfg (terrain), seed, width, coast (finish-coast.js coastWork: wave, tide, sand, winter, muddy, waveE, waveN per cell — or none) }
 * @returns {{w: number, h: number, [field]: Uint8Array}}
 */
export function detailDrivers(o) {
    const { mesh, z, simMesh } = o, W = o.width, H = W >> 1, P = W * H, { xyz, adjOffset, adjList } = mesh;
    const out = { w: W, h: H };
    for (const k of DRIVER_FIELDS) out[k] = new Uint8Array(P);
    // (a moment with no history — an imported heightmap: plans/SHARED_CORE_PLAN.md U4 — has no margins or belts to read)
    // (o.rec: the records worked out ahead — finish.js does it while the surface's workers run; the same call)
    const rec = o.rec !== undefined ? o.rec : o.frame ? deriveRecords(o.frame, simMesh, o.cfg, o.seed) : null, L0 = rec?.belts[0];
    const [warmC, coldC] = o.cfg.drownColdC ?? [19, 13];
    const near = new Int32Array(P);
    // (a column's longitude and its cosine and sine, worked out once for all its rows: the same values)
    const LO = new Float64Array(W), COS = new Float64Array(W), SIN = new Float64Array(W);
    for (let x = 0; x < W; x++) { LO[x] = ((x + 0.5) * 360 / W - 180) * D2R; COS[x] = Math.cos(LO[x]); SIN[x] = Math.sin(LO[x]); }
    report(0.1);
    for (let y = 0; y < H; y++) {
        if ((y & 31) === 0) report(0.1 + 0.7 * y / H);
        const la = (90 - (y + 0.5) * 180 / H) * D2R, cl = Math.cos(la), sl = Math.sin(la);
        for (let x = 0; x < W; x++) {
            const lo = LO[x], cosL = COS[x], sinL = SIN[x], px = cl * cosL, py = cl * sinL, pz = sl, p = y * W + x;
            // (the place's own east and north)
            const ex = -sinL, ey = cosL, nx = -sl * cosL, ny = -sl * sinL, nz = cl;
            const c = mesh.index.nearest(px, py, pz);
            near[p] = c;
            // the ice age
            if (o.ice && o.ice[c]) {
                out.ice[p] = 255;
                out.scour[p] = byte(smooth(0.4, 1.4, o.iceH[c]));
                // (the ice flows down its surface)
                let gx = 0, gy = 0, gz = 0;
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                    const nb = adjList[k];
                    if (!o.ice[nb]) continue;
                    const d = o.iceS[nb] - o.iceS[c];
                    gx += d * (xyz[3 * nb] - xyz[3 * c]); gy += d * (xyz[3 * nb + 1] - xyz[3 * c + 1]); gz += d * (xyz[3 * nb + 2] - xyz[3 * c + 2]);
                }
                if (gx || gy || gz) out.iceDir[p] = Math.round(angleIn(-gx, -gy, -gz, ex, ey, nx, ny, nz) / TAU * 256) & 255;
            }
            out.cold[p] = byte(smooth(warmC, coldC, o.warmSl[c]));
            const rain = o.rain[c];
            if (rain === rain) out.wet[p] = byte(Math.log(Math.max(100, Math.min(4000, rain)) / 100) / Math.log(40));
            out.young[p] = o.young ? o.young[c] : 0;
            if (o.erg) out.erg[p] = byte(smooth(0.05, 0.5, o.erg[c]));                          // (a steppe's sand a trace; a desert's sand sea all)
            // the wind (the climate's grid): its way, and how much the seasons' differ
            if (out.erg[p]) {
                const u = gridAt(o.climGrid, o.wind.year[0], la / D2R, lo / D2R), v = gridAt(o.climGrid, o.wind.year[1], la / D2R, lo / D2R);
                out.wind[p] = Math.round(((Math.atan2(v, u) % TAU + TAU) % TAU) / TAU * 256) & 255;
                const a1 = Math.atan2(gridAt(o.climGrid, o.wind.jan[1], la / D2R, lo / D2R), gridAt(o.climGrid, o.wind.jan[0], la / D2R, lo / D2R));
                const a2 = Math.atan2(gridAt(o.climGrid, o.wind.jul[1], la / D2R, lo / D2R), gridAt(o.climGrid, o.wind.jul[0], la / D2R, lo / D2R));
                let d = Math.abs(a1 - a2); if (d > Math.PI) d = TAU - d;
                out.duneMode[p] = byte(smooth(40 * D2R, 100 * D2R, d));
            }
            // the sea's work on the coast (finish-coast.js): its waves, its tide, its sand
            if (o.coast) {
                out.wave[p] = o.coast.wave[c]; out.tide[p] = o.coast.tide[c]; out.sand[p] = o.coast.sand[c];
                out.winter[p] = o.coast.winter[c]; out.muddy[p] = o.coast.muddy[c]; out.waveE[p] = o.coast.waveE[c]; out.waveN[p] = o.coast.waveN[c];
            } else out.waveE[p] = out.waveN[p] = 128;
            // the records (the sim mesh, at the moment): the margin, the belts
            if (!rec) continue;
            const w = simMesh.index.nearest(px, py, pz);
            const ck = rec.coastKind[w];
            out.active[p] = ck === CoastKind.ACTIVE || ck === CoastKind.COLLISION || ck === CoastKind.ARC || ck === CoastKind.TRANSFORM ? 255 : 0;
            const kind = L0.kind[w];
            if (kind && rec.land[w]) {
                const type = kindType(kind);
                if (type !== OrogenyType.ARC) {
                    const rift = type === OrogenyType.RIFT, rel = L0.reliefKm[w];
                    // (folds and thrusts strongest toward a belt's foreland side, calmer in its crystalline core; a shield none)
                    const across = L0.reach[w] > 0 ? L0.dKm[w] / L0.reach[w] : 0.5, side = kindSide(kind);
                    const outer = side === BeltSide.UPPER || side === BeltSide.NONE ? 0.45 + 0.55 * smooth(0.25, 0.85, across) : 0.7;
                    const g = (rift ? smooth(0.05, 0.4, rel) : smooth(0.03, 0.35, rel) * outer) * (rec.craton[w] ? 0.25 : 1);
                    out.fold[p] = byte(g);
                    out.foldKind[p] = rift ? 255 : 0;
                    const ax = L0.across[3 * w], ay = L0.across[3 * w + 1], az = L0.across[3 * w + 2];
                    if (ax || ay || az) out.foldDir[p] = Math.round(angleIn(ax, ay, az, ex, ey, nx, ny, nz) / TAU * 256) & 255;
                }
            }
        }
    }
    // how rugged: the relief over the pixel and its eight neighbours (~±1.5 pixels: ~20 km at 2048 wide)
    report(0.8);
    const zz = new Float32Array(P);
    for (let p = 0; p < P; p++) zz[p] = z[near[p]];
    // (the wrap's columns worked out once per column, not per read: the same pixels in the same order)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let lo = Infinity, hi = -Infinity;
        const xm = x ? x - 1 : W - 1, xp = x + 1 < W ? x + 1 : 0;
        for (let dy = -1; dy <= 1; dy++) {
            const r = Math.min(H - 1, Math.max(0, y + dy)) * W;
            let v = zz[r + xm]; if (v < lo) lo = v; if (v > hi) hi = v;
            v = zz[r + x]; if (v < lo) lo = v; if (v > hi) hi = v;
            v = zz[r + xp]; if (v < lo) lo = v; if (v > hi) hi = v;
        }
        out.rugged[y * W + x] = byte(Math.max(0, Math.max(0, hi) - Math.max(0, lo)) / 2);
    }
    // (regional fields: softened over a pixel, so the detail fades in and out rather than stepping)
    report(0.9);
    for (const k of ['ice', 'scour', 'cold', 'active', 'fold', 'erg', 'young', 'rugged', 'wet', 'wave', 'tide', 'sand', 'winter', 'muddy', 'waveE', 'waveN']) blur3(out[k], W, H);
    return out;
}

/** A direction's angle (0 … 2π) in a place's own east (ex, ey, 0) – north (nx, ny, nz) frame. */
function angleIn(vx, vy, vz, ex, ey, nx, ny, nz) {
    const a = Math.atan2(vx * nx + vy * ny + vz * nz, vx * ex + vy * ey);
    return ((a % TAU) + TAU) % TAU;
}

/** A field on the climate's grid at (lat, lon) — bilinear, wrapping in longitude. */
function gridAt(g, field, lat, lon) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    return (1 - fx) * (1 - fy) * field[y0 * w + i0] + fx * (1 - fy) * field[y0 * w + i1] + (1 - fx) * fy * field[j1 * w + i0] + fx * fy * field[j1 * w + i1];
}

/** A byte field softened by a 3 × 3 box (wrapping east–west). */
function blur3(a, W, H) {
    const t = new Uint16Array(a.length);
    // (the wrap's two ends on their own, the rows' offsets once per row: the same sums)
    for (let y = 0; y < H; y++) {
        const o = y * W;
        t[o] = a[o + W - 1] + a[o] + a[o + 1];
        for (let x = 1; x < W - 1; x++) t[o + x] = a[o + x - 1] + a[o + x] + a[o + x + 1];
        t[o + W - 1] = a[o + W - 2] + a[o + W - 1] + a[o];
    }
    for (let y = 0; y < H; y++) {
        const o = y * W, up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W;
        for (let x = 0; x < W; x++) a[o + x] = Math.round((t[up + x] + t[o + x] + t[dn + x]) / 9);
    }
}
