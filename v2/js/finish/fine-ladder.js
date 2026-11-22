// The world map's finer ground (fork addition; docs/world-map-detail.md): an opened region's detail (region-relief.js
// detailWaves) drawn on the world map's tiles too, each octave faded in as the tile's pixels can hold it (fine-detail.js's
// fade) — so a coarser tile and a finer one of the same place agree, and zooming in keeps finding more. Read on the sphere,
// the same at every level.
//   · The rolling waves (plains, hills, the coast's fractal shapes) are the region's noise. A lowering of the land is held
//     above the sea, and a raising of the sea floor below it (soft caps, no kink, opening past the coastline), each give or take
//     COAST_GIVE_KM of the picture's slope: the coast frays by up to a few hundred metres either way (coves, points,
//     islets), and the wiggle (fine-detail.js) moves it further. (probe-coast-fine.mjs, 2026-11-20: the
//     coast's land and sea trade alike, net 0.0% of the area up close.) The deep sea floor gets none.
//   · The hills' and mountains' texture: the same rolling waves on down, every octave the pixels hold, each turned its
//     own way, plain fractal noise: none warped (under the broad warp the waves bent into worms, swirls on the hills),
//     no patchy roughness, each gentler than the last (LADDER.fall) — a grain on the broad forms, as strong on a crest as
//     on a flank (LADDER.share: by the ground's kind, not the picture's slope at the pixel). Removed
//     2026-11-18: the finer ridges (phacelle stripes steered down the slope: swirls, worms, pixel noise), the ridged waves
//     (their creases wandered as noodles) and the finer octaves' warp (it drew small waves out into worms).

import { detailOf, turnedNoise } from '../region/region-relief.js';

const R = 6371, D2R = Math.PI / 180;
/**
 * An octave whose wave spans 2 × this many pixels or more is read on a grid of every st-th pixel of the planet (st the
 * largest power of 2 that leaves it this many grid points a wave) and drawn between them by Catmull-Rom: the grid is the
 * planet's, so two tiles that meet read the same points. (A level-14 tile: 3 of its ~10 octaves per pixel.)
 */
const GRID_PER_WAVE = 8;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * How steep each octave is: `share` of the region's slope for the ground's kind (region-relief.js detailOf, by its height
 * alone: ~0.4 on the mountains, ~0.1 in hill country, ~0.035 on plains) at its finest wave (2 of the picture's pixels),
 * gentler by 2^`fall` each octave down. The same grain over a whole range, crest and flank alike. (Scaled by the
 * picture's own slope at each pixel, it vanished on every crest, summit and valley floor — slope ~0 there — and stayed
 * on the flanks: blurred patches beside textured ones. The region's whole slope drew the first octave the tiles hold 9×
 * the picture's slope: the ranges gone under an even field of bumps.)
 */
const LADDER = { fall: 0.15, share: 0.08 };
/** How far the waves may move the coast (km, at the picture's slope there, at least COAST_SLOPE km per km). */
const COAST_GIVE_KM = 0.3, COAST_SLOPE = 0.004;
/** How fast a cap opens past the coastline (km of cap per km of height: the lowering's under the sea, the raising's on land). */
const COAST_OPEN = 20;

/**
 * How steep a wave of `lam` km may be over a picture of `picKm` pixels, in parts of `sp`: gentler by 2^`fall`
 * each octave down, so the broad forms lead the shading and the finer ones are a grain on them. (Steeper by 2^0.3 each
 * octave down, every octave shaded as hard as the last and the finest led: a crumpled field of worms on every hill.)
 */
export const ladderSlope = (sp, lam, picKm) => sp * (lam / (2 * picKm)) ** LADDER.fall;

/**
 * Adds the waves to D (km) over the window ew × eh: `hb` the enlarged picture's heights (km), `gE`, `gN` its slope, each
 * row's and column's cos/sin of latitude and longitude, `picKm` the
 * picture's (the ladder starts at 2.5 of them, as a region's does), `fade(λ km)` how much of a wave the pixels hold.
 */
export function fineLadder(D, { hb, gE, gN, cosLa, sinLa, cosLo, sinLo, ew, eh, picKm, seed, fade, W, X0, Y0, pxKm, grid = true }) {
    const top = 2.5 * picKm, wts = [];
    // (every octave the pixels hold — the picture's forms carried on down as texture — rolling and unwarped: the finer
    // octaves bent by the warp, and the ridges' creases, drew noodles up close; with none at all the hills went blurred)
    for (let o = 0, lam = top; fade(lam) > 0 && o < 16; o++, lam /= 2) wts.push(fade(lam));
    const o1 = wts.length;
    if (!o1) return;
    const N = ew * eh;
    // (each pixel's share of the waves and the ground's kind: detailOf by the height alone — the region's rolling ladder)
    const deep = new Float32Array(N), sl = new Float32Array(N), rl = new Float32Array(N), det = { slope: 0, relief: 0 };
    let any = false;
    for (let p = 0; p < N; p++) {
        const hp = hb[p], dp = smooth(-0.3, -0.15, hp);
        if (!(dp > 0)) continue;
        any = true; deep[p] = dp; detailOf(1000 * hp, 1, det); sl[p] = det.slope / 5; rl[p] = det.relief;
    }
    if (!any) return;
    // (each octave's weight, the same at every pixel: the waves' own slope, detailOf by the height, carries the ground's kind)
    const wp = Float32Array.from(wts, (w, o) => w * Math.min(1, ladderSlope(LADDER.share, top / 2 ** o, picKm)));
    // ── the rolling waves: each octave read per pixel, or on the planet's grid of every st-th pixel where its wave spans
    // GRID_PER_WAVE of them (bench-fine-ladder.mjs) ──
    const nz = turnedNoise(seed * 7 + 101), d = new Float64Array(N), at = { W, X0, Y0, ew, eh, cosLa, sinLa, cosLo, sinLo };
    for (let o = 0, lam = top; o < o1; o++, lam /= 2) {
        const f = 2 ** o / top, lamM = 1000 * lam, w = wp[o];
        let st = 1;
        if (grid) while (2 * st * GRID_PER_WAVE * pxKm <= lam) st *= 2;
        if (st >= 2) { gridOctave(d, deep, sl, rl, nz, o, f, lamM, w, st, at); continue; }
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (!deep[p]) continue;
            d[p] += Math.min(rl[p], sl[p] * lamM) * w * nz(R * cosLa[j] * cosLo[i], R * cosLa[j] * sinLo[i], R * sinLa[j], o, f);
        }
    }
    for (let p = 0; p < N; p++) {
        if (!deep[p]) continue;
        const hp = hb[p], t = deep[p] * d[p] / 1000;
        if (t === 0) continue;
        // (the land's lowering held above the sea, the sea floor's raising below it — soft caps — give or take the coast's
        // give. Each cap runs on through the picture's coastline, opening fast on the far side: switched there, and off at
        // the reach, a wave's height jumped, and the hillshade drew a ring round every coast, in the sea or on the land
        // where the wiggle had moved the coast — the owner, 2026-11-20: "fix the obvious flaw")
        const give = COAST_GIVE_KM * Math.max(COAST_SLOPE, Math.hypot(gE[p], gN[p]));
        // (the lowering's cap, or the raising's)
        const c = give + (t < 0 ? 0.9 * Math.max(0, hp) + COAST_OPEN * Math.max(0, -hp) : 0.9 * Math.max(0, -hp) + COAST_OPEN * Math.max(0, hp));
        D[p] += t * c / Math.hypot(t, c);
    }
}

/** Catmull-Rom's four weights at `u` (0 … 1 between the middle two points) into w at k. */
function cubicW(u, w, k) {
    const u2 = u * u, u3 = u2 * u;
    w[k] = (-u3 + 2 * u2 - u) / 2; w[k + 1] = (3 * u3 - 5 * u2 + 2) / 2; w[k + 2] = (-3 * u3 + 4 * u2 + u) / 2; w[k + 3] = (u3 - u2) / 2;
}

/**
 * Octave o (frequency f, wave lamM m, weight w) added to d over the window: read at the planet's pixels whose column and
 * row are multiples of st (the rows held to the planet's, as the window's are), drawn between them along each grid row,
 * then down each column.
 */
function gridOctave(d, deep, sl, rl, nz, o, f, lamM, w, st, { W, X0, Y0, ew, eh, cosLa, sinLa, cosLo, sinLo }) {
    const HE = W >> 1, rowOf = (Y) => Math.min(HE - 1, Math.max(0, Y));
    const ga = Math.floor(X0 / st) - 1, gw = Math.floor((X0 + ew - 1) / st) + 2 - ga + 1;
    const ja = Math.floor(rowOf(Y0) / st) - 1, gh = Math.floor(rowOf(Y0 + eh - 1) / st) + 2 - ja + 1;
    const cLo = new Float64Array(gw), sLo = new Float64Array(gw);
    for (let a = 0; a < gw; a++) { const lo = (((ga + a) * st + 0.5) * 360 / W - 180) * D2R; cLo[a] = Math.cos(lo); sLo[a] = Math.sin(lo); }
    // the grid's rows, each drawn across the window's columns
    const xi = new Int32Array(ew), wx = new Float64Array(4 * ew), H = new Float64Array(gh * ew), G = new Float64Array(gw);
    for (let i = 0; i < ew; i++) { const X = X0 + i, c = Math.floor(X / st); xi[i] = c - ga - 1; cubicW((X - c * st) / st, wx, 4 * i); }
    for (let b = 0; b < gh; b++) {
        const la = (90 - (rowOf((ja + b) * st) + 0.5) * 180 / HE) * D2R, cl = R * Math.cos(la), z = R * Math.sin(la);
        for (let a = 0; a < gw; a++) G[a] = nz(cl * cLo[a], cl * sLo[a], z, o, f);
        for (let i = 0, q = b * ew; i < ew; i++) {
            const k = xi[i], m = 4 * i;
            H[q + i] = wx[m] * G[k] + wx[m + 1] * G[k + 1] + wx[m + 2] * G[k + 2] + wx[m + 3] * G[k + 3];
        }
    }
    // down the columns, at each pixel that takes waves
    const wy = new Float64Array(4);
    for (let j = 0; j < eh; j++) {
        const Y = rowOf(Y0 + j), r = Math.floor(Y / st), q0 = (r - ja - 1) * ew;
        cubicW((Y - r * st) / st, wy, 0);
        for (let i = 0, p = j * ew; i < ew; i++, p++) {
            if (!deep[p]) continue;
            const v = wy[0] * H[q0 + i] + wy[1] * H[q0 + ew + i] + wy[2] * H[q0 + 2 * ew + i] + wy[3] * H[q0 + 3 * ew + i];
            d[p] += Math.min(rl[p], sl[p] * lamM) * w * v;
        }
    }
}
