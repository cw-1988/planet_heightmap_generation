// The finished picture's rows on short-lived workers (finish-raster.js rasterBand): each gets the mesh and the cells'
// fields once — a copy, ~350 MB at 2.5M cells, held only while the picture is drawn — then bands of rows, the next as
// soon as one is done, and this thread draws bands too; the bands come back in order and are joined, and what reads the
// picture whole runs here — but the terrain look's rows (terrain-look.js), a second round on the same workers before
// they end. The same pixels as finishRaster's; where no worker starts, or the picture is small, it is finishRaster.

import { finishRaster, rasterBand, rasterFinish, climateWidth, FARM_KEYS } from './finish-raster.js';
import { spawn, defaultPoolSize } from '../terrain/terrain-pool.js';
import { SphereIndex } from '../core/sphere-index.js';
import { lookSetup, lookBand, lookRows } from './terrain-look.js';
import { FastNoise } from '../core/fast-noise.js';
import { SHARED, sharedAll } from '../core/shared-memory.js';

/** From this width, the picture is drawn on workers: its cost goes with its pixels (9.7 s at 4096 px on one thread, at
 *  250K cells as at 2.5M), and the copies sent are small on a small mesh. */
const WORKERS_FROM_WIDTH = 1024;
/** At most this many where each holds its own copy of the mesh and fields while it draws; where memory is shared
 *  (shared-memory.js), as many as the pool's. */
const MAX_WORKERS = SHARED ? Infinity : 4;
const BANDS_PER_WORKER = 4;

/** finishRaster's picture, its rows drawn on workers — same arguments; `located` (reused cells) keeps it on this thread. */
export async function finishRasterAsync(mesh, z, ocean, w, onRow = null, lake = null, lakeLevel = null, climate = null, geology = null, farming = null, located = null, pond = null) {
    const draw = () => finishRaster(mesh, z, ocean, w, onRow, lake, lakeLevel, climate, geology, farming, located, pond);
    if (located || w < WORKERS_FROM_WIDTH) return draw();
    const W = Math.min(MAX_WORKERS, await defaultPoolSize());
    if (W < 2) return draw();
    const S = { mesh, z, ocean, lake, lakeLevel, climate, geology, farming, pond, got: null, keep: null };
    // (the bands joined, the small lakes, then the terrain look's rows on the same workers)
    const out = await onWorkers(S, w, W, onRow, (bands, workers) => rasterFinish(joinBands(bands), S, w, (C, heightM) => lookOnWorkers(workers, C, heightM, w))).catch(() => null);
    return out ?? draw();                                            // (no worker starts: on this thread)
}

/** The terrain on the satellite picture (terrain-look.js) with its rows on the workers: what it reads whole worked out
 *  here and sent to each once, then bands of rows, their sat views written back into C's. */
async function lookOnWorkers(workers, C, heightM, w) {
    const { L, mean, std } = lookSetup(C, heightM, w), cw = C.w, ch = C.h;
    const count = workers.length * BANDS_PER_WORKER, cut = i => Math.round(i * ch / count);
    const ranges = Array.from({ length: count }, (_, i) => [cut(i), cut(i + 1)]).filter(([a, b]) => b > a);
    const views = [C.sat.year, C.sat.jan, C.sat.jul];
    let next = 0, done = 0;
    const noise = new FastNoise(C.mottleSeed);                          // (as each worker's)
    const sharedL = sharedAll(L);                                       // (copied once for all, where memory is shared)
    await new Promise((resolve, reject) => {
        const take = () => (next < ranges.length ? next++ : -1);
        const band = i => { const [y0, y1] = ranges[i]; return { ...lookBand(C, y0, y1, true), mean: mean.slice(y0 * cw, y1 * cw), std: std.slice(y0 * cw, y1 * cw) }; };
        const got = (i, sat) => {
            for (let v = 0; v < 3; v++) views[v].set(sat[v], 3 * ranges[i][0] * cw);
            done++;
            if (done === ranges.length) resolve();
        };
        const give = wk => { const i = take(); if (i < 0) return; const B = band(i); wk.post({ type: 'look', i, y0: ranges[i][0], y1: ranges[i][1], B }, bandBuffers(B)); };
        for (const wk of workers) {
            wk.listen(msg => {
                if (msg.type === 'error') { reject(new Error(`raster worker: ${msg.message}`)); return; }
                if (msg.type !== 'lookDone') return;
                got(msg.i, msg.sat);
                give(wk);
            });
            wk.onCrash(m => reject(new Error(`raster worker stopped (${m})`)));
            wk.post({ type: 'lookShare', L: sharedL, seed: C.mottleSeed });
            give(wk); give(wk);
        }
        alsoHere(take, i => { const B = band(i); lookRows(L, B, ranges[i][0], ranges[i][1], noise); got(i, B.sat); }, reject);
    });
}

/** What a worker needs of S: the mesh's arrays and its index's table (not rebuilt), and only the fields read per pixel.
 *  Where memory is shared, over it: the mesh's kept from finish to finish, the fields copied once for all workers. */
function workerShare(S) {
    const { mesh, ...fields } = workerFields(S);
    return { ...sharedAll(fields), mesh: sharedAll(mesh, true) };
}
function workerFields(S) {
    const { mesh, z, ocean, lake, lakeLevel, climate: C, geology: G, farming: F, pond } = S;
    const climate = C && { tAnnual: C.tAnnual, pAnnual: C.pAnnual, koppen: C.koppen, stats: C.stats, sat: C.sat, ripSat: C.ripSat, cover: C.cover, flow: C.flow, young: C.young, mottleSeed: C.mottleSeed };
    const farming = F && { ...Object.fromEntries([...FARM_KEYS, 'kind'].map(k => [k, F[k]])), ...(F.crops ? { crops: F.crops } : {}) };
    return {
        mesh: { numCells: mesh.numCells, xyz: mesh.xyz, adjOffset: mesh.adjOffset, adjList: mesh.adjList, edgeKm: mesh.edgeKm, res: mesh.index.res, table: mesh.index.table },
        z, ocean, lake, lakeLevel, climate, geology: G && { rock: G.rock, rec: G.rec, simCells: G.simCells }, farming, pond: pond && { share: pond.share, seed: pond.seed },
    };
}

/** A worker's S from what workerShare sent: the index the same table over the same arrays, so every lookup alike. */
export function shareToState(sh) {
    const m = sh.mesh, index = Object.assign(Object.create(SphereIndex.prototype), { xyz: m.xyz, adjOffset: m.adjOffset, adjList: m.adjList, res: m.res, table: m.table });
    return { ...sh, mesh: { ...m, index }, got: null, keep: null };
}

/** The picture's bands drawn on W workers, then `after(bands, workers)` while they still run — its result, theirs ended. */
async function onWorkers(S, w, W, onRow, after) {
    const h = w >> 1, { f } = climateWidth(w, S.climate), step = Math.max(1, f);
    const count = W * BANDS_PER_WORKER, cut = i => Math.round(i * h / count / step) * step;
    const ranges = Array.from({ length: count }, (_, i) => [cut(i), i + 1 === count ? h : cut(i + 1)]).filter(([a, b]) => b > a);
    const workers = await Promise.all(Array.from({ length: W }, () => spawn('../finish/raster-worker.js')));
    try {
        const share = workerShare(S), out = new Array(ranges.length);
        let next = 0, done = 0;
        await new Promise((resolve, reject) => {
            const take = () => (next < ranges.length ? next++ : -1);
            const got = (i, B) => {
                out[i] = B;
                done++;                                          // (not inside onRow?.(): with no onRow it never counts)
                onRow?.(done / ranges.length);
                if (done === ranges.length) resolve();
            };
            const give = wk => { const i = take(); if (i >= 0) wk.post({ type: 'band', i, w, py0: ranges[i][0], py1: ranges[i][1] }); };
            for (const wk of workers) {
                wk.listen(msg => {
                    if (msg.type === 'error') { reject(new Error(`raster worker: ${msg.message}`)); return; }
                    if (msg.type !== 'done') return;
                    got(msg.i, msg.B);
                    give(wk);
                });
                wk.onCrash(m => reject(new Error(`raster worker stopped (${m})`)));
                wk.hold(true);
                wk.post({ type: 'share', share });
                give(wk); give(wk);                              // (one waiting, for while this thread draws)
            }
            alsoHere(take, i => got(i, rasterBand(S, w, ranges[i][0], ranges[i][1])), reject);
        });
        return await after(out, workers);
    } finally { for (const wk of workers) wk.terminate(); }
}

/** This thread draws bands too while the workers do (it holds all they were sent, uncopied): `take()` the next band or
 *  −1, `draw(i)` it; between bands the workers' messages come in, and each is handed its next. */
async function alsoHere(take, draw, reject) {
    try {
        for (let i = take(); i >= 0; i = take()) { draw(i); await new Promise(r => setTimeout(r, 0)); }
    } catch (err) { reject(err); }
}

/** The bands' arrays end to end, in row order: each array of the picture is its bands' rows one after another. */
function joinBands(bands) {
    const join = parts => {
        const a = parts[0];
        if (a == null) return null;
        if (ArrayBuffer.isView(a)) {
            const all = new a.constructor(parts.reduce((s, p) => s + p.length, 0));
            let o = 0;
            for (const p of parts) { all.set(p, o); o += p.length; }
            return all;
        }
        if (Array.isArray(a)) return a.map((_, j) => join(parts.map(p => p[j])));
        return Object.fromEntries(Object.keys(a).map(k => [k, join(parts.map(p => p[k]))]));
    };
    return Object.fromEntries(Object.keys(bands[0]).map(k => [k, join(bands.map(b => b[k]))]));
}

/** The arrays of a band, for handing it over between threads. */
export function bandBuffers(B) {
    const out = [], walk = o => { if (o == null) return; if (ArrayBuffer.isView(o)) out.push(o.buffer); else if (typeof o === 'object') for (const k in o) walk(o[k]); };
    walk(B);
    return out;
}

export { rasterBand };
