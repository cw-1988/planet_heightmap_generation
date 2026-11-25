// Detail finer than the mesh (plans/V2_FINE_DETAIL_PLAN.md): the heights of a finished moment at any window of the planet,
// at any resolution — its picture of heights enlarged, plus a little of what a mesh of 7–15 km cells cannot hold, drawn
// from what the finish recorded (finish-drivers.js) and only below the mesh's own scale, octave by octave as the window's
// pixels allow (a coarser view and a finer one of the same place agree):
//   · the rock's landforms (plans/V2_LITHOLOGY_RELIEF_PLAN.md: the finish's rock picture, geology/rocks.js; its bedding
//     steps drew black curves on every valley side — removed 2026-11-20);
//     no ridges and valleys of its own: stripes steered down the slope (phacelle) drew swirls up close — removed 2026-11-18;
//   · no dunes of its own (phacelle stripes across the wind drew noodles; the sand seas' draa are the finish's, finish-wind.js);
//   · the coast's headlands and coves — hard rock jutting out as headlands, soft rock worn back into bays;
//   · the shore's own forms, by the sea's work on it (littoral.js): cliffs and platforms, beaches, flats and marsh.
// Plains and plateau tops get none. The rivers are the moment's own lines (drawn by the page and the exports; the world
// map cuts their valleys along them, river-valleys.js). A window
// reads only its own pixels and a margin of a few km around them, so windows drawn apart (tiles, bands) meet.

import { DRIVER_FIELDS } from './finish-drivers.js';
import { wetSolution } from '../geology/lithology.js';
import { rockProps } from './rock-props.js';
import { chamfer, coastReach } from './coast-distance.js';
import { fineLadder } from './fine-ladder.js';
import { bumps, smoothNoise } from './lattice-noise.js';
import { riverLines, cropLines, carveValleys } from './river-valleys.js';
import { fadeFor } from './pixel-fade.js';
import { nearestLake, lakeHere, lakeMarginKm } from '../evolution/lake-water.js';
import { SMALL_LAKES } from './small-lakes.js';
import { windowWetDistance, seaHere } from './shore-ramp.js';
import { pondsInWindow, pondReader } from './small-lakes-draw.js';
import { shapeLittoral, beachReachKm, LIT_N, LITTORAL } from './littoral.js';
import { coastHistory, raiseTerraces } from './coast-history.js';
import { DRIFT } from './coast-drift.js';

const R = 6371, D2R = Math.PI / 180, TAU = 2 * Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The detail's tunables (km unless named otherwise). */
export const FINE = {
    baseSmooth: 1,              // the picture enlarged as its smoother (B-spline) self away from the sea (its Catmull–Rom at the coast, which keeps
                                // the coastline): the mesh's one-cell pits and spikes drew square blobs in the hillshade
    // (the pixels' fade, a feature drawn once its wavelength spans 6 pixels: pixel-fade.js, shared with the drawn rivers)
    // (no ridges and valleys of its own: phacelle stripes steered down the slope drew swirls up close — removed 2026-11-18)
    gullyMaxShare: 0.25,        // a lowering never deeper than this share of the ground's height above the sea
    // (no bedding steps: slopes stepped through layered rock, 120 m treads and risers, shaded as bundles of thin black
    // curves along every valley side up close — removed 2026-11-20, the owner: "remove that weird hill height lines")
    // (no strike ridges: drawn as phacelle stripes across a fold belt's strike they read as worms over every belt — the
    // first fine detail's fault, V2_FINE_DETAIL_PLAN §5; a belt's ridges and its rock bands are the mesh's: synthesize.js)
    // the rock's own landforms — knobs: crystalline rock (lithology.knobby) scoured by the last ice age's ice, or worn in the
    // cold: hummocks, streamlined along the ice's flow (the Canadian Shield's knock-and-lochan, without the lakes)…
    knobKm: 6, knobAmpKm: 0.04, knobColdC: [4, -4],
    // …karst (lithology.soluble, where it dissolves: geology/lithology.js wetSolution)…
    hollowKm: 7, hollowAmpKm: 0.04,     // …and closed hollows, dolines and uvalas (drawn larger than life: real ones are
                                        // tens of metres to a km across)…
    cockpitTempC: [19, 24], cockpitRainMm: [1200, 2000],   // …packed close and deeper in the wet tropics (cockpit karst)
    // (tried and dropped, 2026-10-28: inselbergs and domes on granite and shields, the tropics' tower karst, salt domes,
    // scarps at hard rock's contacts — smooth bumps standing alone on flat ground read as bubbles, and scarps sharpened from
    // the rock picture's ~10 km pixels traced its squares as staircases)
    // coasts: the coastline wandering by up to this (more on rocky coasts), on a slope of at least this
    coastWiggleKm: 2.2, coastMinSlope: 0.004,
    lakeFlatKm: 0.01,           // a lake's bed: its mud flat under the water — no detail where the picture's lake is this deep
    coastRock: 0.6,             // …and by the rock: hard rock out as headlands, soft back into bays (Dorset's coast) — its
                                // hardness from ½ counting this much beside the wander's noise
};

/** What a finished moment's detail is drawn from: { r (the picture), d (its drivers, or null), g (its rock picture, or
 *  null: a moment without geology), c (its climate's picture: tAnnual, pAnnual — or null), seed, cellKm (the mesh's spacing),
 *  rvAll (the valleys' lines: the rivers carrying at least `riverQ` m³/s, those the page draws — Infinity: none) }. */
export function detailSource(fin, seed, riverQ) {
    const r = fin.raster, cells = fin.cells ?? 2.5e6;
    return { r, d: r.drivers ?? null, g: r.geology?.rock ? r.geology : null, c: fin.climate?.raster?.tAnnual ? fin.climate.raster : null, seed, cellKm: 24200 / Math.sqrt(cells),
        rvAll: fin.rivers ? riverLines(fin.rivers, riverQ, r) : null };
}

/** How many pixels a window reads past its edges: its coasts' reach, and the octaves' slopes a pixel each. */
// (and where the drift's forms are drawn, as far as they read — coast-drift.js DRIFT.reachKm: a spit's shadow or a
// barrier's distance out read past a tile's margin differed from its neighbour's, a straight seam along the tile's edge;
// and the beach's reach, littoral.js beachReachKm: its distance measured from a shore in the margin, not cut at the edge)
export const marginPx = pxKm => Math.max(Math.min(64, Math.ceil(3 * FINE.coastWiggleKm / pxKm) + 8),
    Math.min(160, Math.max(LITTORAL.beachReachPx, Math.ceil(beachReachKm(pxKm) / pxKm)) + 4),
    pxKm <= DRIFT.maxPxKm ? Math.min(160, Math.ceil(DRIFT.reachKm / pxKm) + 4) : 0);

/**
 * What one window needs of a source — the picture's and the drivers' pixels under it and its margin — small enough to
 * send to a worker with each window (the whole picture of a 10M moment is ~160 MB).
 */
export function cropSource(src, win) {
    const { W, x0, y0, w, h } = win, M = marginPx(TAU * R / W);
    const sub = (g, fields, k, ex = 0) => {
        const gx0 = Math.floor((x0 - M - ex) * k) - 3, gx1 = Math.ceil((x0 + w + M + ex) * k) + 3, gy0 = Math.max(0, Math.floor((y0 - M - ex) * k) - 3), gy1 = Math.min(g.h - 1, Math.ceil((y0 + h + M + ex) * k) + 3);
        const cw = Math.min(g.w, gx1 - gx0 + 1), ch = gy1 - gy0 + 1, ox = ((gx0 % g.w) + g.w) % g.w, out = { fw: g.w, fh: g.h, x0: ox, y0: gy0, w: cw, h: ch };
        for (const key of fields) {
            const a = g[key];
            if (!a) continue;
            const b = new a.constructor(cw * ch);
            // (a row at a time, in at most two runs — the second where it wraps round the date line: pixel by pixel, the
            // tiles of a 10 M world took ~1.5 s of the page's thread)
            const n1 = Math.min(cw, g.w - ox);
            for (let y = 0; y < ch; y++) {
                const row = (gy0 + y) * g.w;
                b.set(a.subarray(row + ox, row + ox + n1), y * cw);
                if (n1 < cw) b.set(a.subarray(row, row + cw - n1), y * cw + n1);
            }
            out[key] = b;
        }
        return out;
    };
    // (the small lakes' share bytes: beside the picture's (pondShare, which of its pixels are drawn small lakes), and with
    // the heights wider by the largest lake's bank, so a lake whose centre lies past the window reads the same share and
    // the same level in every tile)
    // (and the heights as they were before the picture carved its own small lakes — small-lakes-draw.js pondRaster: the
    // window carves them afresh, at its own detail, into that smooth ground; the carve itself, enlarged, rang through the
    // Catmull–Rom, a dark line down the shore — the owner, 2026-11-22, docs/small-lakes.md)
    const uncarve = c => {
        if (!P?.at) return c;
        const { at, h0 } = P, lo0 = c.y0 * c.fw, hi = (c.y0 + c.h) * c.fw;
        let lo = 0, top = at.length;
        while (lo < top) { const m = (lo + top) >> 1; if (at[m] < lo0) lo = m + 1; else top = m; }
        for (let n = lo; n < at.length && at[n] < hi; n++) {
            const y = Math.floor(at[n] / c.fw) - c.y0, x = ((at[n] % c.fw) - c.x0 + c.fw) % c.fw;
            if (x < c.w) c.heightM[y * c.w + x] = h0[n];
        }
        return c;
    };
    const P = src.r.pond, r = uncarve(sub(P ? { ...src.r, pondShare: P.share } : src.r, ['heightM', 'ocean', 'water', 'waterLevel', 'pondShare'], src.r.w / W));
    if (P) r.pond = { ...uncarve(sub({ ...P, heightM: src.r.heightM }, ['share', 'heightM'], P.w / W, Math.ceil(1.6 * SMALL_LAKES.topKm / (TAU * R / W)))), seed: P.seed };
    return { r, d: src.d ? sub(src.d, DRIVER_FIELDS, src.d.w / W) : null,
        g: src.g ? sub(src.g, ['rock'], src.g.w / W) : null, c: src.c ? sub(src.c, ['tAnnual', 'pAnnual'], src.c.w / W) : null, seed: src.seed, cellKm: src.cellKm,
        rv: src.rvAll ? cropLines(src.rvAll, win, M) : null };
}

// (the lattice noises — smoothNoise, bumps — are in lattice-noise.js)

/**
 * The detailed window: W the full width it is a window of (px; the planet W × W/2), its columns x0 … x0 + w − 1 (wrapping)
 * and rows y0 … y0 + h − 1. Returns { h: Float32Array (km), sea: Uint8Array, wat: Uint8Array (finish-hydro.js Water kinds),
 * shore: Float32Array (km from a water pixel to its shore, shore-ramp.js), lev, lit (the shore's colours, littoral.js:
 * LIT_N bytes a pixel — or none) } — for the painter.
 */
export function fineWindow(src, { W, x0, y0, w, h }, signal = null) {
    const { r, d } = src, HE = W >> 1, pxKm = TAU * R / W, M = marginPx(pxKm);
    // (the picture: whole, or a crop of it — cropSource: fw × fh the whole, x0, y0 where the crop starts)
    const RW = r.fw ?? r.w, RH = r.fh ?? r.h, rx0 = r.x0 ?? 0, ry0 = r.y0 ?? 0;
    const colR = c => Math.min(r.w - 1, ((c - rx0) % RW + RW) % RW), rowR = y => Math.min(r.h - 1, Math.max(0, Math.min(RH - 1, Math.max(0, y)) - ry0));
    const ew = w + 2 * M, eh = h + 2 * M, N = ew * eh, X0 = x0 - M, Y0 = y0 - M, ms = {};
    let t0 = performance.now();
    const lap = name => { const t = performance.now(); ms[name] = t - t0; t0 = t; };
    // ── geometry: each extended row's latitude, each column's longitude ──
    const latR = new Float64Array(eh), cosLa = new Float64Array(eh), sinLa = new Float64Array(eh), cosLo = new Float64Array(ew), sinLo = new Float64Array(ew);
    for (let j = 0; j < eh; j++) { const Y = Math.min(HE - 1, Math.max(0, Y0 + j)); latR[j] = (90 - (Y + 0.5) * 180 / HE) * D2R; cosLa[j] = Math.cos(latR[j]); sinLa[j] = Math.sin(latR[j]); }
    for (let i = 0; i < ew; i++) { const lo = ((X0 + i + 0.5) * 360 / W - 180) * D2R; cosLo[i] = Math.cos(lo); sinLo[i] = Math.sin(lo); }
    // ── the picture enlarged: heights by a Catmull–Rom, rows then columns — smooth everywhere (clamped to its pixels' range
    // it creased where the clamp switched: ticks in the hillshade; a monotone cubic drew the pixels' grid); the sea and the
    // lakes by the weighted majority of four. And the same smoother (a cubic B-spline: its slope smooth too), what the
    // detail is steered by — the Catmull–Rom's slope turns at each of the picture's pixels, and stripes steered by it creased
    // there ──
    const hb = new Float32Array(N), hs = new Float32Array(N), seaB = new Uint8Array(N), watB = new Uint8Array(N), k = RW / W;
    // (the lakes by their level, where the picture has it: the nearest lake's level (km) — the shore drawn where it meets
    // the window's own ground, its finer detail included, at the crop — lake-water.js)
    const LV = r.water && r.waterLevel ? r.waterLevel : null, levB = LV ? new Float32Array(N).fill(NaN) : null, shB = LV ? new Float32Array(N) : null, hit = [0, NaN, 0];
    // (the small lakes: the picture's skipped, redrawn at the window's own detail, each in its carved basin —
    // small-lakes-draw.js; pondKm each one's radius at its pixels, for its shore ramp)
    const pondKm = levB && r.pond ? new Float32Array(N) : null;
    const skip = r.pondShare ?? r.pond?.share ?? null, ponds = pondKm ? D => pondsInWindow({ ew, eh, cosLa, sinLa, cosLo, sinLo, pxKm, seaB, watB, levB, shB, hb, D,
        pond: pondReader({ ...r.pond, heightM: r.pond.heightM ?? r.heightM }), seed: r.pond.seed, pondKm, M }) : () => {};
    {
        const cx = new Int32Array(4 * ew), fxs = new Float32Array(ew), cy = new Int32Array(4 * eh), fys = new Float32Array(eh), H4 = r.heightM;
        for (let i = 0; i < ew; i++) { const u = (X0 + i + 0.5) * k - 0.5, xi = Math.floor(u); fxs[i] = u - xi; for (let q = 0; q < 4; q++) cx[4 * i + q] = colR(((xi - 1 + q) % RW + RW) % RW); }
        for (let j = 0; j < eh; j++) { const v = (Math.min(HE - 1, Math.max(0, Y0 + j)) + 0.5) * k - 0.5, yi = Math.floor(v); fys[j] = v - yi; for (let q = 0; q < 4; q++) cy[4 * j + q] = rowR(yi - 1 + q) * r.w; }
        const kinds = [0, 0, 0, 0];
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const c0 = cx[4 * i], c1 = cx[4 * i + 1], c2 = cx[4 * i + 2], c3 = cx[4 * i + 3], fx = fxs[i], fy = fys[j];
            const r0 = cy[4 * j], r1 = cy[4 * j + 1], r2 = cy[4 * j + 2], r3 = cy[4 * j + 3];
            const s = cr(cr(H4[r0 + c0], H4[r0 + c1], H4[r0 + c2], H4[r0 + c3], fx), cr(H4[r1 + c0], H4[r1 + c1], H4[r1 + c2], H4[r1 + c3], fx),
                cr(H4[r2 + c0], H4[r2 + c1], H4[r2 + c2], H4[r2 + c3], fx), cr(H4[r3 + c0], H4[r3 + c1], H4[r3 + c2], H4[r3 + c3], fx), fy);
            const a = r1 + c1, b = r1 + c2, c = r2 + c1, e = r2 + c2;
            const p = j * ew + i, wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
            hs[p] = bs(bs(H4[r0 + c0], H4[r0 + c1], H4[r0 + c2], H4[r0 + c3], fx), bs(H4[r1 + c0], H4[r1 + c1], H4[r1 + c2], H4[r1 + c3], fx),
                bs(H4[r2 + c0], H4[r2 + c1], H4[r2 + c2], H4[r2 + c3], fx), bs(H4[r3 + c0], H4[r3 + c1], H4[r3 + c2], H4[r3 + c3], fx), fy) / 1000;
            const O = r.ocean, so = bs(bs(O[r0 + c0], O[r0 + c1], O[r0 + c2], O[r0 + c3], fx), bs(O[r1 + c0], O[r1 + c1], O[r1 + c2], O[r1 + c3], fx),
                bs(O[r2 + c0], O[r2 + c1], O[r2 + c2], O[r2 + c3], fx), bs(O[r3 + c0], O[r3 + c1], O[r3 + c2], O[r3 + c3], fx), fy);
            const sm = FINE.baseSmooth * (1 - smooth(0, 0.25, so));
            hb[p] = ((1 - sm) * s / 1000) + sm * hs[p];
            seaB[p] = seaHere(hb[p], r.ocean, a, b, c, e, wa, wb, wc, wd);
            if (LV) { nearestLake(r.water, LV, a, b, c, e, wa, wb, wc, wd, hit, skip);watB[p] = hit[0]; levB[p] = hit[1]; shB[p] = hit[2]; }
            else if (r.water) {
                kinds[0] = kinds[1] = kinds[2] = kinds[3] = 0;
                kinds[r.water[a]] += wa; kinds[r.water[b]] += wb; kinds[r.water[c]] += wc; kinds[r.water[e]] += wd;
                let best = 0; for (let q = 1; q < 4; q++) if (kinds[q] > kinds[best]) best = q;
                watB[p] = best;
            }
        }
    }
    const out = { h: new Float32Array(w * h), sea: new Uint8Array(w * h), wat: new Uint8Array(w * h), lev: levB ? new Float32Array(w * h) : null, ms };
    const crop = (src2, dst) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dst[j * w + i] = src2[(j + M) * ew + i + M]; };
    // (the lakes, after the heights: lake where the nearest lake's level stands above the window's ground)
    const cropLakes = () => {
        crop(watB, out.wat);
        if (!levB) return;
        const sh = new Float32Array(w * h); crop(levB, out.lev); crop(shB, sh);
        for (let q = 0; q < w * h; q++) if (out.wat[q] && !lakeHere(out.lev[q], out.h[q], sh[q])) out.wat[q] = 0;
    };
    // (how far each water pixel is from its shore, on the margin grid so tiles agree: the shallows' ramp, shore-ramp.js)
    const shore = (hh, sh) => { out.shore = new Float32Array(w * h); crop(windowWetDistance(sh, watB, levB, shB, hh, ew, eh, pxKm, cosLa, pondKm), out.shore); };
    if (!d || k >= 1) { ponds(null); crop(hb, out.h); crop(seaB, out.sea); shore(hb, seaB); cropLakes(); return out; }

    lap('base');
    // ── the drivers, read at a pixel when wanted: bilinear, eased across each pixel so it has no kinks (`at` sets the pixel,
    // `val` reads a field there) ──
    const DW = d.fw ?? d.w, DH = d.fh ?? d.h, dx0 = d.x0 ?? 0, dy0 = d.y0 ?? 0, dw = d.w, dh = d.h;
    const xA = new Int32Array(ew), xB = new Int32Array(ew), fxD = new Float32Array(ew), rAr = new Int32Array(eh), rBr = new Int32Array(eh), fyD = new Float32Array(eh);
    for (let i = 0; i < ew; i++) { const u = ((((X0 + i + 0.5) / W) % 1 + 1) % 1) * DW - 0.5, xf = Math.floor(u), a0 = (xf + DW) % DW; fxD[i] = u - xf; xA[i] = Math.min(dw - 1, ((a0 - dx0) % DW + DW) % DW); xB[i] = Math.min(dw - 1, (((a0 + 1) % DW - dx0) % DW + DW) % DW); }
    for (let j = 0; j < eh; j++) {
        const v = (90 - latR[j] / D2R) / 180 * DH - 0.5, yA = Math.max(0, Math.min(DH - 1, Math.floor(v))), yB = Math.min(DH - 1, yA + 1);
        fyD[j] = Math.max(0, Math.min(1, v - yA)); rAr[j] = Math.min(dh - 1, Math.max(0, yA - dy0)) * dw; rBr[j] = Math.min(dh - 1, Math.max(0, yB - dy0)) * dw;
    }
    let pa = 0, pb = 0, pc = 0, pe = 0, wa = 0, wb = 0, wc = 0, we = 0;
    for (let i = 0; i < ew; i++) fxD[i] = fxD[i] * fxD[i] * (3 - 2 * fxD[i]);
    for (let j = 0; j < eh; j++) fyD[j] = fyD[j] * fyD[j] * (3 - 2 * fyD[j]);
    const at = (j, i) => { const fx = fxD[i], fy = fyD[j]; pa = rAr[j] + xA[i]; pb = rAr[j] + xB[i]; pc = rBr[j] + xA[i]; pe = rBr[j] + xB[i]; wa = (1 - fx) * (1 - fy) / 255; wb = fx * (1 - fy) / 255; wc = (1 - fx) * fy / 255; we = fx * fy / 255; };
    const val = f => wa * f[pa] + wb * f[pb] + wc * f[pc] + we * f[pe];
    // (a pixel's place, km from the planet's centre)
    const P = [0, 0, 0];
    const place = (j, i) => { P[0] = R * cosLa[j] * cosLo[i]; P[1] = R * cosLa[j] * sinLo[i]; P[2] = R * sinLa[j]; };

    // ── the picture's slope (km per km, east and north) and how far from its coast (km; + on land, − at sea) ──
    const gE = new Float32Array(N), gN = new Float32Array(N);
    gradient(hs, gE, gN);
    function gradient(f, oe, on) {
        for (let j = 0; j < eh; j++) {
            const ky = 1 / (2 * pxKm), kx = 1 / (2 * pxKm * Math.max(0.05, cosLa[j])), up = Math.max(0, j - 1) * ew, dn = Math.min(eh - 1, j + 1) * ew;
            for (let i = 0; i < ew; i++) { const p = j * ew + i; oe[p] = (f[j * ew + Math.min(ew - 1, i + 1)] - f[j * ew + Math.max(0, i - 1)]) * kx; on[p] = (f[up + i] - f[dn + i]) * ky; }
        }
    }
    const coastKm = chamfer(seaB, ew, eh, pxKm, cosLa), reach = 3 * FINE.coastWiggleKm;
    coastReach(coastKm, { r, W, X0, Y0, ew, eh, pxKm, M, reach });
    const D = new Float32Array(N), seed = src.seed | 0, fade = fadeFor(pxKm);
    if (signal?.aborted) return null;

    lap('slope');
    // ── no ridges or valleys of its own: stripes steered down the slope (phacelle, each octave turned by the coarser ones)
    // drew swirls and worms up close, and pixel noise below ~40 m; the ground stays the picture's own smooth surface,
    // the region's waves (fine-ladder.js) and the rivers' valleys (river-valleys.js) ──
    const picKm = TAU * R / RW;
    // (the rocks, where any of their features is drawn at this zoom: the rock's own landforms, the coast)
    const knF = fade(FINE.knobKm), hoF = fade(0.6 * FINE.hollowKm), formsOn = knF > 0.05 || hoF > 0, coastOn = fade(0.7 * FINE.coastWiggleKm) > 0;
    const lith = src.g?.rock && (formsOn || coastOn) ? rockProps(src, W, X0, Y0, ew, eh, latR) : null;
    // (how much of each pixel's rock dissolves: karst)
    const karst = lith ? new Float32Array(N) : null;
    if (lith) for (let p = 0; p < N; p++) if (lith.soluble[p] > 0) karst[p] = lith.soluble[p] * wetSolution(lith.T[p], lith.P[p]);

    lap('rocks');
    // (a lowering never deeper than a share of the ground's height: a soft minimum)
    const shareCap = (v, p) => { if (!(v < 0)) return v; const b = FINE.gullyMaxShare * Math.max(1e-4, hb[p]); return -(-v * b / Math.hypot(v, b)); };
    // ── the rock's own landforms, each from its rock and its climate: ice-scoured knobs on crystalline rock; karst's
    // closed hollows, packed close in the wet tropics ──
    if (lith && formsOn) {
        const [kC0, kC1] = FINE.knobColdC, [cT0, cT1] = FINE.cockpitTempC, [cR0, cR1] = FINE.cockpitRainMm, fK = 1 / FINE.knobKm, fH = 1 / FINE.hollowKm;
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (seaB[p] || !(lith.land[p] > 0) || !(hb[p] > 0)) continue;
            const T = lith.T[p], knob = lith.knobby[p], K = karst[p];
            // knobs: under the last ice age's ice, or worn in the cold — hummocks
            if (knF > 0.05 && knob > 0.05) {
                at(j, i);
                const ice = val(d.ice), w = knob * Math.max(ice, 0.6 * smooth(kC0, kC1, T)) * (1 - smooth(0.4, 1, 2 * val(d.rugged)));
                if (w > 0.005) {
                    place(j, i);
                    let v = smoothNoise(P[0] * fK, P[1] * fK, P[2] * fK, seed * 5 + 42) + 0.5 * smoothNoise(P[0] * fK * 2.2, P[1] * fK * 2.2, P[2] * fK * 2.2, seed * 5 + 43);
                    D[p] += shareCap(knF * FINE.knobAmpKm * w * v, p);
                }
            }
            // karst: closed hollows — in the wet tropics packed close and deeper (cockpits)
            if (hoF > 0 && K > 0.005) {
                const trop = smooth(cT0, cT1, T) * smooth(cR0, cR1, lith.P[p]);
                place(j, i);
                D[p] += shareCap(-hoF * FINE.hollowAmpKm * (1 + trop) * bumps(P[0] * fH, P[1] * fH, P[2] * fH, seed * 5 + 44, 0.7 * K * (1 + 0.3 * trop), 0.2, 0.42, 2, 2), p);
            }
        }
    }

    lap('rock');
    // ── the coast's headlands and coves: the coastline wandering by up to coastWiggleKm (more on rocky coasts, less on
    // active ones) — and by the rock: hard rock out as headlands, soft back into bays (its hardness read from the land
    // beside the coast, fading to none out at sea) ──
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, dist = coastKm[p];
        if (Math.abs(dist) >= reach) continue;
        at(j, i);
        const L = FINE.coastWiggleKm * (0.35 + 0.65 * smooth(0.08, 0.6, 2 * val(d.rugged))) * (1 - 0.5 * val(d.active)), fL = fade(2 * L);
        if (!(fL > 0) || Math.abs(dist) >= 3 * L) continue;
        place(j, i);
        // (one frequency everywhere, L only the amount: a frequency of L's, times a place ~6,371 km from the centre, turned
        // the noise thousands of waves wherever L changed — zigzags)
        const sc = 1 / (2 * FINE.coastWiggleKm), rock = lith ? 2 * FINE.coastRock * (lith.hard[p] - 0.5) * smooth(0, 0.5, lith.land[p]) : 0;
        const n = smoothNoise(P[0] * sc, P[1] * sc, P[2] * sc, seed * 5 + 13) + 0.5 * smoothNoise(P[0] * sc * 2.1, P[1] * sc * 2.1, P[2] * sc * 2.1, seed * 5 + 14) + rock;
        D[p] += fL * Math.max(FINE.coastMinSlope, Math.hypot(gE[p], gN[p])) * L * n * (1 - smooth(0, 3 * L, Math.abs(dist)));
    }

    lap('coasts');
    // ── (fork) an opened region's rolling and ridged detail, octave by octave as the pixels hold it (fine-ladder.js) ──
    fineLadder(D, { hb, gE, gN, cosLa, sinLa, cosLo, sinLo, ew, eh, picKm, seed, fade, W, X0, Y0, pxKm });
    lap('ladder');
    // ── (fork) the rivers' valleys, cut along the lines the page draws (river-valleys.js) — drowned near the coast where the
    // sea has risen since, raised shores where the land has (coast-history.js) ──
    const hist = coastHistory({ ew, eh, at, val, d, coastKm, seaB });
    carveValleys(D, src.rv ?? (src.rvAll ? cropLines(src.rvAll, { W, x0, y0, w, h }, M) : null), { hb, gE, gN, seaB, W, X0, Y0, ew, eh, pxKm, cosLa, sinLa, cosLo, sinLo, seed, fade, drown: hist?.drown });
    raiseTerraces(D, { hb, seaB, coastKm, gE, gN, hist, ew, eh, place, P, seed, fade });
    lap('valleys');
    // ── the lakes' beds: lake mud, settled flat — the finer detail fades out under a lake as its water deepens (its waves
    // of tens of metres stood up through a shallow lowland lake and drained it, leaving only the deep tarns: docs/lake-origins.md);
    // the shore keeps the land's own detail: it fades by the lake test's own margin, so land past the shore is untouched ──
    if (levB) for (let p = 0; p < N; p++) if (watB[p]) D[p] *= 1 - smooth(0, FINE.lakeFlatKm, lakeMarginKm(levB[p], hb[p], shB[p]));
    // (then the small lakes' basins, carved into the finished detail: flattened after, their bowls would fill back in)
    ponds(D);
    // ── the heights; the sea where they are below it at or near the picture's sea (no new inland seas: land stays land) ──
    const hf = new Float32Array(N), sea = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
        const v = hb[p] + D[p];
        if (v < 0 && coastKm[p] < reach) { hf[p] = v; sea[p] = 1; } else hf[p] = v < 0 ? 0.001 : v;
    }
    // ── the shore's own forms, by the sea's work on it: cliffs cut back over their platforms, beaches and dunes, the
    // shoreface, tidal flats and marsh — and their colours (littoral.js; a moment finished before them: none) ──
    const lit = d.wave ? shapeLittoral(hf, sea, { ew, eh, pxKm, cosLa, at, val, d, gE, gN, lith, lim: Math.max(reach, LITTORAL.beachReachPx * pxKm, Math.min(beachReachKm(pxKm), (M - 4) * pxKm)), place, P, seed, edgeKm: (M - 4) * pxKm }) : null;
    crop(hf, out.h); crop(sea, out.sea); shore(hf, sea); cropLakes();
    if (lit) {
        out.lit = new Uint8Array(LIT_N * w * h);
        for (let j = 0; j < h; j++) out.lit.set(lit.subarray(LIT_N * ((j + M) * ew + M), LIT_N * ((j + M) * ew + M + w)), LIT_N * j * w);
    }
    lap('sea');
    return out;
}

/** A cubic B-spline near p1 (t = 0) … p2 (t = 1), p0 and p3 beside them: smoother than the pixels (it does not pass
 *  through them), its slope smooth too. */
function bs(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t, u = 1 - t;
    return (u * u * u * p0 + (3 * t3 - 6 * t2 + 4) * p1 + (-3 * t3 + 3 * t2 + 3 * t + 1) * p2 + t3 * p3) / 6;
}
/** A Catmull–Rom between p1 (t = 0) and p2 (t = 1), p0 and p3 beside them. */
function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((-t3 + 2 * t2 - t) * p0 + (3 * t3 - 5 * t2 + 2) * p1 + (-3 * t3 + 4 * t2 + t) * p2 + (t3 - t2) * p3);
}

export { DRIVER_FIELDS };
