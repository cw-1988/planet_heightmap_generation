// The rivers' meanders (fork addition; docs/world-map-detail.md): each river's smoothed line (river-valleys.js
// riverParts) bent to either side by waves read along its own length — a wave of every size from MEANDER.top down to
// what the river's width allows, each as wide as a share of its length, each faded in as the pixels hold it (the same
// fade as the ground's) — so up close a river winds at every zoom instead of running straight between the planet's
// points. The page's drawn line (river-draw.js, bendSegment) and the valley cut under it (river-valleys.js carveValleys,
// its distance from the bent line by meanderAt) both bend by this, so the valley follows the line.
//   · The waves' phase is the distance along the river (km from its first point), their lengths fixed: continuous along
//     the river whatever its flow does. (A wave length set by the flow, times a distance thousands of km long, turned the
//     least change of the flow into thousands of waves: zigzags.)
//   · Each point moves along the line's normal, blended between the segment's two ends (the same at a shared point
//     from either side: no gap at the joints).
//   · Each reach's waves ease to nothing at both its ends (pinAt, over the widest wave): a confluence and a mouth are
//     shared points of two lines with waves of their own, so unpinned, each line's end swung its own way — the tributary
//     stopped kilometres short of the trunk, and its valley with it (2026-11-20).

//   · By the laws (river-hydraulics.js, 2026-11-20): the shortest wave is a bend's, 10.9 channel widths, and every wave
//     swings 1.35 / 10.9 of its length to a side (a belt 2.7 widths across); a river on a slope above Leopold & Wolman's
//     threshold (a braided river, a torrent) loses its own bends — the waves within a few of a bend's length — and keeps
//     the longer ones, its valley's. (Before: waves down to 0.05 km · √q, each swinging 0.2 of its length, everywhere.)

import { channelKm, MEANDER_LAW, meanderShare } from './river-hydraulics.js';

const TEX_W = 2048, KM = 2 * Math.PI * 6371 / TEX_W;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The meanders (km): the widest wave (the valley's bends), how far a wave swings (a share of its length) and the river's
 *  own bend (perWidth channel widths: the shortest wave) — river-hydraulics.js MEANDER_LAW. */
export const MEANDER = { top: 16, share: MEANDER_LAW.share, perWidth: MEANDER_LAW.perWidth };
/** A river's own bend (km): the shortest wave it has. */
const bendKm = q => MEANDER.perWidth * channelKm(q);
/** The most a line may move (km): every wave at its widest swing. */
export const MEANDER_PAD_KM = 2 * MEANDER.share * MEANDER.top;

const grad = (i, s) => {
    let h = Math.imul(i ^ Math.imul(s, 0x27d4eb2d), 0x9e3779b1);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    return (h >>> 0) / 2147483648 - 1;
};
/** Smooth 1-D gradient noise, −1 … 1, one wave a unit: its value into out[0], its slope (per unit) into out[1]. */
function noise1(x, s, out) {
    const i = Math.floor(x), f = x - i, g0 = grad(i, s), g1 = grad(i + 1, s), a = g0 * f, b = g1 * (f - 1);
    const u = f * f * f * (f * (f * 6 - 15) + 10), du = 30 * f * f * (f - 1) * (f - 1);
    out[0] = 2 * (a + u * (b - a)); out[1] = 2 * (g0 + du * (b - a) + u * (g1 - g0));
}

const nz = [0, 0];
/** How much of the waves a reach `end` km long keeps at `s` km along it (0 at both ends, 1 a widest wave in), and its
 *  slope per km. */
function pinAt(s, end, out) {
    const T = Math.min(MEANDER.top, end / 2);
    if (!(T > 0)) { out[0] = 0; out[1] = 0; return out; }
    const a = Math.min(1, Math.max(0, s / T)), b = Math.min(1, Math.max(0, (end - s) / T));
    const fa = a * a * (3 - 2 * a), fb = b * b * (3 - 2 * b), da = s > 0 && s < T ? 6 * a * (1 - a) / T : 0, db = end - s > 0 && end - s < T ? -6 * b * (1 - b) / T : 0;
    out[0] = fa * fb; out[1] = da * fb + fa * db;
    return out;
}
const pin = [0, 0];
/**
 * How far the river moves to its side (km) at `s` km along a reach `end` km long, carrying `q` m³/s down `slope` (m/m),
 * into out[0], and how fast that changes along it (km per km) into out[1]; `fade(λ km)` as the window's pixels hold a wave.
 */
export function meanderAt(s, end, q, slope, seed, fade, out) {
    const small = bendKm(q), own = meanderShare(q, slope);
    out[0] = 0; out[1] = 0;
    for (let o = 0, lam = MEANDER.top; o < 16; o++, lam /= 2) {
        // (the river's own bends, within a few of its bend's length, only as far as its slope lets it meander)
        const w = fade(lam) * smooth(small, 2 * small, lam) * (own + (1 - own) * smooth(3 * small, 8 * small, lam));
        if (!(w > 0)) break;
        noise1(s / lam + 0.618 * o, seed * 31 + o, nz);
        out[0] += w * MEANDER.share * lam * nz[0]; out[1] += w * MEANDER.share * nz[1];
    }
    pinAt(s, end, pin);
    out[1] = out[1] * pin[0] + out[0] * pin[1]; out[0] *= pin[0];
    return out;
}
const one = [0, 0];
/** meanderAt's offset alone (km). */
export const meanderOffset = (s, end, q, slope, seed, fade) => meanderAt(s, end, q, slope, seed, fade, one)[0];
/** The most any line moves in a window of this fade (km): every wave the pixels hold at its widest swing. */
export function meanderSwing(fade) {
    let d = 0;
    for (let o = 0, lam = MEANDER.top; o < 16; o++, lam /= 2) d += fade(lam) * MEANDER.share * lam;
    return d;
}

/** The step a window of `pxKm` pixels cuts a line of flow `q` into (km): ~24 to its shortest wave, no less than 1.5 px
 *  (fewer drew the meanders' bends as corners up close). */
const stepKm = (q, pxKm) => Math.max(Math.max(bendKm(q), 6 * pxKm) / 24, 1.5 * pxKm);

/**
 * One segment's bent line on the 2048-wide texture, from t0 to t1 (0 … 1 along it): emit(x, y, q) at each point after
 * t0 (and at t0 too with `withStart`). `g` the lines' array, `o` the segment's first entry (river-valleys.js LINE:
 * x0 y0 x1 y1 q0 q1 s0 s1 n0x n0y n1x n1y seed … sEnd S0 S1 …), `pxKm` the window's pixel, `fade` its fade.
 */
export function bendSegment(g, o, t0, t1, pxKm, fade, emit, withStart = false) {
    const ax = g[o], ay = g[o + 1], bx = g[o + 2], by = g[o + 3], qa = g[o + 4], qb = g[o + 5], sa = g[o + 6], sb = g[o + 7], seed = g[o + 12], end = g[o + 17], Sa = g[o + 18], Sb = g[o + 19];
    const cl0 = Math.max(0.05, Math.cos((0.5 - (ay + by) / 2 / (TEX_W / 2)) * Math.PI)), lenKm = Math.hypot((bx - ax) * cl0, by - ay) * KM * (t1 - t0);
    // (no wave the pixels hold — a coarse window: the segment as it is, its end alone)
    const n = !(fade(MEANDER.top) > 0) ? 1 : Math.max(1, Math.min(4096, Math.ceil(lenKm / stepKm(Math.min(qa, qb), pxKm))));
    for (let k = withStart ? 0 : 1; k <= n; k++) {
        const t = t0 + (t1 - t0) * k / n, x = ax + t * (bx - ax), y = ay + t * (by - ay), q = qa + t * (qb - qa);
        let nx = g[o + 8] + t * (g[o + 10] - g[o + 8]), ny = g[o + 9] + t * (g[o + 11] - g[o + 9]);
        const nl = Math.hypot(nx, ny) || 1, off = meanderOffset(sa + t * (sb - sa), end, q, Sa + t * (Sb - Sa), seed, fade) / nl;
        const cl = Math.max(0.05, Math.cos((0.5 - y / (TEX_W / 2)) * Math.PI));
        emit(x + nx * off / (KM * cl), y + ny * off / KM, q);
    }
}
