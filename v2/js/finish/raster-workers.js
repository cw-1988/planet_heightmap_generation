// The finished picture's rows on short-lived workers (finish-raster.js rasterBand): each gets the mesh and the cells'
// fields once — a copy, ~350 MB at 2.5M cells, held only while the picture is drawn — then bands of rows, the next as
// soon as one is done; the bands come back in order and are joined, and what reads the picture whole runs here.
// The same pixels as finishRaster's; where no worker starts, or the picture is small, it is finishRaster.

import { finishRaster, rasterBand, rasterFinish, climateWidth, FARM_KEYS } from './finish-raster.js';
import { spawn, defaultPoolSize } from '../terrain/terrain-pool.js';
import { SphereIndex } from '../core/sphere-index.js';

/** From these cells, the picture is drawn on workers. */
const WORKERS_FROM_CELLS = 300000;
/** At most this many: each holds its own copy of the mesh and fields while it draws. */
const MAX_WORKERS = 4;
const BANDS_PER_WORKER = 4;

/** finishRaster's picture, its rows drawn on workers — same arguments; `located` (reused cells) keeps it on this thread. */
export async function finishRasterAsync(mesh, z, ocean, w, onRow = null, lake = null, lakeLevel = null, climate = null, geology = null, farming = null, located = null, pond = null) {
    const draw = () => finishRaster(mesh, z, ocean, w, onRow, lake, lakeLevel, climate, geology, farming, located, pond);
    if (located || mesh.numCells < WORKERS_FROM_CELLS) return draw();
    const W = Math.min(MAX_WORKERS, await defaultPoolSize());
    if (W < 2) return draw();
    const S = { mesh, z, ocean, lake, lakeLevel, climate, geology, farming, pond, got: null, keep: null };
    const bands = await onWorkers(S, w, W, onRow).catch(() => null);
    if (!bands) return draw();                                       // (no worker starts: on this thread)
    return rasterFinish(joinBands(bands), S, w);
}

/** What a worker needs of S: the mesh's arrays and its index's table (not rebuilt), and only the fields read per pixel. */
function workerShare(S) {
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

async function onWorkers(S, w, W, onRow) {
    const h = w >> 1, { f } = climateWidth(w, S.climate), step = Math.max(1, f);
    const count = W * BANDS_PER_WORKER, cut = i => Math.round(i * h / count / step) * step;
    const ranges = Array.from({ length: count }, (_, i) => [cut(i), i + 1 === count ? h : cut(i + 1)]).filter(([a, b]) => b > a);
    const workers = await Promise.all(Array.from({ length: W }, () => spawn('../finish/raster-worker.js')));
    try {
        const share = workerShare(S), out = new Array(ranges.length);
        let next = 0, done = 0;
        await new Promise((resolve, reject) => {
            const give = wk => { if (next < ranges.length) { const i = next++; wk.post({ type: 'band', i, w, py0: ranges[i][0], py1: ranges[i][1] }); } };
            for (const wk of workers) {
                wk.listen(msg => {
                    if (msg.type === 'error') { reject(new Error(`raster worker: ${msg.message}`)); return; }
                    out[msg.i] = msg.B;
                    done++;                                       // (not inside onRow?.(): with no onRow it never counts)
                    onRow?.(done / ranges.length);
                    if (done === ranges.length) resolve(); else give(wk);
                });
                wk.onCrash(m => reject(new Error(`raster worker stopped (${m})`)));
                wk.hold(true);
                wk.post({ type: 'share', share });
                give(wk);
            }
        });
        return out;
    } finally { for (const wk of workers) wk.terminate(); }
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
