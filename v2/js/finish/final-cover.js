// The finished moment's climate and land cover, cell by cell (finishPlanet's 'final climate' stage): each land cell's
// twelve months on the finished surface (climate/core.js cellClimate), and from them its cover's colours (the year,
// January, July; and well watered, for the riverside), its biome and snow, its measures beyond Köppen, the deposits'
// climate tests and the farming's climate parts. Every cell is its own, so the cells are cut into ranges and worked on
// worker threads (cover-worker.js) — the same values, bit for bit, ~6× sooner at 2.5M cells; on this thread where no
// worker starts. The one part that is not a cell's own — the soft families' grid keeps the first few places of each
// grid cell, in cell order — is replayed here in cell order from each range's candidates.

import { FINISH, COVER } from './finish-config.js';
import { landCover, coverRgb, newCover, coverRainScale, newVariety, placeVariety, placeGround } from './finish-cover.js';
import { CORE_DEFAULTS, cellClimate } from '../climate/core.js';
import { cellStatsCollector, STAT_KEYS } from '../climate/cell-stats.js';
import { FastNoise } from '../core/fast-noise.js';
import { softFamilies, softFamilyGrid } from '../climate/koppen-soft.js';
import { climateTests, climateTestArrays } from '../geology/deposits.js';
import { newFarmClimate, addFarmClimate } from '../farming/farming.js';
import { spawn as spawnWorker, defaultPoolSize } from '../terrain/terrain-pool.js';
import { report } from '../core/progress.js';

const FAMILY_GRID_W = 1024;           // (the soft families' grid: climate/koppen-soft.js softFamilyGrid)
const POOL_FROM_CELLS = 300000;       // (below this the workers' start costs more than they save)
const RANGES_PER_WORKER = 4;          // (land and sea even out: each worker takes the next range as it finishes one)
const PER_CELL = ['xyz', 'z', 'land', 'lat', 'lon', 'rainTarget', 'erg', 'loess', 'basalt', 'rock'];

/**
 * One range's cells: `I` holds the range's own slices (PER_CELL: xyz 3 a cell; rock may be null) and the grid's climate
 * (grid {w, h, size, step}, meanLandKm, months {T, P}), seed, F, clim (the deposits' tests wanted).
 * @returns the range's outputs (finalCover's, for these cells) and fam: the soft families' candidates {c, f}
 */
export function coverRange(I, onShare = null) {
    const { xyz, z, land, lat, lon, rainTarget, erg, loess, basalt, rock, seed, F } = I, n = land.length;
    const gridClimate = { grid: I.grid, surface: { meanLandKm: I.meanLandKm }, months: I.months, cell: { lat, lon } };
    const sat = [new Uint8Array(3 * n), new Uint8Array(3 * n), new Uint8Array(3 * n)], cover = new Uint8Array(n), cv = newCover();
    // (and the riverside's colour: the cover again, well watered — where it is dry enough to differ; else the cover's own)
    const ripSat = [new Uint8Array(3 * n), new Uint8Array(3 * n), new Uint8Array(3 * n)], cvWet = newCover(), PW = new Float64Array(12);
    const P12c = new Float64Array(12), T12c = new Float64Array(12), bi = new Int32Array(4), bw = new Float64Array(4);
    // (and its variety: tints between a few natural colours, by noise — its own stream)
    const varyNoise = new FastNoise(((seed | 0) * 0x51f3 + 0x3a9) >>> 0), vy = newVariety();
    // (and its temperatures at its own full height — the climate takes only part of a place's height above its
    // surroundings: tree and snow lines follow all of it — its surroundings' height as the climate has it, the 1° grid's
    // mean land height)
    const relief = COVER.fullLapse ? (1 - CORE_DEFAULTS.terrainRelief) * CORE_DEFAULTS.lapseRateCPerKm : 0, hLand = I.meanLandKm, climGrid = I.grid;
    // (and its measures beyond Köppen — cell-stats.js, one byte each — from the climate's own twelve months)
    const cellStats = cellStatsCollector(n, c => lat[c] * Math.PI / 180, { bytes: true });
    const clim = I.clim ? climateTestArrays(n) : null, farmC = newFarmClimate(n);
    // (the soft families' candidates: the first places of each grid cell in this range — a superset of those kept)
    const famGrid = softFamilyGrid(FAMILY_GRID_W), famBuf = new Float64Array(10), famC = [], famF = [];
    let nextShare = 0;
    const out = cellClimate(gridClimate, xyz, z, land, {}, (c, T12, P12) => {
        if (onShare && c >= nextShare) { onShare(c / n); nextShare = c + 0x8000; }
        cellStats.add(c, T12, P12);
        { const g = famGrid.wants(lat[c], lon[c]); if (g >= 0) { const f = softFamilies(T12, P12, famBuf); famGrid.add(g, f); famC.push(c); for (let k = 0; k < f.length; k++) famF.push(f[k]); } }
        let T = T12;
        if (relief) {
            corners(climGrid, lat[c], lon[c], bi, bw);
            let s = 0, k = 0;
            for (let j = 0; j < 4; j++) { const v = hLand[bi[j]]; if (v === v) { s += bw[j] * Math.max(0, v); k += bw[j]; } }
            const dT = k > 0 ? relief * (Math.max(0, z[c]) - s / k) : 0;
            for (let m = 0; m < 12; m++) T12c[m] = T12[m] - dT;
            T = T12c;
        }
        if (clim) climateTests(T, P12, c, clim);
        landCover(T, coverRainScale(P12, rainTarget[c], P12c), cv, F, COVER, lat[c]);
        addFarmClimate(farmC, c, T, P12c, cv);
        placeVariety(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], varyNoise, vy);
        placeGround(vy, erg[c], loess[c] / F.loessKm, basalt[c] / 255, COVER, rock ? rock[c] : 0);
        for (let v = 0; v < 3; v++) coverRgb(cv, v, sat[v], 3 * c, undefined, vy);
        if (cv.wetness < COVER.ripWetness) {
            const k = COVER.ripWetness / Math.max(0.02, cv.wetness);
            for (let m = 0; m < 12; m++) PW[m] = P12c[m] * k;
            landCover(T, PW, cvWet, F, COVER, lat[c]);
            for (let v = 0; v < 3; v++) coverRgb(cvWet, v, ripSat[v], 3 * c, undefined, vy);
        } else for (let v = 0; v < 3; v++) { const S = sat[v], D = ripSat[v], o = 3 * c; D[o] = S[o]; D[o + 1] = S[o + 1]; D[o + 2] = S[o + 2]; }
        cover[c] = cv.biome | (cv.snow[1] >= 0.5 ? 32 : 0) | (cv.snow[2] >= 0.5 ? 64 : 0);
    });
    const { _s, _c, _y, _w, ...farm } = farmC;
    return { koppen: out.koppen, tAnnual: out.tAnnual, pAnnual: out.pAnnual, sat, ripSat, cover, stats: cellStats.stats, clim, farm,
        fam: { c: Int32Array.from(famC), f: Float64Array.from(famF) } };
}

/** The arrays of a range's result, for handing it over between threads. */
export function rangeBuffers(O) {
    const all = [O.koppen, O.tAnnual, O.pAnnual, ...O.sat, ...O.ripSat, O.cover, ...Object.values(O.stats), ...(O.clim ? Object.values(O.clim) : []),
        ...Object.values(O.farm).flatMap(a => (ArrayBuffer.isView(a) ? [a] : Object.values(a))), O.fam.c, O.fam.f];
    return all.map(a => a.buffer);
}

/**
 * The whole mesh's: `A` the per-cell arrays (PER_CELL, all n cells), `G` {grid, meanLandKm, months}, seed, F, clim.
 * @returns {Promise<{koppen, tAnnual, pAnnual, sat, ripSat, cover, stats, clim, farm, families}>} as one range of all n
 */
export async function finalCover(A, G, { seed, F = FINISH, clim = false, workers = null } = {}) {
    const n = A.land.length, shared = { grid: { w: G.grid.w, h: G.grid.h, size: G.grid.size, step: G.grid.step }, meanLandKm: G.meanLandKm, months: { T: G.months.T, P: G.months.P }, seed, F, clim };
    const W = n >= POOL_FROM_CELLS ? (workers ?? await defaultPoolSize()) : 0;
    let parts = null;
    if (W > 1) parts = await onWorkers(A, shared, n, W).catch(() => null);           // (no worker starts: on this thread)
    parts ??= [{ from: 0, O: coverRange({ ...shared, ...A }, s => report(0.02 + 0.9 * s)) }];
    return merge(parts, n, A.lat, A.lon);
}

async function onWorkers(A, shared, n, W) {
    const workers = await Promise.all(Array.from({ length: W }, () => spawnWorker('../finish/cover-worker.js')));
    try {
        const count = W * RANGES_PER_WORKER, ranges = Array.from({ length: count }, (_, i) => ({ from: Math.floor(i * n / count), to: Math.floor((i + 1) * n / count) }));
        const parts = new Array(count);
        let next = 0, done = 0;
        await new Promise((resolve, reject) => {
            const give = w => {
                if (next >= count) return;
                const i = next++, { from, to } = ranges[i], I = {};
                for (const k of PER_CELL) I[k] = A[k] ? A[k].slice((k === 'xyz' ? 3 : 1) * from, (k === 'xyz' ? 3 : 1) * to) : null;
                w.post({ type: 'range', i, from, I }, Object.values(I).filter(Boolean).map(a => a.buffer));
            };
            for (const w of workers) {
                w.listen(msg => {
                    if (msg.type === 'error') { reject(new Error(`cover worker: ${msg.message}`)); return; }
                    parts[msg.i] = { from: msg.from, O: msg.O };
                    report(0.02 + 0.9 * ++done / count);
                    if (done === count) resolve(); else give(w);
                });
                w.onCrash(m => reject(new Error(`cover worker stopped (${m})`)));
                w.hold(true);
                w.post({ type: 'shared', shared });
                give(w);
            }
        });
        return parts;
    } finally { for (const w of workers) w.terminate(); }
}

/** The ranges' results as one, and the soft families' grid replayed in cell order. */
function merge(parts, n, lat, lon) {
    if (parts.length === 1) { const O = parts[0].O; return { ...O, families: replayFamilies([parts[0]], lat, lon) }; }
    const O0 = parts[0].O, keyed = (o, f) => Object.fromEntries(Object.entries(o).map(([k, a]) => [k, f(a)]));
    const like = (a, per) => new a.constructor(per * n);
    const per = (a, O) => a.length / O.koppen.length;                 // (values a cell: 1, 2 or 3)
    const out = { koppen: like(O0.koppen, 1), tAnnual: like(O0.tAnnual, 1), pAnnual: like(O0.pAnnual, 1), sat: O0.sat.map(a => like(a, 3)), ripSat: O0.ripSat.map(a => like(a, 3)), cover: like(O0.cover, 1),
        stats: keyed(O0.stats, a => like(a, 1)), clim: O0.clim ? keyed(O0.clim, a => like(a, 1)) : null,
        farm: keyed(O0.farm, a => (ArrayBuffer.isView(a) ? like(a, per(a, O0)) : keyed(a, b => like(b, per(b, O0))))) };
    for (const { from, O } of parts) {
        const put = (dst, src) => dst.set(src, from * per(src, O));
        put(out.koppen, O.koppen); put(out.tAnnual, O.tAnnual); put(out.pAnnual, O.pAnnual); put(out.cover, O.cover);
        for (let v = 0; v < 3; v++) { put(out.sat[v], O.sat[v]); put(out.ripSat[v], O.ripSat[v]); }
        for (const k of STAT_KEYS) put(out.stats[k], O.stats[k]);
        if (out.clim) for (const k in out.clim) put(out.clim[k], O.clim[k]);
        for (const k in out.farm) { if (ArrayBuffer.isView(O.farm[k])) put(out.farm[k], O.farm[k]); else for (const g in O.farm[k]) put(out.farm[k][g], O.farm[k][g]); }
    }
    return { ...out, families: replayFamilies(parts, lat, lon) };
}

function replayFamilies(parts, lat, lon) {
    const fam = softFamilyGrid(FAMILY_GRID_W);
    for (const { from, O } of parts) {
        const { c: cs, f } = O.fam, NF = cs.length ? f.length / cs.length : 0;
        for (let i = 0; i < cs.length; i++) {
            const c = from + cs[i], g = fam.wants(lat[c], lon[c]);
            if (g >= 0) fam.add(g, f.subarray(NF * i, NF * (i + 1)));
        }
    }
    return fam.done();
}

/** The four grid points around (lat, lon) of a {w, h} grid, and their bilinear weights. */
export function corners(g, lat, lon, bi, bw) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    bi[0] = y0 * w + i0; bi[1] = y0 * w + i1; bi[2] = j1 * w + i0; bi[3] = j1 * w + i1;
    bw[0] = (1 - fx) * (1 - fy); bw[1] = fx * (1 - fy); bw[2] = (1 - fx) * fy; bw[3] = fx * fy;
}
