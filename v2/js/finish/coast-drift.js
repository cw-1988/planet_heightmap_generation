// The sand carried along the shore, and what it builds (docs/spits-barriers.md). Waves striking a coast at an angle move
// its sand along it (longshore drift: its rate ~ sin 2θ of their energy's mean direction against the shore — the drivers
// waveE, waveN, finish-coast.js). Where the coast turns away — a headland, a bay's mouth — the sand runs on straight: a
// spit, a ridge of sand growing on past the land in the drift's way, a few hundred metres wide and kilometres long. Off
// some low, sandy coasts with moderate waves and a small tide, the sand is piled into barrier islands up to a couple of
// kilometres out, a lagoon behind, broken by tidal inlets. Both on a fine window's margin grid, in place (shapeLittoral,
// littoral.js), once its pixels can hold them.

import { smoothNoise } from './lattice-noise.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = x => (x < 0 ? 0 : x > 1 ? 1 : x);

export const DRIFT = {
    // off: the spits and barriers read as dark "noodles" along the coast, the hillshade drawing each ridge as a streak
    // ("what are those other shorter noodles? please remove them", the owner, 2026-11-20; docs/spits-barriers.md)
    on: false,
    maxPxKm: 0.5,                            // drawn only where a pixel is this small (km) or smaller
    reachKm: 3.4,                              // how far from a pixel its forms read: the window's margin holds it (fine-detail.js marginPx)
    barrierKm: [0.3, 2], placeKm: 25,          // a barrier this far out (km), wandering over this length — near 0.3 it joins the land
    barrierWKm: [0.3, 0.9], barrierCrestM: [2, 4],   // its width (km) and crest (m), more where its sand and waves suit it
    stretchKm: 60, stretch: [0.1, 0.4],        // barrier coasts come in stretches: a noise this long, barriers where it passes this
    barrierSand: [0.5, 0.8], barrierWave: [0.2, 0.4],     // the sand and the waves it needs (none … all)
    barrierTide: [1.5, 3], barrierSlope: [0.002, 0.008],  // none where the tide is this big (m), the ground this steep (km per km)
    inletKm: 14, inlet: [0.55, 0.65],          // its inlets: a noise this long, an inlet where it passes this (none … all)
    lagoonM: 2,                                // the lagoon behind it filled in to this depth (m)
    dirKm: 0.5,                                // the drift's way averaged over this far (km): one way along a stretch of shore
    spitKm: 2.2, spitWKm: 0.25, spitCrestM: 2.5, // a spit: at most this long (km), this wide, its crest
    depthM: [30, 8],                           // built only in water shallower than this (m, none … all)
};
const Dr = DRIFT;

/** A box blur of f in place, r pixels each way (tmp: a scratch the same size). */
function boxBlur(f, tmp, ew, eh, r) {
    for (let j = 0; j < eh; j++) {
        const o = j * ew;
        let s = 0;
        for (let i = 0; i <= Math.min(ew - 1, r); i++) s += f[o + i];
        for (let i = 0; i < ew; i++) { tmp[o + i] = s; if (i - r >= 0) s -= f[o + i - r]; if (i + r + 1 < ew) s += f[o + i + r + 1]; }
    }
    for (let i = 0; i < ew; i++) {
        let s = 0;
        for (let j = 0; j <= Math.min(eh - 1, r); j++) s += tmp[j * ew + i];
        for (let j = 0; j < eh; j++) { f[j * ew + i] = s; if (j - r >= 0) s -= tmp[(j - r) * ew + i]; if (j + r + 1 < eh) s += tmp[(j + r + 1) * ew + i]; }
    }
}

/**
 * Spits and barrier islands into hf (km) and sea (0/1), in place. dist: the window's chamfer from its shore (km, + land,
 * − sea); K, KN: shapeLittoral's per-pixel store (beach, mud, cliff, wave, tide, reef, mangrove, sand); ctx: shapeLittoral's
 * (ew, eh, pxKm, cosLa, at, val, d, gE, gN, place, P, seed, edgeKm: how far past a drawn pixel the window reaches).
 * @returns {Float32Array|null}  each pixel's sand built (0 … 1: the colours' sand), or null where nothing can be drawn
 */
export function driftForms(hf, sea, dist, K, KN, ctx) {
    const { ew, eh, pxKm, cosLa, at, val, d, gE, gN, place, P, seed } = ctx;
    if (!Dr.on || !d.waveE || !place || pxKm > Dr.maxPxKm) return null;
    // (each form reads no further than the window's margin, so neighbouring tiles build the same forms: a form reading past
    // it was cut at the tile's edge — a straight seam)
    const avail = Math.min(Dr.reachKm, ctx.edgeKm ?? Dr.reachKm);
    const N = ew * eh, isle = new Float32Array(N), sea0 = sea.slice();
    const shallow = v => smooth(-Dr.depthM[0] / 1000, -Dr.depthM[1] / 1000, v);
    // (the drift's way along the shore at each sea pixel near it, and how much sand it carries: spits)
    const uE = new Float32Array(N), uN = new Float32Array(N), pS = new Float32Array(N), shad = new Float32Array(N).fill(NaN), Ls = new Float32Array(N);
    const sB = 1 / Dr.placeKm, sI = 1 / Dr.inletKm, sS = 1 / Dr.stretchKm, wS = Dr.spitWKm, xMax = Dr.barrierKm[1] + Dr.barrierWKm[1];
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, x = -dist[p], k = KN * p;
        if (!sea0[p] || !(x > 0) || x > Math.max(xMax, Dr.spitKm)) continue;
        const mud = K[k + 1], wave = K[k + 3], tideM = K[k + 4], reef = K[k + 5], sand = K[k + 7];
        if (!(sand > 0.3)) continue;
        at(j, i);
        const g = Math.hypot(gE[p], gN[p]), active = d.active ? val(d.active) : 0;
        // ── a barrier island: low and gentle, very sandy, waves enough to build it, a small tide — and only along some
        // stretches of such coasts (built along every one, it drew a second coastline 0.6 km off nearly all of them) ──
        const pB = smooth(Dr.barrierSand[0], Dr.barrierSand[1], sand) * smooth(Dr.barrierWave[0], Dr.barrierWave[1], wave)
            * (1 - smooth(Dr.barrierTide[0], Dr.barrierTide[1], tideM)) * (1 - smooth(Dr.barrierSlope[0], Dr.barrierSlope[1], g))
            * (1 - mud) * (1 - reef) * (1 - 0.6 * active);
        if (pB > 0.02 && x < xMax) {
            place(j, i);
            const q = pB * smooth(Dr.stretch[0], Dr.stretch[1], 0.5 + 0.5 * smoothNoise(P[0] * sS, P[1] * sS, P[2] * sS, seed * 5 + 83));
            if (q > 0.02) {
                // (its distance out wandering slowly, at its nearest joined to the land; a flat, sandy top with soft
                // shoulders — a parabola's crest and troughs at its edges shaded as two thin lines along every coast)
                const wB = Dr.barrierWKm[0] + (Dr.barrierWKm[1] - Dr.barrierWKm[0]) * q;
                const xB = Math.min(avail - 0.6 * wB, Dr.barrierKm[0] + (Dr.barrierKm[1] - Dr.barrierKm[0]) * clamp(0.5 + 0.7 * smoothNoise(P[0] * sB, P[1] * sB, P[2] * sB, seed * 5 + 81)));
                const a = (x - xB) / (0.5 * wB), w = smooth(0.02, 0.3, q) * shallow(hf[p]);
                if (a < -1) {
                    // (the lagoon behind it, filled in to a shallow depth, eased in from the island's back)
                    const t = -Dr.lagoonM / 1000;
                    if (hf[p] < t) hf[p] += (t - hf[p]) * 0.7 * w * smooth(-1, -1.8, a);
                } else if (a < 1.3) {
                    const gap = smooth(Dr.inlet[0], Dr.inlet[1], smoothNoise(P[0] * sI, P[1] * sI, P[2] * sI, seed * 5 + 82));
                    const top = (1 - smooth(0.5, 1.25, Math.abs(a))) * (1 - gap);
                    const crest = (Dr.barrierCrestM[0] + (Dr.barrierCrestM[1] - Dr.barrierCrestM[0]) * q) / 1000 * (0.8 + 0.2 * clamp(1 - a * a));
                    if (crest > hf[p]) { hf[p] += (crest - hf[p]) * top * w; if (hf[p] > 0) sea[p] = 0; }
                    if (w * top > isle[p]) isle[p] = w * top;
                }
            }
        }
        // ── the drift: waves' travel along the shore (t) and onto it (n, landward: the picture's slope uphill) ──
        if (!(g > 1e-6) || x > Dr.spitKm) continue;
        const vE = (255 * val(d.waveE) - 128) / 127, vN = (255 * val(d.waveN) - 128) / 127, nE = gE[p] / g, nN = gN[p] / g;
        const tE = nN, tN = -nE, vt = vE * tE + vN * tN, vn = vE * nE + vN * nN;
        const s = smooth(0.3, 0.6, sand) * smooth(0.05, 0.25, 2 * Math.abs(vt) * Math.max(0, vn) * wave) * (1 - mud) * (1 - 0.7 * reef);
        if (!(s > 0.02)) continue;
        pS[p] = s; uE[p] = Math.sign(vt) * tE * s; uN[p] = Math.sign(vt) * tN * s;
    }
    // ── the drift's way, averaged along the shore: read pixel by pixel it flipped and turned with each step of the
    // picture's slope, and the spits' shadows came out as speckled hatching ──
    const rB = Math.min(64, Math.max(1, Math.ceil(Dr.dirKm / pxKm))), wgt = pS.slice(), tmp = new Float32Array(N);
    boxBlur(uE, tmp, ew, eh, rB); boxBlur(uN, tmp, ew, eh, rB); boxBlur(wgt, tmp, ew, eh, rB);
    const Lmax = avail - rB * pxKm - 1.5 * wS;
    for (let p = 0; p < N; p++) {
        if (!(pS[p] > 0)) continue;
        const m = Math.hypot(uE[p], uN[p]);
        // (waves from both ways along this stretch: no one way for the sand, no spit)
        if (!(m > 0.4 * wgt[p]) || !(Lmax > 2 * pxKm)) { pS[p] = 0; continue; }
        uE[p] /= m; uN[p] /= m; Ls[p] = Math.min(Lmax, Dr.spitKm * (0.4 + 0.6 * pS[p]));
    }
    // ── the drift's shadow: how far up-drift the land is (km), straight back along the drift's way; none found, Infinity ──
    const pix = (j, i, eKm, nKm) => {
        const ii = Math.round(i + eKm / (pxKm * Math.max(0.05, cosLa[j]))), jj = Math.round(j - nKm / pxKm);
        return ii < 0 || jj < 0 || ii >= ew || jj >= eh ? -1 : jj * ew + ii;
    };
    for (let p = 0; p < N; p++) {
        if (!(pS[p] > 0)) continue;
        const j = (p / ew) | 0, i = p - j * ew, L = Ls[p], st = Math.max(0.7 * pxKm, L / 60);
        let S = Infinity;
        for (let s = st; s <= L; s += st) {
            const q = pix(j, i, -uE[p] * s, -uN[p] * s);
            if (q < 0) { S = NaN; break; }
            if (!sea0[q]) { S = s; break; }
        }
        shad[p] = S;
    }
    // ── a spit along the shadow's edge (the up-drift land's line run on), open water on one side, sea behind it ──
    const nOff = Math.min(10, Math.max(1, Math.ceil(wS / pxKm)));
    for (let p = 0; p < N; p++) {
        const S = shad[p];
        if (!(S < Infinity) || !(S > 0)) continue;
        const j = (p / ew) | 0, i = p - j * ew, nE = -uN[p], nN = uE[p];
        let db = 0, side = 0;
        for (let k = 1; k <= nOff && !side; k++) for (const sd of [1, -1]) {
            const off = k * wS / nOff, q = pix(j, i, sd * nE * off, sd * nN * off);
            if (q >= 0 && sea0[q] && shad[q] === Infinity) { db = off; side = sd; break; }
        }
        if (!side || db >= wS) continue;
        // (sea behind it: no ridge laid along the land itself)
        const lee = Math.max(pxKm, Math.min(1.5 * wS, 0.5 * S)), q = pix(j, i, -side * nE * lee, -side * nN * lee);
        if (q < 0 || !sea0[q]) continue;
        const prof = Math.sin(Math.PI * db / wS), fall = 1 - smooth(0.7, 1, S / Ls[p]), w = smooth(0.02, 0.2, pS[p]) * shallow(hf[p]);
        const zc = (Dr.spitCrestM / 1000) * prof * fall;
        if (zc > hf[p]) { hf[p] += (zc - hf[p]) * w * prof; if (hf[p] > 0) sea[p] = 0; }
        if (w * prof * fall > isle[p]) isle[p] = w * prof * fall;
    }
    return isle;
}
