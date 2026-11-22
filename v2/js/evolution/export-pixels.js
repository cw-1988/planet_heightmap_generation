// The export's pixel work shared by the whole planet's maps (export.js) and a band's (export-bands.js): the heights' and
// masks' values, the Köppen and lake colours, the turn to the centre longitude, the clouds kept per moment.

import { lakeColor } from './finish-view.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { cloudFields, cloudGrid, cloudStorms } from '../view/clouds.js';

/** The heightmap's scale: black −11 km (below the deepest trench), white +9 km (above the highest peak), linear. */
export const HEIGHT_RANGE_M = [-11000, 9000];
/** The land heightmap's: the sea black (0), land from 0 m (1) to +9 km (65535), linear. */
export const LAND_TOP_M = 9000;
export const KOPPEN_RGB = KOPPEN_CLASSES.map(k => k.color.map(v => Math.round(255 * v)));
/** The row ids whose colours climate-view.js names otherwise. */
export const CLIMATE_LAYER_OF = { precip: 'rain' };
// (the export's canvases rasterized in software, whatever their size: on the GPU, Chrome drew the rivers' lines on a
// whole planet's canvas thinner than on a band's — the maps of an export at 16,384 px and at 32,768 disagreed — and
// every one of them is read back; from PR #155)
export const CTX_2D = { willReadFrequently: true };

// ── the centre longitude: every map turned so that `look.centerLon` (degrees) is in the middle, as the map view is ──
/** How many columns to roll a W-wide map for a centre longitude (0 … W−1). */
export const rollShift = (W, centerLon) => ((Math.round(W * (centerLon || 0) / 360) % W) + W) % W;
/** A map's rows rolled left by `shift` columns (`ch` values a pixel): what was at the centre longitude is now mid-row. */
export function rollRows(arr, W, H, ch, shift) {
    if (!shift) return arr;
    const out = new arr.constructor(arr.length), rowLen = W * ch, s = shift * ch;
    for (let y = 0; y < H; y++) {
        const o = y * rowLen;
        out.set(arr.subarray(o + s, o + rowLen), o);
        out.set(arr.subarray(o, o + s), o + rowLen - s);
    }
    return out;
}

// (each pixel's value from the picture's — the whole planet's, or a band's)
export function height16(h) {
    const [lo, hi] = HEIGHT_RANGE_M, out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = Math.round(65535 * Math.min(1, Math.max(0, (1000 * h[i] - lo) / (hi - lo))));
    return out;
}
export function landHeight16({ h, sea }) {
    const out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = sea[i] ? 0 : 1 + Math.round(65534 * Math.min(1, Math.max(0, 1000 * h[i] / LAND_TOP_M)));
    return out;
}
export function mask8(sea) {
    const out = new Uint8Array(sea.length);
    for (let i = 0; i < sea.length; i++) out[i] = sea[i] ? 0 : 255;
    return out;
}
export function koppenRgba(idx) {
    const rgba = new Uint8ClampedArray(4 * idx.length);
    for (let p = 0; p < idx.length; p++) { const c = KOPPEN_RGB[idx[p]], o = 4 * p; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
    return rgba;
}
/** The lakes in the Terrain view's colours, written into `d` (RGBA) where a pixel is a lake. */
export function lakesRgba(d, wat, sea, lut) {
    if (wat) for (let p = 0; p < sea.length; p++) {
        if (!wat[p] || sea[p]) continue;
        const c = lakeColor(lut, wat[p]), o = 4 * p;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    return d;
}

/** The clouds of a moment for a season (view/clouds.js cloudGrid: at most 2048 wide, one still moment, the storms the
 *  world's own — its numeric seed), kept per moment so both cloud rows (and every band) draw them once. */
const cloudGrids = new WeakMap();
export function cloudsOf(fin, season, W, look) {
    let byKey = cloudGrids.get(fin.climate);
    if (!byKey) cloudGrids.set(fin.climate, byKey = new Map());
    const key = `${season}|${Math.min(W, 2048)}|${look.cloudSeed ?? 0}`;
    if (!byKey.has(key)) byKey.set(key, cloudGrid(cloudFields(fin.climate, season), cloudStorms(look.cloudSeed ?? 0, fin.climate, season), W));
    return byKey.get(key);
}
