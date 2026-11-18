// The world map's finer ground (fork addition; docs/world-map-detail.md): an opened region's detail (region-relief.js
// detailWaves: warped noise, rolling on the plains and ridged in the mountains, each wave as steep as the land's kind) drawn
// on the world map's tiles too, each octave faded in as the tile's pixels can hold it (fine-detail.js's fade) — so a
// coarser tile and a finer one of the same place agree, and zooming in keeps finding more. The waves are read on the
// sphere, the same at every level. Near the coast they may take the ground below the sea and raise the shallow sea floor
// above it, so the coastline turns fractal (coves, spits, islets); inland a lowering is held above the sea (a soft cap,
// no kink), so the plains get no pits of new sea. The deep sea floor gets none.

import { detailWaves } from '../region/region-relief.js';

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Adds the waves to D (km) over the window ew × eh: `hb` the enlarged picture's heights (km), `seaB` its sea, `coastKm`
 * its distance from the coast (+ land, − sea; right out to `reach`, coast-distance.js), each row's and column's cos/sin of
 * latitude and longitude, `pxKm` the window's pixel, `picKm` the picture's (the ladder starts at 2.5 of them, as a
 * region's does), `fade(λ km)` how much of a wave the pixels hold.
 */
export function fineLadder(D, { hb, seaB, coastKm, cosLa, sinLa, cosLo, sinLo, ew, eh, picKm, seed, fade, reach }) {
    const top = 2.5 * picKm, L = { top, s1: 1 / top }, wts = [];
    for (let o = 0, lam = top; fade(lam) > 0 && o < 16; o++, lam /= 2) wts.push(fade(lam));
    const o1 = wts.length;
    if (!o1) return;
    const waves = detailWaves(seed * 7 + 101), out = { d: 0, A: 0 };
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, hp = hb[p], deep = smooth(-0.3, -0.15, hp);
        if (!(deep > 0)) continue;
        waves(R * cosLa[j] * cosLo[i], R * cosLa[j] * sinLo[i], R * sinLa[j], 1000 * hp, L, 0, o1, out, wts);
        let t = deep * out.d / 1000;
        // (inland a lowering held above the sea — a soft minimum — and free within the coast's reach)
        if (t < 0 && !seaB[p]) {
            const lim = 0.9 * Math.max(1e-4, hp) + 10 * (1 - smooth(0.5 * reach, reach, coastKm[p]));
            t = -(-t * lim / Math.hypot(t, lim));
        }
        D[p] += t;
    }
}
