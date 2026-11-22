// A region's ground before erosion (fork addition): the planet's heights read smoothly (bicubic) at each cell, with the
// detail the planet is too coarse to hold — noise from about the planet's own pixel down to two cells, warped, rolling
// on the plains and ridged in the mountains, each wave as steep as the land's kind (detailOf), so hills show at any
// cell size. With the planet's generator drawn again at the region's detail (region-synth.js) that detail is the
// generator's own (its spurs and ridges, where the planet put its mountains), and the noise draws only the waves finer
// than the generator's grid. The noise is read on the sphere, so two regions
// that overlap agree. The planet's rivers are cut in as shallow, wandering valleys, and where one enters the box from
// outside its water is handed in as an inflow. Each cell also takes the planet's climate (the year's temperature, set
// down the lapse rate for the detail, and rain) and its colour from space.

import { placeAt, cellXY, pixelOf, bicubic, bilinearIf, R } from './region-frame.js';
import { FastNoise } from '../core/fast-noise.js';
import { gridAt } from './region-synth.js';

const D = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The detail by the ground's height `b` (m) and its roughness `k` (0.3 … 1.6, a slow noise: some plains flat, some
 * hilly): `slope` the typical slope each wave of it has (tan: ~2° on plains, ~6° in hill country, 20°+ in the
 * mountains), so the short waves show as hills; `relief` the most any one wave may rise (m), so the long waves don't
 * lift the plains. A little on the sea floor, eased into the land's over the first 60 m (a step there was a step in
 * the ground, seen wherever the detail moved the coast off the line where `b` is 0).
 */
export function detailOf(b, k, out) {
    if (b <= 0) { out.slope = 0.01; out.relief = 15; return out; }
    const deg = (2 + 4 * smooth(100, 900, b) + 16 * smooth(900, 2600, b)) * k, t = smooth(0, 60, b);
    out.slope = 0.01 + t * (Math.tan(Math.min(35, deg) * D) - 0.01);
    out.relief = 15 + t * ((30 + 0.3 * b + 0.3 * Math.max(0, b - 1000)) * k - 15);
    return out;
}
const NO_T = -32768;
// (detailWaves: the octaves under the broad warp — 1, ½, ¼ of the ladder's top — and the finer ones' warp strength,
// its amplitude times its frequency: 0.35 stretched the ground ~2.15 : 1 in the median, 0.1 stretches it ~1.34 : 1)
export const WIDE = 3;
const FINE_WARP = 0.1;
// (`vary`'s turns, one per octave: octaves of one lattice, each twice the last, line their lattices up, and the
// hillshade drew rows of even ripples — a washboard)
const ROTS = Array.from({ length: 17 }, (_, o) => {
    const a = 2.39996 * o, b = 1.1 * o + 0.6, c = 0.71 * o, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return [ca * cc - sa * cb * sc, -ca * sc - sa * cb * cc, sa * sb, sa * cc + ca * cb * sc, -sa * sc + ca * cb * cc, -ca * sb, sb * sc, sb * cc, cb];
});

/** One octave's noise (seeded), turned its own way (ROTS): fn(x, y, z, o, f) at a point on the sphere (km), at frequency f. */
export function turnedNoise(seed) {
    const noise = new FastNoise(seed);
    return (x, y, z, o, f) => {
        const q = ROTS[o];
        return noise.noise3D((q[0] * x + q[1] * y + q[2] * z) * f + 0.37 * o, (q[3] * x + q[4] * y + q[5] * z) * f, (q[6] * x + q[7] * y + q[8] * z) * f);
    };
}

/**
 * The detail's waves (seeded): fn(px, py, pz, b, L, o0, o1, out) at a point on the sphere (km) over ground `b` m high,
 * octaves o0 … o1 of the ladder L ({ top: the longest wave, km; s1: the roughness noise's frequency }), each wave
 * halving: out.d the height they add (m), out.A their summed height. A zoom tile (region-refine.js) goes on down the
 * same ladder from where its region stopped, so its detail is the region's own, only finer. `wts` (optional): each
 * octave's weight by its index (the world map's tiles fade each in by their pixel, fine-ladder.js). `ridgedTo`: the
 * mountains' ridged waves only in the octaves under it (the world map passes 0: their creases drew noodles up close);
 * out.m, out.slope and out.relief give what those are drawn by. `vary` (the world map's; a region's erosion breaks the
 * evenness itself): each octave turned its own way, and the rolling waves' roughness patchy. `fineWarp`: the finer
 * octaves' warp (the world map's 0: up close its bends drew every small wave out into a worm); `rolling` (the world
 * map's): plain fractal noise everywhere — rolling waves on the mountains too, no ridges (their creases wandered as
 * noodles up close), no patchy roughness (its edges followed the contours). `broadTo`: the octaves under the broad warp
 * (the world map's 0: its bends drew the waves into worms, swirls on the hills).
 */
export function detailWaves(seed, vary = false, { fineWarp = FINE_WARP, rolling = false, broadTo = WIDE } = {}) {
    const noise = new FastNoise(seed), warp = new FastNoise(seed + 7), rough = new FastNoise(seed + 29), det = { slope: 0, relief: 0 };
    const warp2 = new FastNoise(seed + 11), hist = new Float32Array(17);
    const nz = vary ? turnedNoise(seed) : (x, y, z, o, f) => noise.noise3D(x * f, y * f, z * f);
    return (px, py, pz, b, L, o0, o1, out, wts = null, ridgedTo = Infinity) => {
        const top = L.top, s0 = 1 / top, s1 = L.s1;
        // (the widest waves warped by a third of the widest — the coasts' and hills' broad shapes; each wave as tall as
        // its length times the slope wanted, a quarter for a wave's mean slope, a little less as they add; none taller
        // than the relief)
        let wx = 0, wy = 0, wz = 0, gx = 0, gy = 0, gz = 0;
        if (o0 < broadTo) {
            wx = px + 0.35 * top * warp.noise3D(px * s0, py * s0, pz * s0); wy = py + 0.35 * top * warp.noise3D(py * s0 + 31.7, pz * s0, px * s0);
            wz = pz + 0.35 * top * warp.noise3D(pz * s0 - 17.3, px * s0, py * s0);
        }
        // (the finer ones under a weak warp of their own: that one stretches the ground 2 : 1 in half the places and 9 : 1
        // in some, and every small wave under it was drawn out into a streak — brushed, swirling ground up close.
        // This one stretches it ~1.3 : 1, under 2 : 1 nearly everywhere)
        const k = rolling ? 1 : 0.3 + 1.3 * smooth(-0.5, 0.5, rough.noise3D(px * s1 / 6, py * s1 / 6, pz * s1 / 6)), dt = detailOf(b, k, det), m = rolling ? 0 : smooth(500, 2200, b);
        const rEnd = Math.min(o1, ridgedTo);
        gx = px; gy = py; gz = pz;
        if (fineWarp > 0 && (o1 > broadTo ||(m > 0 && o0 < rEnd))) {
            const s8 = 8 * s0, a8 = fineWarp * top / 8;
            gx = px + a8 * warp2.noise3D(px * s8, py * s8, pz * s8); gy = py + a8 * warp2.noise3D(py * s8 + 31.7, pz * s8, px * s8);
            gz = pz + a8 * warp2.noise3D(pz * s8 - 17.3, px * s8, py * s8);
        }
        let d = 0, A = 0, f = s0 * 2 ** o0, lam = top * 1000 / 2 ** o0;
        for (let o = o0; o < o1; o++, f *= 2, lam /= 2) {
            const v = o < broadTo ? nz(wx, wy, wz, o, f) : nz(gx, gy, gz, o, f);
            const a = Math.min(dt.relief, dt.slope * lam / 5) * (wts ? wts[o] : 1);
            // (the mountains' ridges under the weak warp only, the widest too: under the broad one every ridge bent into a
            // worm — the coasts keep it, in the rolling waves)
            let rr = 0;
            // (on the world map, `vary`, the crest rounded — |u| eased to √(u² + ε²) − ε: a creased crest drew a hairline in the
            // hillshade a pixel wide at every zoom; a region's erosion rounds its own. Its mean r² 0.112 higher: the offset with it)
            if (m > 0 && o < rEnd) { const u = o < broadTo ? nz(gx, gy, gz, o, f) : v, r = 1 - (vary ? Math.sqrt(u * u + 0.0144) - 0.12 : Math.abs(u)); rr = 1.6 * (r * r - (vary ? 0.5615 : 0.45)); }
            // (`vary`, the world map's: a rolling wave rougher on the highs of the one two octaves up, smoother in its lows)
            hist[o] = v;
            const g = vary && !rolling && o - 2 >= o0 ? 1.8 * smooth(-0.5, 0.3, hist[o - 2]) : 1;
            d += a * ((1 - m) * g * v + m * rr); A += a;
        }
        out.d = d; out.A = A; out.m = m; out.slope = dt.slope; out.relief = dt.relief;
        return out;
    };
}

/**
 * The ground of frame F from the planet's crop: { h (m), amp (the detail's height, m), ocean (the planet's sea there,
 * 0…1 × 255), lakeP (a planet lake), T (°C), P (mm a year), rgb (3 a cell), waves (the detail's ladder and how far down
 * it went: { top, s1, oct }) }. progress(f) now and then.
 */
export function relief(F, crop, seed, progress, gen = null) {
    const N = F.n, n = N * N, Hc = crop.height, C = crop.climate;
    const h = new Float32Array(n), amp = new Float32Array(n), ocean = new Uint8Array(n), lakeP = new Uint8Array(n);
    const T = new Float32Array(n), P = new Float32Array(n), rgb = new Uint8Array(3 * n);
    // (with the generator's detail (region-synth.js) the noise draws only the waves finer than its grid holds)
    const pxKm = 2 * Math.PI * R / Hc.W, top = gen ? Math.min(2.5 * pxKm, 3 * gen.cellKm) : 2.5 * pxKm;
    const oct = Math.max(1, Math.min(11, Math.ceil(Math.log2(top / (2 * F.cellKm))))), L = { top, s1: 1 / (2.5 * pxKm), oct };
    const waves = detailWaves(seed), wv = { d: 0, A: 0 }, xy = [0, 0];
    const ll = [0, 0], q = [0, 0], qc = [0, 0], all = () => true, okT = C ? (k) => C.tAnnual[k] !== NO_T : all;
    const gk = gen ? gen.m / N : 0;
    // (the colours from space are black on the planet's sea: a cell its land reaches past takes the nearest land's)
    const bare = new Uint8Array(n), okSat = C?.sat ? (k) => C.sat[3 * k] + C.sat[3 * k + 1] + C.sat[3 * k + 2] > 12 : all;
    let lastT = 15, lastP = 500;
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
            const c = j * N + i;
            cellXY(F, i, j, xy); placeAt(F, xy[0], xy[1], ll);
            pixelOf(Hc, ll[0], ll[1], q);
            const b = bicubic(Hc.heightM, Hc.w, Hc.h, q[0], q[1]);
            const oc = bilinearIf(Hc.ocean, Hc.w, Hc.h, q[0], q[1], all);
            ocean[c] = Math.round(255 * Math.min(1, oc));
            if (Hc.water && bilinearIf(Hc.water, Hc.w, Hc.h, q[0], q[1], (k) => true, 1) > 0.5 && oc < 0.5) lakeP[c] = 1;
            // the detail: on the sphere (km)
            const cl = Math.cos(ll[0] * D);
            waves(R * cl * Math.cos(ll[1] * D), R * cl * Math.sin(ll[1] * D), R * Math.sin(ll[0] * D), b, L, 0, oct, wv);
            let d = wv.d;
            const A = wv.A, gd = gen ? gridAt(gen.d, gen.m, (i + 0.5) * gk, (j + 0.5) * gk) : 0;
            h[c] = b + d + gd; amp[c] = A + Math.abs(gd); d += gd;
            // the climate: the planet's, the detail's height set down the lapse rate
            if (C) {
                pixelOf(C, ll[0], ll[1], qc);
                const t = bilinearIf(C.tAnnual, C.w, C.h, qc[0], qc[1], okT), p = bilinearIf(C.pAnnual, C.w, C.h, qc[0], qc[1], okT);
                if (t === t) lastT = t / 100; if (p === p) lastP = p;
                if (C.sat) for (let k = 0; k < 3; k++) { const v = bilinearIf(C.sat, C.w, C.h, qc[0], qc[1], okSat, 3, k); if (v === v) rgb[3 * c + k] = v; else bare[c] = 1; }
            }
            T[c] = lastT - 0.0065 * d; P[c] = lastP;
        }
        if ((j & 63) === 63) progress?.(j / N);
    }
    if (C?.sat) nearestFill(rgb, bare, N);
    return { h, amp, ocean, lakeP, T, P, rgb, waves: L };
}

/** Each `bare` cell takes the colour of the nearest cell that has one (a breadth-first spread). */
function nearestFill(rgb, bare, N) {
    const n = N * N, q = new Int32Array(n);
    let a = 0, b = 0;
    for (let c = 0; c < n; c++) if (!bare[c]) q[b++] = c;
    if (!b) return;
    while (a < b) {
        const c = q[a++], i = c % N;
        for (const d of [i > 0 ? -1 : 0, i < N - 1 ? 1 : 0, c >= N ? -N : 0, c < n - N ? N : 0]) {
            const e = c + d;
            if (!d || !bare[e]) continue;
            bare[e] = 0; rgb[3 * e] = rgb[3 * c]; rgb[3 * e + 1] = rgb[3 * c + 1]; rgb[3 * e + 2] = rgb[3 * c + 2]; q[b++] = e;
        }
    }
}

/**
 * The planet's rivers cut into `g.h` as valleys (a few metres to some tens, wider down the river, wandering by a third
 * of `pxKm`, the source's pixel, unless `wanderKm` says otherwise), and each river that comes into the box from
 * outside: [cell, m³/s] a little inside its edge. The rivers' points are x, y km in the frame's projection (a frame off
 * its centre, ox/oy, is a zoom tile's; its rivers are the region's drawn lines, cut where they are drawn: wanderKm 0).
 */
export function carveRivers(F, rivers, g, pxKm, seed, wanderKm = 0.35 * pxKm) {
    const N = F.n, half = F.km / 2, inner = half * 0.97, cut = new Float32Array(N * N), wander = new FastNoise(seed + 13), inflow = [];
    const { start, q } = rivers, ox = F.ox ?? 0, oy = F.oy ?? 0, x = rivers.x.map((v) => v - ox), y = rivers.y.map((v) => v - oy), starts = [...start, x.length];
    const inside = (k) => Math.abs(x[k]) < inner && Math.abs(y[k]) < inner;
    const cellOf = (cx, cy) => {
        const i = Math.floor((cx + half) / F.cellKm), j = Math.floor((half - cy) / F.cellKm);
        return i >= 0 && j >= 0 && i < N && j < N ? j * N + i : -1;
    };
    for (let s = 0; s < starts.length - 1; s++) {
        for (let k = starts[s]; k < starts[s + 1] - 1; k++) {
            if (k > starts[s] && inside(k) && !inside(k - 1)) { const c = cellOf(x[k], y[k]); if (c >= 0) inflow.push([c, q[k - 1]]); }
            const x0 = x[k], y0 = y[k], x1 = x[k + 1], y1 = y[k + 1], len = Math.hypot(x1 - x0, y1 - y0);
            if (!len || (Math.abs(x0) > half + 20 && Math.abs(x1) > half + 20) || (Math.abs(y0) > half + 20 && Math.abs(y1) > half + 20)) continue;
            const Q = Math.max(1, q[k]), depth = 8 + 10 * Math.log10(Q), hw = 0.3 + 0.4 * Math.log10(Q), rc = Math.max(1.2, hw / F.cellKm);
            const steps = Math.ceil(len / (0.5 * F.cellKm)), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
            for (let t = 0; t <= steps; t++) {
                let cx = x0 + (x1 - x0) * t / steps, cy = y0 + (y1 - y0) * t / steps;
                const off = wanderKm ? wanderKm * wander.noise3D(cx / pxKm, cy / pxKm, 0.5) : 0;
                cx += nx * off; cy += ny * off;
                const fi = (cx + half) / F.cellKm - 0.5, fj = (half - cy) / F.cellKm - 0.5, r = Math.ceil(rc);
                for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                    const i = Math.round(fi) + di, j = Math.round(fj) + dj;
                    if (i < 0 || j < 0 || i >= N || j >= N) continue;
                    const dd = Math.hypot(i - fi, j - fj) / rc;
                    if (dd >= 1) continue;
                    const c = j * N + i, v = depth * (1 - dd * dd);
                    if (v > cut[c]) cut[c] = v;
                }
            }
        }
    }
    for (let c = 0; c < N * N; c++) if (cut[c] && g.ocean[c] < 128) { g.h[c] -= cut[c]; g.amp[c] += cut[c]; }
    return inflow;
}
