// How much of a feature a picture's pixels hold (fork addition; docs/world-map-detail.md): one fade for the world map's
// ground (fine-detail.js), its river valleys and meanders (river-valleys.js, river-meander.js) and the rivers the page
// draws over them (finish-view.js) — so the drawn line and the valley under it bend alike at every zoom.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A feature is drawn once its wavelength spans this many pixels, faded in over twice that (no scratches). */
export const FADE_PX = 6;

/** The fade of a picture whose pixel is `pxKm` km: fade(λ km), 0 … 1. */
export const fadeFor = pxKm => lam => smooth(FADE_PX, 2 * FADE_PX, lam / pxKm);
