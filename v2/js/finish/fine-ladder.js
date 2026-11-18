// The world map's finer ground (fork addition; docs/world-map-detail.md): an opened region's detail (region-relief.js
// detailWaves) drawn on the world map's tiles too, each octave faded in as the tile's pixels can hold it (fine-detail.js's
// fade) — so a coarser tile and a finer one of the same place agree, and zooming in keeps finding more. Read on the sphere,
// the same at every level.
//   · The rolling waves (plains, hills, the coast's fractal shapes) are the region's noise. Near the coast they may take
//     the ground below the sea and raise the shallow sea floor above it (coves, spits, islets); inland a lowering is held
//     above the sea (a soft cap, no kink), so the plains get no pits of new sea. The deep sea floor gets none.
//   · The hills' and mountains' texture: the same rolling waves on down, every octave the pixels hold, each turned its
//     own way, plain fractal noise: none warped (under the broad warp the waves bent into worms, swirls on the hills),
//     no patchy roughness, each gentler than the last (LADDER.fall) — a grain on the broad forms. Removed
//     2026-11-18: the finer ridges (phacelle stripes steered down the slope: swirls, worms, pixel noise), the ridged waves
//     (their creases wandered as noodles) and the finer octaves' warp (it drew small waves out into worms).

import { detailWaves, detailOf } from '../region/region-relief.js';

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * How steep each octave is: the picture's own slope where it is (at least `floor`, + `floorM` on the mountains — a crest's
 * slope is ~0) at its finest wave (2 of its pixels), gentler by 2^`fall` each octave down, at most the region's slope
 * (region-relief.js detailOf). The region's slope at once — ~0.4 on any mountain, a region's ~100 m pixels' — drew the
 * first octave the tiles hold 9× the picture's slope (L4 0.007 → L5 0.053 the median of a range): the picture's ranges
 * gone under an even field of bumps the moment the tiles came in.
 */
const LADDER = { fall: 0.15, floor: 0.006, floorM: 0.005 };

/** The picture's slope at a pixel as the ladder reads it: `ge`, `gn` its smoothed slope, `hKm` its height (the floor). */
export const pictureSlope = (ge, gn, hKm) => Math.max(Math.hypot(ge, gn), LADDER.floor + LADDER.floorM * smooth(500, 2200, 1000 * hKm));
/**
 * How steep a wave of `lam` km may be over a picture of `picKm` pixels sloping `sp` (pictureSlope): gentler by 2^`fall`
 * each octave down, so the broad forms lead the shading and the finer ones are a grain on them. (Steeper by 2^0.3 each
 * octave down, every octave shaded as hard as the last and the finest led: a crumpled field of worms on every hill.)
 */
export const ladderSlope = (sp, lam, picKm) => sp * (lam / (2 * picKm)) ** LADDER.fall;

/**
 * Adds the waves to D (km) over the window ew × eh: `hb` the enlarged picture's heights (km), `gE`, `gN` its smoothed slope
 * (km per km, east and north), `seaB` its sea, `coastKm` its distance from the coast (+ land, − sea; right out to `reach`,
 * coast-distance.js), each row's and column's cos/sin of latitude and longitude, `pxKm` the window's pixel, `picKm` the
 * picture's (the ladder starts at 2.5 of them, as a region's does), `fade(λ km)` how much of a wave the pixels hold.
 */
export function fineLadder(D, { hb, gE, gN, seaB, coastKm, cosLa, sinLa, cosLo, sinLo, ew, eh, pxKm, picKm, seed, fade, reach }) {
    const top = 2.5 * picKm, L = { top, s1: 1 / top }, wts = [];
    // (every octave the pixels hold — the picture's forms carried on down as texture — rolling and unwarped: the finer
    // octaves bent by the warp, and the ridges' creases, drew noodles up close; with none at all the hills went blurred)
    for (let o = 0, lam = top; fade(lam) > 0 && o < 16; o++, lam /= 2) wts.push(fade(lam));
    const o1 = wts.length;
    if (!o1) return;
    const N = ew * eh, waves = detailWaves(seed * 7 + 101, true, { fineWarp: 0, rolling: true, broadTo: 0 }), out = { d: 0, A: 0, m: 0, slope: 0, relief: 0 }, det = { slope: 0, relief: 0 };
    const T = new Float32Array(N), lim = new Float32Array(N);
    // (each octave's growth over the picture's finest wave; a pixel's weights)
    const G = wts.map((_, o) => ladderSlope(1, top / 2 ** o, picKm)), wp = new Float32Array(o1);
    // ── the rolling waves ──
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, hp = hb[p], deep = smooth(-0.3, -0.15, hp);
        if (!(deep > 0)) continue;
        const sp = pictureSlope(gE[p], gN[p], hp), s0 = detailOf(1000 * hp, 1, det).slope;
        for (let o = 0; o < o1; o++) wp[o] = wts[o] * Math.min(1, sp * G[o] / s0);
        waves(R * cosLa[j] * cosLo[i], R * cosLa[j] * sinLo[i], R * sinLa[j], 1000 * hp, L, 0, o1, out, wp);
        T[p] = deep * out.d / 1000;
        // (inland a lowering held above the sea — a soft minimum — and free within the coast's reach)
        lim[p] = seaB[p] ? 0 : 0.9 * Math.max(1e-4, hp) + 10 * (1 - smooth(0.5 * reach, reach, coastKm[p]));
    }
    for (let p = 0; p < N; p++) {
        let t = T[p];
        if (t < 0 && lim[p] > 0) t = -(-t * lim[p] / Math.hypot(t, lim[p]));
        D[p] += t;
    }
}
