// A region's wearing down (fork addition), shared by the region (region-worker.js) and its zoom tiles
// (region-tile-worker.js): the sea joined to where the source has sea, the erosion's rounds (region-erode.js), then the
// final drainage, the lakes and dry pans, and the water each cell carries.

import { drainage, drain, gather, erodeRound, runoffOf } from './region-erode.js';

/** The sea: below sea level and joined to where the source (the planet, or the region a tile refines) has sea. */
export function seaOf(h, ocean, N) {
    const n = N * N, sea = new Uint8Array(n), q = new Int32Array(n);
    let a = 0, b = 0;
    for (let c = 0; c < n; c++) if (ocean[c] >= 128 && h[c] < 0) { sea[c] = 1; q[b++] = c; }
    while (a < b) {
        const c = q[a++], i = c % N;
        for (const d of [i > 0 ? -1 : 0, i < N - 1 ? 1 : 0, c >= N ? -N : 0, c < n - N ? N : 0]) {
            const e = c + d;
            if (d && !sea[e] && h[e] < 0) { sea[e] = 1; q[b++] = e; }
        }
    }
    return sea;
}

/**
 * A pit smaller than `min` cells (about 150 km²) that is not one of the source's lakes is a hollow the slopes, the wind
 * and the water fill, not a lake or a playa: it becomes ground at its spill height. (The detail's noise leaves many such
 * specks; real lakes and pans this size sit in larger basins, which the source already holds.)
 */
function smallPitsFilled(lake, lakeP, h, filled, N, min) {
    const n = N * N, seen = new Uint8Array(n), q = new Int32Array(n);
    for (let s = 0; s < n; s++) {
        if (!lake[s] || lakeP[s] || seen[s]) continue;
        let a = 0, b = 0;
        q[b++] = s; seen[s] = 1;
        while (a < b) {
            const c = q[a++], i = c % N;
            for (const d of [i > 0 ? -1 : 0, i < N - 1 ? 1 : 0, c >= N ? -N : 0, c < n - N ? N : 0]) {
                const e = c + d;
                if (d && lake[e] && !lakeP[e] && !seen[e]) { seen[e] = 1; q[b++] = e; }
            }
        }
        if (b < min) for (let k = 0; k < b; k++) { const c = q[k]; h[c] = Math.max(h[c], filled[c]); lake[c] = 0; }
    }
}

/**
 * The ground `g` ({ h, amp, ocean, lakeP, T, P }) of frame F worn down in `rounds` rounds, the inflows ([cell, m³/s])
 * coming in: { sea, lake (1 a lake, 2 a dry pan), level, Q, rec }. g.h is changed in place. say(f) as it goes.
 */
export function wearDown(g, F, inflow, rounds, say) {
    const N = F.n, n = N * N, sea = seaOf(g.h, g.ocean, N), runoff = runoffOf(g.P, g.T, sea, F.cellKm);
    const floor = new Float32Array(n);
    for (let c = 0; c < n; c++) floor[c] = g.h[c] - 1.5 * g.amp[c];
    const W = drainage(N);
    for (let r = 0; r < rounds; r++) {
        say?.(r / rounds);
        drain(g.h, sea, W); gather(W, runoff, inflow, sea); erodeRound(g.h, W, sea, g.lakeP, floor);
    }
    drain(g.h, sea, W);
    const Q = gather(W, runoff, inflow, sea).slice();
    // lakes: the source's, and pits still more than a metre deep where the water could keep them (wet enough, or a
    // river runs in); the rest dry pans. Their surface: the filled ground.
    const lake = new Uint8Array(n), level = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (sea[c]) continue;
        const depth = W.filled[c] - g.h[c];
        if (g.lakeP[c] || depth > 1) {
            const wet = g.P[c] / Math.max(100, 300 + 55 * g.T[c]) >= 0.6 || Q[c] > 5 || g.lakeP[c];
            lake[c] = wet ? 1 : 2; level[c] = Math.max(W.filled[c], g.h[c]);
        }
    }
    smallPitsFilled(lake, g.lakeP, g.h, W.filled, N, Math.max(6, Math.round(150 / (F.cellKm * F.cellKm))));
    return { sea, lake, level, Q, rec: W.rec.slice() };
}

/** A region's arrays for a transfer list. */
export const regionBuffers = (r) => [r.h, r.sea, r.lake, r.level, r.Q, r.rec, r.T, r.P, r.rgb].map((a) => a.buffer);
