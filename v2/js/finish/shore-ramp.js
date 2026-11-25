// The water's edge (docs/shore-transition.md): the sea and the lakes are water you see into, the bed showing through
// the shallows and fading with depth (lake-water.js lakeMix, Beer–Lambert). Where the bed drops off steeply the water is
// deep a pixel out and the bed was gone at once: a hard line at every shore (the owner, 2026-11-20: "give it some
// transparency that tapers off the deeper the lake/sea gets... and if the sea/lake drops off too fast give it a minimum
// transition distance"). So within a ramp from the shore (`rampKm`, several pixels up close, fewer far out) the water is see-through:
// the depth the eye is shown is held low (`seenDepthM`) and the water itself fades in over the bed (`shoreOpacity`).
// (The first ramp, 2 px and 30 m deep at its end, still read as a hard line: red is gone under a few metres of water, so
// the land's green turned cyan within a pixel — "not good enough".)
import { chamferSteps } from './coast-distance.js';
import { drain } from '../core/steps.js';
import { marginPx } from './fine-detail.js';
import { lakeHere } from '../evolution/lake-water.js';

export const SHORE = {
    minKm: 4,        // (the ramp at least this long, km…)
    // (…and minPx pixels where a pixel is pxAtKm, so it reads; coarser pixels get fewer, ×(pxAtKm / px km)^pxPow, down to
    // farPx — a fixed 10 px was 100 km of made-up shallows on the world picture, a pale sand-and-turquoise rim round every
    // coast from far out: the owner, 2026-11-20, "a weird blue halo outline", docs/shore-transition.md round 3…)
    minPx: 10, pxAtKm: 0.4, pxPow: 0.6, farPx: 1.5,
    // (…but never past a fine window's margin, less a pixel: there the distance is exact, so tiles agree — fine-detail.js
    // marginPx; past the ramp the true depth is shown, so a distance the window over-reads changes nothing)
    // (a small lake's ramp no longer than this × its radius: the 4 km ramp is wider than most of them, so a small lake's
    // water never showed whole and its bed's bowl stood in it as a crater. 1.5 keeps the bed seen sunk under its shallows:
    // 0.5 turned each pond a droplet on top of the ground — the owner, 2026-11-22, "the sunkenness was fine",
    // docs/small-lakes.md)
    pondRamp: 1.5,
    clearM: 8,       // (the ramp's depth: clearM·t²/(1 − t) at t of the way out — 2 m a third out, 8 m half out, ∞ at its end)
    // (the sea's attenuation, 1/m, red · green · blue: coastal water, Jerlov coastal 1. The open ocean's Jerlov I–II,
    // [0.38, 0.065, 0.03], let the sand show through 10–40 m of shelf tens of km out — a pale blue glow round every coast
    // on the Satellite: the owner, 2026-11-20, docs/satellite-sea.md)
    kSea: [0.42, 0.10, 0.13],
    // (the shoreline itself — beaches, cliffs, flats, marsh, surf — is the sea's work on each coast: littoral.js)
};

/** The ramp's least length in pixels at a pixel size (minPx up to pxAtKm, fewer for coarser pixels, at least farPx). */
const rampPx = pxKm => Math.max(SHORE.farPx, SHORE.minPx * Math.min(1, (SHORE.pxAtKm / pxKm) ** SHORE.pxPow));
/** The ramp's length (km) at a pixel size. */
export const rampKm = pxKm => Math.min(Math.max(SHORE.minKm, rampPx(pxKm) * pxKm), (marginPx(pxKm) - 1) * pxKm);

/** How far out of its ramp a water pixel `distKm` from its shore is: 0 at the shore … 1 at the ramp's end and past it;
 *  1 without a distance (NaN, undefined). */
export function shoreT(distKm, pxKm) {
    return distKm >= 0 ? Math.min(1, distKm / rampKm(pxKm)) : 1;
}

/** The depth (m) shown at a water pixel t of the way out of its ramp: its own, held under the ramp's. */
export function seenDepthM(depthM, t) {
    return t < 1 ? Math.min(depthM, SHORE.clearM * t * t / (1 - t)) : depthM;
}

/** How much of the water's own colour shows over the bed, t of the way out: 0 at the shore, rising smoothly to 1 a fifth
 *  of the way out. (It rose over the whole ramp, so the bed's dry sand showed as a wide beige band out in the sea — the
 *  owner, 2026-11-20; past the swash the held-low depth, seenDepthM, already lets the shallows' sand show turquoise.) */
export const shoreOpacity = t => { const s = Math.min(1, t / 0.2); return s * s * (3 - 2 * s); };

/** Whether an enlarged pixel is sea: its ground (km) below sea level and one of its four picture pixels (a b c d, their
 *  weights) the sea's — the coast the heights' 0 m contour. (Their weighted majority drew the coast on the picture's
 *  pixels, and ground below sea level past it as flat land.) The one rule for every enlarger: fine-detail.js,
 *  coast-distance.js, finish-view.js rasterAt. */
export function seaHere(hKm, O, a, b, c, d, wa, wb, wc, wd) {
    return hKm < 0 && ((wa > 0 && O[a]) || (wb > 0 && O[b]) || (wc > 0 && O[c]) || (wd > 0 && O[d])) ? 1 : 0;
}

/** How far (km) each water pixel (the sea, an open lake — not a salt pan) is from the nearest dry one (+), and each dry
 *  one from the nearest water (−). */
export function wetDistance(sea, wat, w, h, pxKm, cosLa) { return drain(wetDistanceSteps(sea, wat, w, h, pxKm, cosLa)); }
/** wetDistance a row at a time (core/steps.js). */
export function* wetDistanceSteps(sea, wat, w, h, pxKm, cosLa) {
    const N = w * h, m = new Uint8Array(N);
    for (let j = 0; j < h; j++) { for (let p = j * w, e = p + w; p < e; p++) m[p] = sea[p] || (wat && wat[p] && wat[p] !== 3) ? 1 : 0; yield; }
    const d = yield* chamferSteps(m, w, h, pxKm, cosLa);
    for (let j = 0; j < h; j++) { for (let p = j * w, e = p + w; p < e; p++) d[p] = -d[p]; yield; }
    return d;
}

/** The same on a fine window's margin grid (fine-detail.js), its lakes judged as the crop judges them (lakeHere). pondKm
 *  (optional): a small lake's radius (km) at its pixels — its distances stretched so its ramp is at most pondRamp × that
 *  (shoreT reads them against the full ramp). */
export function windowWetDistance(sea, watB, levB, shB, hf, ew, eh, pxKm, cosLa, pondKm = null) {
    const N = ew * eh, wat = new Uint8Array(N);
    if (watB) for (let p = 0; p < N; p++) if (watB[p] && watB[p] !== 3 && (!levB || lakeHere(levB[p], hf[p], shB[p]))) wat[p] = 1;
    const d = wetDistance(sea, wat, ew, eh, pxKm, cosLa), ramp = rampKm(pxKm);
    if (pondKm) for (let p = 0; p < N; p++) if (pondKm[p] > 0 && d[p] > 0) d[p] *= ramp / Math.min(ramp, SHORE.pondRamp * pondKm[p]);
    return d;
}

/** Each row's cosine of latitude of a picture W wide, rows y0 … y0 + h. */
export function rowCos(W, y0, h) {
    const HE = W >> 1, c = new Float64Array(h);
    for (let j = 0; j < h; j++) c[j] = Math.cos(((Math.min(HE - 1, Math.max(0, y0 + j)) + 0.5) / HE - 0.5) * Math.PI);
    return c;
}
