// The valleys on the map's pixels (fork addition, for region-grid.js). The valleys are cut on the planet's cells (~50 km),
// and a pixel given its nearest cell's valley put every edge on a cell's straight sides: edges across slopes and plains
// with nothing under them, a summit cut through, a river's bank 20 km off its line. So each valley grows from its cells'
// centres over the finished planet's picture of heights (raster.heightM, a pixel ~20 km), lowest ground first: two
// valleys meet where their floods meet, on the ridge between them, and no flood crosses an edge river, drawn in as a
// wall the way the map draws it (region-walls.js). The cells still decide which valleys there are; the pixels where.

import { unitAt } from './region-bank.js';
import { wallMask } from './region-walls.js';

/** The valley per pixel of a W × H grid (rows from the south; −1 the sea), from V (region-basin.js) and pc (each pixel's nearest cell). */
export function floodGrid(w, V, pc, W, H) {
    const mesh = w.tMesh, { xyz } = mesh, r = w.fin.raster, n = V.unit.length, N = W * H, M = wallMask(w, V, W, H);
    const rx = (i) => Math.min(r.w - 1, Math.floor(i * r.w / W)), ry = (j) => r.h - 1 - Math.min(r.h - 1, Math.floor(j * r.h / H));
    const G = new Int32Array(N).fill(-2), h = new Int32Array(N);
    let low = Infinity;
    for (let j = 0; j < H; j++) {
        const row = ry(j) * r.w;
        for (let i = 0; i < W; i++) {
            const p = j * W + i, q = row + rx(i);
            if (r.ocean[q]) { G[p] = -1; continue; }                              // (the coast as the map draws it)
            h[p] = r.heightM[q]; low = Math.min(low, h[p]);
        }
    }
    // the seeds: each cell's centre, but an edge river's (split by its wall) and a stream's whose banks differ
    const buckets = [];
    const push = (p, lev) => (buckets[lev] ??= []).push(p);
    const seed = (p, u) => { if (G[p] === -2 && !M[p] && u >= 0) { G[p] = u; push(p, h[p] - low); } };
    for (let c = 0; c < n; c++) {
        const u = V.unit[c];
        if (u < 0) continue;
        const i = Math.min(W - 1, Math.floor((Math.atan2(xyz[3 * c + 1], xyz[3 * c]) / Math.PI + 1) / 2 * W));
        const j = Math.min(H - 1, Math.floor((Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) / Math.PI + 0.5) * H));
        if (!V.wall[c] || !V.half) { seed(j * W + i, u); continue; }
        // (a river cell: each half on its own bank — the pixels round its centre off the wall, by the bank they lie on)
        for (let b = Math.max(0, j - 1); b <= Math.min(H - 1, j + 1); b++) for (let a = i - 1; a <= i + 1; a++) {
            const p = b * W + ((a % W) + W) % W;
            if (M[p] || G[p] !== -2) continue;
            const lat = -Math.PI / 2 + (b + 0.5) / H * Math.PI, lon = (a + 0.5) / W * 2 * Math.PI - Math.PI;
            seed(p, unitAt(V, mesh, c, Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)));
        }
    }
    // the flood, lowest first (a pixel reached over a higher one waits at that height: a basin fills to its rim)
    for (let lev = 0; lev < buckets.length; lev++) {
        const b = buckets[lev];
        if (!b) continue;
        for (let k = 0; k < b.length; k++) {
            const p = b[k], u = G[p], i = p % W, j = (p - i) / W;
            const go = (q) => { if (G[q] === -2 && !M[q]) { G[q] = u; push(q, Math.max(lev, h[q] - low)); } };
            go(j * W + (i + 1) % W); go(j * W + (i + W - 1) % W);
            if (j > 0) go(p - W);
            if (j < H - 1) go(p + W);
        }
        buckets[lev] = null;
    }
    // the walls' own pixels to the valley beside them most; what no flood reached (a pocket shut in by walls) off its cell
    // (a pass's votes applied after it, so a wall's label never runs along its own line)
    for (let pass = 0, set = []; pass < 4; pass++, set.length = 0) {
        for (let p = 0; p < N; p++) {
            if (G[p] !== -2 || !M[p]) continue;
            const i = p % W, j = (p - i) / W, seen = new Map();
            const vote = (q) => { if (G[q] >= 0) seen.set(G[q], (seen.get(G[q]) ?? 0) + 1); };
            vote(j * W + (i + 1) % W); vote(j * W + (i + W - 1) % W);
            if (j > 0) vote(p - W);
            if (j < H - 1) vote(p + W);
            let best = -2, most = 0;
            for (const [u, k] of seen) if (k > most) { most = k; best = u; }
            if (best >= 0) set.push(p, best);
        }
        if (!set.length) break;
        for (let k = 0; k < set.length; k += 2) G[set[k]] = set[k + 1];
    }
    for (let p = 0; p < N; p++) {
        if (G[p] !== -2) continue;
        const c = pc[p], i = p % W, j = (p - i) / W, lat = -Math.PI / 2 + (j + 0.5) / H * Math.PI, lon = (i + 0.5) / W * 2 * Math.PI - Math.PI;
        G[p] = V.wall[c] ? unitAt(V, mesh, c, Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)) : V.unit[c];
        if (G[p] < 0) G[p] = -1;
    }
    return G;
}
