// A region's worker (fork addition): builds a region from the planet's crop (region-frame.js cropPlanet) — the ground
// (region-relief.js), the sea, the erosion's rounds (region-erode.js), then the final drainage, lakes and the water each
// cell carries. In: { frame, crop, seed, rounds }. Out: { stage, f } as it goes, then { done: region } with its arrays.

import { relief, carveRivers } from './region-relief.js';
import { drainage, drain, gather, erodeRound, runoffOf } from './region-erode.js';

/** The sea: below sea level and joined to where the planet has sea. */
function seaOf(h, ocean, N) {
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
 * A dry pit smaller than `min` cells (about 150 km²) is a hollow the slopes and the wind fill, not a playa: it becomes
 * ground at its spill height. (The detail's noise leaves many such specks in dry land; real pans sit in larger basins.)
 */
function smallPansSilted(lake, h, filled, N, min) {
    const n = N * N, seen = new Uint8Array(n), q = new Int32Array(n);
    for (let s = 0; s < n; s++) {
        if (lake[s] !== 2 || seen[s]) continue;
        let a = 0, b = 0;
        q[b++] = s; seen[s] = 1;
        while (a < b) {
            const c = q[a++], i = c % N;
            for (const d of [i > 0 ? -1 : 0, i < N - 1 ? 1 : 0, c >= N ? -N : 0, c < n - N ? N : 0]) {
                const e = c + d;
                if (d && lake[e] === 2 && !seen[e]) { seen[e] = 1; q[b++] = e; }
            }
        }
        if (b < min) for (let k = 0; k < b; k++) { const c = q[k]; h[c] = Math.max(h[c], filled[c]); lake[c] = 0; }
    }
}

self.onmessage =({ data }) => {
    const { frame: F, crop, seed, rounds = 16 } = data, N = F.n, n = N * N;
    const t0 = performance.now(), say = (stage, f = 0) => self.postMessage({ stage, f });
    say('Shaping the ground');
    const g = relief(F, crop, seed, (f) => say('Shaping the ground', f));
    const inflow = carveRivers(F, crop.rivers, g, crop, seed);
    const sea = seaOf(g.h, g.ocean, N), runoff = runoffOf(g.P, g.T, sea, F.cellKm);
    const floor = new Float32Array(n);
    for (let c = 0; c < n; c++) floor[c] = g.h[c] - 1.5 * g.amp[c];
    const W = drainage(N);
    for (let r = 0; r < rounds; r++) {
        say('Carving the valleys', r / rounds);
        drain(g.h, sea, W); gather(W, runoff, inflow, sea); erodeRound(g.h, W, sea, g.lakeP, floor);
    }
    say('Finding the rivers and lakes', 1);
    drain(g.h, sea, W);
    const Q = gather(W, runoff, inflow, sea).slice();
    // lakes: the planet's, and pits still more than a metre deep where the water could keep them (wet enough, or a
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
    smallPansSilted(lake, g.h, W.filled, N, Math.max(6, Math.round(150 / (F.cellKm * F.cellKm))));
    const region = { frame: F, h: g.h, sea, lake, level, Q, rec: W.rec.slice(), T: g.T, P: g.P, rgb: g.rgb, inflow, ms: Math.round(performance.now() - t0) };
    self.postMessage({ done: region }, [region.h, region.sea, region.lake, region.level, region.Q, region.rec, region.T, region.P, region.rgb].map((a) => a.buffer));
};
