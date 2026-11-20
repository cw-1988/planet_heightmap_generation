// Detail finer than the mesh (plans/V2_FINE_DETAIL_PLAN.md): the heights of a finished moment at any window of the planet,
// at any resolution — its picture of heights enlarged, plus a little of what a mesh of 7–15 km cells cannot hold, drawn
// from what the finish recorded (finish-drivers.js) and only below the mesh's own scale, octave by octave as the window's
// pixels allow (a coarser view and a finer one of the same place agree):
//   · the rock's steps and landforms (plans/V2_LITHOLOGY_RELIEF_PLAN.md: the finish's rock picture, geology/rocks.js);
//     no ridges and valleys of its own: stripes steered down the slope (phacelle) drew swirls up close — removed 2026-11-18;
//   · no dunes of its own (phacelle stripes across the wind drew noodles; the sand seas' draa are the finish's, finish-wind.js);
//   · the coast's headlands and coves — hard rock jutting out as headlands, soft rock worn back into bays.
// Plains and plateau tops get none. The rivers are the moment's own lines (drawn by the page and the exports; the world
// map cuts their valleys along them, river-valleys.js). A window
// reads only its own pixels and a margin of a few km around them, so windows drawn apart (tiles, bands) meet.

import { DRIVER_FIELDS } from './finish-drivers.js';
import { wetSolution } from '../geology/lithology.js';
import { rockProps } from './rock-props.js';
import { chamfer, coastReach } from './coast-distance.js';
import { fineLadder } from './fine-ladder.js';
import { hash3, bumps, smoothNoise } from './lattice-noise.js';
import { riverLines, cropLines, carveValleys } from './river-valleys.js';
import { fadeFor } from './pixel-fade.js';
import { nearestLake } from '../evolution/lake-water.js';

const R = 6371, D2R = Math.PI / 180, TAU = 2 * Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The detail's tunables (km unless named otherwise). */
export const FINE = {
    baseSmooth: 1,              // the picture enlarged as its smoother (B-spline) self away from the sea (its Catmull–Rom at the coast, which keeps
                                // the coastline): the mesh's one-cell pits and spikes drew square blobs in the hillshade
    // (the pixels' fade, a feature drawn once its wavelength spans 6 pixels: pixel-fade.js, shared with the drawn rivers)
    // (no ridges and valleys of its own: phacelle stripes steered down the slope drew swirls up close — removed 2026-11-18)
    gullyMaxShare: 0.25,        // a lowering never deeper than this share of the ground's height above the sea
    // bedding (geology-config.js lithology.bedded): slopes stepped through layered rock — a tread, then a riser…
    bedStepKm: 0.12,            // …each step about this high (0.75–1.25 × it from place to place)…
    bedRiser: 0.35,             // …its riser this share of it…
    bedDipKm: 0.35,             // …through beds tilted gently: their surface wandering by this over…
    bedDipWaveKm: 90,           // …waves this long (dips of a degree or two: cuestas where the ground slopes the other way)
    bedSlope: [0.01, 0.05],     // on slopes from none … full (plateau tops and plains stay whole)
    bedWet: 0.3,                // crisp where it is dry; where it is wet (soil and creep round them) this share
    bedRainMm: [300, 1200],     // …dry … wet
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
const marginPx = pxKm => Math.min(64, Math.ceil(3 * FINE.coastWiggleKm / pxKm) + 8);

/**
 * What one window needs of a source — the picture's and the drivers' pixels under it and its margin — small enough to
 * send to a worker with each window (the whole picture of a 10M moment is ~160 MB).
 */
export function cropSource(src, win) {
    const { W, x0, y0, w, h } = win, M = marginPx(TAU * R / W);
    const sub = (g, fields, k) => {
        const gx0 = Math.floor((x0 - M) * k) - 3, gx1 = Math.ceil((x0 + w + M) * k) + 3, gy0 = Math.max(0, Math.floor((y0 - M) * k) - 3), gy1 = Math.min(g.h - 1, Math.ceil((y0 + h + M) * k) + 3);
        const cw = Math.min(g.w, gx1 - gx0 + 1), ch = gy1 - gy0 + 1, ox = ((gx0 % g.w) + g.w) % g.w, out = { fw: g.w, fh: g.h, x0: ox, y0: gy0, w: cw, h: ch };
        for (const key of fields) {
            const a = g[key];
            if (!a) continue;
            const b = new a.constructor(cw * ch);
            for (let y = 0; y < ch; y++) { const row = (gy0 + y) * g.w; for (let x = 0; x < cw; x++) b[y * cw + x] = a[row + (ox + x) % g.w]; }
            out[key] = b;
        }
        return out;
    };
    return { r: sub(src.r, ['heightM', 'ocean', 'water', 'waterLevel'], src.r.w / W), d: src.d ? sub(src.d, DRIVER_FIELDS, src.d.w / W) : null,
        g: src.g ? sub(src.g, ['rock'], src.g.w / W) : null, c: src.c ? sub(src.c, ['tAnnual', 'pAnnual'], src.c.w / W) : null, seed: src.seed, cellKm: src.cellKm,
        rv: src.rvAll ? cropLines(src.rvAll, win, M) : null };
}

// (the lattice noises — smoothNoise, bumps — are in lattice-noise.js)
/** Bed k's top (in steps; bed k from its top to bed k + 1's): k jittered by ± 0.3 — beds 0.4–1.6 steps thick, the same
 *  everywhere for a seed. */
const bedLevel = (k, seed) => k + 0.6 * (hash3(k, 17, 3, seed * 7 + 5) / 4294967296 - 0.5);
/** How hard bed k is, 0.25…1: its riser's share (a cliff-former's full, a soft bed's faint, ~0.6 on the whole). */
const bedHard = (k, seed) => 0.25 + 0.75 * (hash3(k, 41, 9, seed * 7 + 6) / 4294967296) ** 0.7;

/**
 * The detailed window: W the full width it is a window of (px; the planet W × W/2), its columns x0 … x0 + w − 1 (wrapping)
 * and rows y0 … y0 + h − 1. Returns { h: Float32Array (km), sea: Uint8Array, wat: Uint8Array (finish-hydro.js Water kinds) }
 * — for the painter.
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
    const LV = r.water && r.waterLevel ? r.waterLevel : null, levB = LV ? new Float32Array(N).fill(NaN) : null, hit = [0, NaN];
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
            seaB[p] = wa * r.ocean[a] + wb * r.ocean[b] + wc * r.ocean[c] + wd * r.ocean[e] >= 0.5 ? 1 : 0;
            if (LV) { nearestLake(r.water, LV, a, b, c, e, wa, wb, wc, wd, hit); watB[p] = hit[0]; levB[p] = hit[1]; }
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
        crop(levB, out.lev);
        for (let q = 0; q < w * h; q++) if (out.wat[q] && !(out.lev[q] > out.h[q])) out.wat[q] = 0;
    };
    if (!d || k >= 1) { crop(hb, out.h); crop(seaB, out.sea); cropLakes(); return out; }

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
    // (the rocks, where any of their features is drawn at this zoom: steps on the gentlest slopes they are drawn on, the
    // rock's own landforms, the coast)
    const bedOn = fade(0.75 * FINE.bedStepKm / FINE.bedSlope[0]) > 0;
    const knF = fade(FINE.knobKm), hoF = fade(0.6 * FINE.hollowKm), formsOn = knF > 0.05 || hoF > 0, coastOn = fade(0.7 * FINE.coastWiggleKm) > 0;
    const lith = src.g?.rock && (bedOn || formsOn || coastOn) ? rockProps(src, W, X0, Y0, ew, eh, latR) : null;
    // (how much of each pixel's rock dissolves: karst)
    const karst = lith ? new Float32Array(N) : null;
    if (lith) for (let p = 0; p < N; p++) if (lith.soluble[p] > 0) karst[p] = lith.soluble[p] * wetSolution(lith.T[p], lith.P[p]);

    lap('rocks');
    // ── the rock's structure: layered rock stepped where the ground slopes through it — each place's height measured
    // from the beds' gently tilted surface, through a stair of treads and risers rounded at foot and rim (benches, the
    // rims of mesas, stepped canyon walls; cuestas where the beds dip against the slope) — crisp where it is dry ──
    // (a lowering never deeper than a share of the ground's height: a soft minimum)
    const shareCap = (v, p) => { if (!(v < 0)) return v; const b = FINE.gullyMaxShare * Math.max(1e-4, hb[p]); return -(-v * b / Math.hypot(v, b)); };
    const [rLo, rHi] = FINE.bedRainMm;
    if (lith && bedOn) {
        const dipF = 1 / FINE.bedDipWaveKm, riser = FINE.bedRiser, centre = 0.5 * (1 - riser) * 0.6;
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (seaB[p] || !(lith.land[p] > 0) || !(hb[p] > 0)) continue;
            const bed = lith.bedded[p];
            if (bed > 0.02) {
                const slope = Math.hypot(gE[p], gN[p]), gate = smooth(FINE.bedSlope[0], FINE.bedSlope[1], slope);
                if (gate > 0) {
                    place(j, i);
                    const n1 = smoothNoise(P[0] * dipF, P[1] * dipF, P[2] * dipF, seed * 5 + 21), n2 = smoothNoise(P[0] * dipF * 2.3, P[1] * dipF * 2.3, P[2] * dipF * 2.3, seed * 5 + 22);
                    const t = FINE.bedStepKm * (1 + 0.25 * Math.max(-1, Math.min(1, 2.4 * n2))), fS = fade(t / slope);
                    if (fS > 0) {
                        // (the beds: each its own thickness, 0.6–1.4 of a step, and its own hardness — a cliff-former's riser
                        // full, a soft bed's faint — the tread's foot at each bed's top, then its riser up to the next;
                        // continuous across every bed's top, where the stair meets the slope)
                        const phi = (hb[p] + D[p] - FINE.bedDipKm * (n1 + 0.5 * n2)) / t;
                        let k = Math.floor(phi), lo = bedLevel(k, seed);
                        if (phi < lo) lo = bedLevel(--k, seed);
                        let hi = bedLevel(k + 1, seed);
                        if (phi >= hi) { lo = hi; hi = bedLevel(++k + 1, seed); }
                        const span = hi - lo, f = (phi - lo) / span, u = Math.max(0, Math.min(1, (f - (1 - riser)) / riser));
                        const crisp = FINE.bedWet + (1 - FINE.bedWet) * (1 - smooth(rLo, rHi, lith.P[p]));
                        D[p] += bed * crisp * gate * fS * shareCap(t * (span * bedHard(k, seed) * (u * u * (3 - 2 * u) - f) + centre), p);
                    }
                }
            }
        }
    }
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
    fineLadder(D, { hb, gE, gN, seaB, coastKm, cosLa, sinLa, cosLo, sinLo, ew, eh, pxKm, picKm, seed, fade, reach });
    lap('ladder');
    // ── (fork) the rivers' valleys, cut along the lines the page draws (river-valleys.js) ──
    carveValleys(D, src.rv ?? (src.rvAll ? cropLines(src.rvAll, { W, x0, y0, w, h }, M) : null), { hb, gE, gN, seaB, W, X0, Y0, ew, eh, pxKm, cosLa, sinLa, cosLo, sinLo, seed, fade });
    lap('valleys');
    // ── the heights; the sea where they are below it at or near the picture's sea (no new inland seas: land stays land) ──
    const hf = new Float32Array(N), sea = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
        const v = hb[p] + D[p];
        if (v < 0 && coastKm[p] < reach) { hf[p] = v; sea[p] = 1; } else hf[p] = v < 0 ? 0.001 : v;
    }
    crop(hf, out.h); crop(sea, out.sea); cropLakes();
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
