// What the world map's ground ladder (finish/fine-ladder.js) costs a zoom tile, and what reading its broad octaves on the
// planet's grid changes (docs/world-map-detail.md): one 256-pixel tile window at each level, every octave per pixel against
// the grid, timed and compared, and two tiles side by side checked to agree where their margins overlap.
//
//   node v2/tools/bench-fine-ladder.mjs [--levels 9,12,14] [--runs 5]
//
// The ground is made up (smooth hills of 0 … 2 km with some sea, read by the planet's pixel), the same for both tiles.

import { fineLadder } from '../js/finish/fine-ladder.js';
import { fadeFor } from '../js/finish/pixel-fade.js';
import { marginPx } from '../js/finish/fine-detail.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const levels = arg('--levels', '9,12,14').split(',').map(Number), runs = +arg('--runs', 5);
const R = 6371, TAU = 2 * Math.PI, D2R = Math.PI / 180, RW = 4096, picKm = TAU * R / RW, seed = 799224;

/** The window (x0, y0, 256 × 256 and its margin) at a level: its inputs to fineLadder. */
function windowAt(L, x0, y0) {
    const W = 256 * 2 ** L, HE = W >> 1, pxKm = TAU * R / W, M = marginPx(pxKm), ew = 256 + 2 * M, eh = ew, X0 = x0 - M, Y0 = y0 - M, N = ew * eh;
    const cosLa = new Float64Array(eh), sinLa = new Float64Array(eh), cosLo = new Float64Array(ew), sinLo = new Float64Array(ew);
    const lat = new Float64Array(eh), lon = new Float64Array(ew);
    for (let j = 0; j < eh; j++) { const Y = Math.min(HE - 1, Math.max(0, Y0 + j)); lat[j] = (90 - (Y + 0.5) * 180 / HE) * D2R; cosLa[j] = Math.cos(lat[j]); sinLa[j] = Math.sin(lat[j]); }
    for (let i = 0; i < ew; i++) { lon[i] = ((X0 + i + 0.5) * 360 / W - 180) * D2R; cosLo[i] = Math.cos(lon[i]); sinLo[i] = Math.sin(lon[i]); }
    // (hills a few picture pixels across, through the coast: the same height at a place in every window)
    const hb = new Float32Array(N), gE = new Float32Array(N), gN = new Float32Array(N), k = R / (3 * picKm);
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, a = lon[i] * k, b = lat[j] * k;
        hb[p] = 0.8 + 1.2 * Math.sin(a) * Math.cos(1.3 * b) + 0.3 * Math.sin(2.7 * a + b);
        gE[p] = 0.01 * Math.cos(a); gN[p] = 0.01 * Math.sin(b);
    }
    return { hb, gE, gN, cosLa, sinLa, cosLo, sinLo, ew, eh, picKm, seed, fade: fadeFor(pxKm), W, X0, Y0, pxKm, M };
}

const run = (o, grid) => { const D = new Float32Array(o.ew * o.eh); fineLadder(D, { ...o, grid }); return D; };
const time = (o, grid) => { let best = Infinity, D; for (let r = 0; r < runs; r++) { const t = performance.now(); D = run(o, grid); best = Math.min(best, performance.now() - t); } return { best, D }; };

for (const L of levels) {
    const W = 256 * 2 ** L, x0 = Math.floor(W * 0.537 / 256) * 256, y0 = Math.floor((W >> 1) * 0.41 / 256) * 256;
    const A = windowAt(L, x0, y0), ex = time(A, false), gr = time(A, true);
    let s2 = 0, e2 = 0, emax = 0;
    for (let p = 0; p < ex.D.length; p++) { s2 += ex.D[p] ** 2; const e = Math.abs(gr.D[p] - ex.D[p]); e2 += e * e; emax = Math.max(emax, e); }
    const rms = Math.sqrt(s2 / ex.D.length);
    // (the tile to the right: its margin's left columns overlap A's last ones)
    const B = windowAt(L, x0 + 256, y0), DB = run(B, true), M = A.M;
    let seam = 0, seen = 0;
    for (let j = 0; j < A.eh; j++) for (let i = 0; i < A.ew; i++) {
        const X = A.X0 + i, ib = X - B.X0;
        if (ib < 0 || ib >= B.ew) continue;
        seam = Math.max(seam, Math.abs(gr.D[j * A.ew + i] - DB[j * B.ew + ib])); seen++;
    }
    console.log(`level ${L} (${(1000 * A.pxKm).toFixed(1)} m a pixel, margin ${M}): per pixel ${ex.best.toFixed(1)} ms, grid ${gr.best.toFixed(1)} ms` +
        ` · grid − per pixel: rms ${(Math.sqrt(e2 / ex.D.length) / rms * 100).toFixed(2)}% of the ladder's rms (${(1000 * rms).toFixed(2)} m), max ${(1000 * emax).toFixed(3)} m` +
        ` · seam with the next tile: max ${(1000 * seam).toFixed(4)} m over ${seen} pixels`);
}
