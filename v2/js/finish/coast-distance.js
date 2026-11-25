// How far each pixel of a fine window is from the coast (fork: moved out of fine-detail.js, and carried past the window's
// margin). The window's own chamfer distance is exact (in its octagonal metric) only out to its margin; at the world map's
// deepest tiles (planet-view.js: level 14, 9.5 m a pixel) that margin is ~0.6 km while the coast's detail reaches 6.6 km,
// so two tiles side by side disagreed about where the coast is and the sea stopped at their seam. Past what the window
// can tell, the distance is read from the same picture's sea on a coarser grid fixed to the world (every 2^s pixels), over
// the window and the reach round it — both a function of the place alone, so tiles agree.

import { seaHere } from './shore-ramp.js';
import { drain } from '../core/steps.js';

const D2R = Math.PI / 180;

/** The distance (km) from each pixel to the nearest pixel of the other kind (sea ↔ land): + on land, − at sea — a chamfer
 *  distance, each row's east–west step its own (the pixels narrow toward the poles). */
export function chamfer(sea, w, h, pxKm, cosLa) { return drain(chamferSteps(sea, w, h, pxKm, cosLa)); }
/** chamfer a row at a time (core/steps.js): the whole world's picture on the page's thread without stalling it. */
export function* chamferSteps(sea, w, h, pxKm, cosLa) {
    const N = w * h, d = new Float32Array(N).fill(1e9);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const p = j * w + i, s = sea[p];
            if ((i > 0 && sea[p - 1] !== s) || (i < w - 1 && sea[p + 1] !== s) || (j > 0 && sea[p - w] !== s) || (j < h - 1 && sea[p + w] !== s)) d[p] = 0.5 * pxKm;
        }
        yield;
    }
    function* pass(j0, j1, dj, i0, i1, di) {
        for (let j = j0; j !== j1; j += dj) {
            const ax = pxKm * Math.max(0.05, cosLa[j]), ay = pxKm, ad = Math.hypot(ax, ay), jj = j - dj;
            for (let i = i0; i !== i1; i += di) {
                const p = j * w + i, ii = i - di;
                let v = d[p];
                if (ii >= 0 && ii < w && d[j * w + ii] + ax < v) v = d[j * w + ii] + ax;
                if (jj >= 0 && jj < h) {
                    if (d[jj * w + i] + ay < v) v = d[jj * w + i] + ay;
                    if (ii >= 0 && ii < w && d[jj * w + ii] + ad < v) v = d[jj * w + ii] + ad;
                    const ib = i + di;
                    if (ib >= 0 && ib < w && d[jj * w + ib] + ad < v) v = d[jj * w + ib] + ad;
                }
                d[p] = v;
            }
            yield;
        }
    }
    yield* pass(0, h, 1, 0, w, 1);
    yield* pass(h - 1, -1, -1, w - 1, -1, -1);
    for (let j = 0; j < h; j++) { for (let p = j * w, e = p + w; p < e; p++) if (sea[p]) d[p] = -d[p]; yield; }
    return d;
}

/**
 * `coastKm` (the window's chamfer of `seaB`, ew × eh from pixel X0, Y0 of a planet W wide, `M` of it margin) made right
 * out to `reach` km: where the window's own distance is under half what its margin can tell at that row (T, a function
 * of the latitude alone) it stays; past T, the coarse grid's distance; between, the one eased into the other. `r`: the picture (fine-detail.js's
 * source), its sea `r.ocean` read as the window's seaB is (bilinear, ≥ ½ the sea). Nothing to do where the margin
 * already reaches.
 */
export function coastReach(coastKm, { r, W, X0, Y0, ew, eh, pxKm, M, reach }) {
    const HE = W >> 1, dLat = 180 / HE, rows = j => 90 - (Math.min(HE - 1, Math.max(0, Y0 + j)) + 0.5) * dLat;
    const Tof = j => (M - 1) * pxKm * Math.cos(Math.min(89.9, Math.abs(rows(j)) + M * dLat) * D2R);
    let need = false;
    for (let j = 0; j < eh && !need; j++) need = Tof(j) < reach;
    if (!need) return;
    // (the coarse grid: every S pixels, about reach / 48 km a cell; its window the fine one and the reach round it)
    const s = Math.max(1, Math.ceil(Math.log2(reach / (48 * pxKm)))), S = 2 ** s, cKm = S * pxKm, HEc = Math.ceil(HE / S);
    const polar = Math.cos(Math.min(85, Math.max(Math.abs(rows(0)), Math.abs(rows(eh - 1))) + reach / 111) * D2R);
    const mx = Math.min(400, Math.ceil(reach / (cKm * polar)) + 2), my = Math.ceil(reach / cKm) + 2;
    const cx0 = Math.floor(X0 / S) - mx, cy0 = Math.max(0, Math.floor(Y0 / S) - my);
    const cw = Math.floor((X0 + ew - 1) / S) + mx - cx0 + 1, ch = Math.min(HEc - 1, Math.floor((Y0 + eh - 1) / S) + my) - cy0 + 1;
    if (!(ch > 0)) return;
    // (the picture's sea at a point: as fine-detail.js reads it for seaB)
    const RW = r.fw ?? r.w, RH = r.fh ?? r.h, rx0 = r.x0 ?? 0, ry0 = r.y0 ?? 0, k = RW / W, O = r.ocean;
    const colR = c => Math.min(r.w - 1, ((c - rx0) % RW + RW) % RW), rowR = y => Math.min(r.h - 1, Math.max(0, Math.min(RH - 1, Math.max(0, y)) - ry0));
    const cSea = new Uint8Array(cw * ch), cCos = new Float64Array(ch);
    for (let b = 0; b < ch; b++) {
        const Yp = Math.min(HE, (cy0 + b + 0.5) * S), v = Yp * k - 0.5, yi = Math.floor(v), fy = v - yi, r1 = rowR(yi) * r.w, r2 = rowR(yi + 1) * r.w;
        cCos[b] = Math.cos((90 - Yp * dLat) * D2R);
        for (let a = 0; a < cw; a++) {
            const u = (cx0 + a + 0.5) * S * k - 0.5, xi = Math.floor(u), fx = u - xi, c1 = colR(((xi % RW) + RW) % RW), c2 = colR((((xi + 1) % RW) + RW) % RW);
            const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy, Hm = r.heightM;
            const hKm = (wa * Hm[r1 + c1] + wb * Hm[r1 + c2] + wc * Hm[r2 + c1] + wd * Hm[r2 + c2]) / 1000;
            cSea[b * cw + a] = seaHere(hKm, O, r1 + c1, r1 + c2, r2 + c1, r2 + c2, wa, wb, wc, wd);
        }
    }
    const cd = chamfer(cSea, cw, ch, cKm, cCos);
    for (let j = 0; j < eh; j++) {
        const T = Tof(j), gy = Math.min(ch - 1.001, Math.max(0, (Math.min(HE - 1, Math.max(0, Y0 + j)) + 0.5) / S - 0.5 - cy0));
        const b = Math.floor(gy), ty = gy - b;
        for (let i = 0; i < ew; i++) {
            const p = j * ew + i, v = coastKm[p], av = Math.abs(v);
            if (av < 0.5 * T) continue;
            const gx = Math.min(cw - 1.001, Math.max(0, (X0 + i + 0.5) / S - 0.5 - cx0)), a = Math.floor(gx), tx = gx - a, c = b * cw + a;
            const far = Math.abs(cd[c]) * (1 - tx) * (1 - ty) + Math.abs(cd[c + 1]) * tx * (1 - ty) + Math.abs(cd[c + cw]) * (1 - tx) * ty + Math.abs(cd[c + cw + 1]) * tx * ty;
            // (handed over across ½T…T, not at a step: the two distances differ by up to a coarse cell, and a step in the
            // distance was a step in the coast's detail — a line along the coast, T offshore)
            const t = Math.min(1, (av - 0.5 * T) / (0.5 * T)), w = t * t * (3 - 2 * t);
            coastKm[p] = Math.sign(v) * ((1 - w) * av + w * far);
        }
    }
}
