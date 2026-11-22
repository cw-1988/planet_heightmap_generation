// An export wider than EXPORT_MAX, on a computer (from PR #155; its owner, 2026-11-10: "65536, and yes we can offer to
// split tiles"): drawn a band of rows at a time — the detail finer than the mesh for those rows and a row either side
// (the hillshade's neighbours, so bands meet as one picture), then each map's rows as export.js produceMap draws the
// whole, row for row — and each band's rows written to the files as they come (export-panel.js runBands), so no picture
// of the whole planet is ever held.

import { paintWindow } from './finish-view.js';
import { drawRiversWindow } from './river-draw.js';
import { finishedClimateColor, finishedClimateValue } from './climate-view.js';
import { finishedFarmingColor, finishedFarmingValue } from './farming-view.js';
import { canvasOf } from '../view/png.js';
import { cloudPicture, cloudOver } from '../view/clouds.js';
import { scaled, hillshade8, classIndexMap } from '../view/export-raster.js';
import { produceGeology } from './geology-export.js';
import { KOPPEN_RGB, CLIMATE_LAYER_OF, CTX_2D, rollRows, rollShift, height16, landHeight16, mask8, koppenRgba, lakesRgba, cloudsOf } from './export-pixels.js';

/** The rows of a band W wide: about 16 million pixels (256 at 65,536), a power of two (a 16,384-px tile holds whole bands). */
export const bandRows = W => Math.max(16, Math.min(1024, 2 ** Math.floor(Math.log2(2 ** 24 / W))));

/**
 * A band of a W-wide planet: rows y0 … y0 + n − 1, with the detail finer than the mesh drawn for them and a row either
 * side (`fw` {h, sea, wat, lev}: the planet's rows from `from` on). `fine(fin, seed, win)`: the page's drawing of a window
 * (detail-view.js DetailService.window — fine-detail.js fineWindow's, which windows drawn apart agree with).
 */
export async function drawBand(fine, fin, seed, W, y0, n) {
    const from = Math.max(0, y0 - 1), to = Math.min(W >> 1, y0 + n + 1);
    return { W, y0, n, from, fw: await fine(fin, seed, { W, x0: 0, y0: from, w: W, h: to - from }) };
}
/** A band's own rows of its picture, as export.js pictureAt gives the planet's (`landOnly`: the sea and lakes' beds at 0). */
function bandPicture(B, { landOnly = false } = {}) {
    const { W, y0, n, from, fw } = B, a = (y0 - from) * W, b = a + n * W;
    const f = { h: fw.h.subarray(a, b), sea: fw.sea.subarray(a, b), wat: fw.wat.subarray(a, b), lev: fw.lev ? fw.lev.subarray(a, b) : null };
    if (!landOnly) return f;
    const h = new Float32Array(n * W);
    for (let i = 0; i < h.length; i++) h[i] = f.sea[i] ? 0 : Math.max(0, f.h[i]);
    return { ...f, h };
}
let paintScratch = null;
/** A band painted as export.js paintAt paints the planet: over its rows and a row either side (the hillshade's), its own kept. */
function bandPaint(B, image, lut, opts) {
    const { W, y0, n, from, fw } = B, rows = fw.h.length / W, len = 4 * W * rows;
    if (!(paintScratch?.length >= len)) paintScratch = new Uint8ClampedArray(len);
    const all = paintScratch.subarray(0, len);
    paintWindow(fw, { W, x0: 0, y0: from, w: W, h: rows }, all, lut, opts);
    image.data.set(all.subarray(4 * W * (y0 - from), 4 * W * (y0 - from + n)));
}
/** The rivers' lines over a band's colours, as colorMap draws them over the planet (as thick, relative to the map, as on a
 *  2048-wide one): on canvases at most 8192 wide (a browser's canvas has its limits), each over its columns. */
function riversOverBand(rgba, B, fin, look) {
    const { W, y0, n } = B, CW = 8192;
    for (let x0 = 0; x0 < W; x0 += CW) {
        const w = Math.min(CW, W - x0), canvas = canvasOf(w, n), ctx = canvas.getContext('2d', CTX_2D), img = new ImageData(w, n);
        for (let j = 0; j < n; j++) img.data.set(rgba.subarray(4 * (j * W + x0), 4 * (j * W + x0 + w)), 4 * j * w);
        ctx.putImageData(img, 0, 0);
        drawRiversWindow(ctx, fin, look.riverQ, look.byRegime, W, x0, y0, w, n, look.riverWidth ?? 1, false);
        const back = ctx.getImageData(0, 0, w, n).data;
        for (let j = 0; j < n; j++) rgba.set(back.subarray(4 * j * w, 4 * (j + 1) * w), 4 * (j * W + x0));
    }
}

/**
 * A band's rows of one map (`B` from drawBand), as produceMap draws the whole planet's: {kind, W, H (the band's rows),
 * data, alpha?}, centred on lk.centerLon. `memo`: the run's colours and samplers, each made once (a Map). Not for a
 * row's files that are not maps (the districts, the atlas: produceMap gives those, whatever the width).
 */
export function produceBand(fin, W, lk, job, B, memo = new Map()) {
    const r = bandUnturned(fin, W, lk, job, B, memo);
    return { ...r, data: rollRows(r.data, W, B.n, r.kind === 'rgba' ? 4 : 1, rollShift(W, lk.centerLon)) };
}
function bandUnturned(fin, W, lk, job, B, memo) {
    const s = job.season || 'year', id = job.row.id, { y0, n } = B, pic = bandPicture(B), R = fin.climate?.raster;
    const once = (k, make) => { if (!memo.has(k)) memo.set(k, make()); return memo.get(k); };
    if (job.row.geology) return produceGeology(fin, W, lk, job, { rows: { y0, n }, pictureAt: (_f, _W, o) => bandPicture(B, o), paintAt: (_f, _W, image, lut, o) => bandPaint(B, image, lut, o) });
    const map = (kind, data, alpha = false) => ({ kind, W, H: n, data, ...(alpha ? { alpha } : {}) });
    const paint = (lakes, colorAt, exaggeration = lk.exaggeration) => {
        const image = { data: new Uint8ClampedArray(4 * W * n) };
        bandPaint(B, image, lk.lut, { exaggeration, lakes, shaded: lk.shaded !== false, colorAt });
        return image.data;
    };
    if (job.variant === 'colour') {
        if (id === 'color') {
            const d = paint(lk.water, null);
            if (lk.water && fin.rivers) riversOverBand(d, B, fin, lk);
            return map('rgba', d);
        }
        if (job.row.needs === 'farming') return map('rgba', paint(true, once(`farm|${id}`, () => finishedFarmingColor(id, fin, W))));
        if (id === 'satellite' || id === 'satelliteClouds') {
            const d = paint(true, once(`sat|${s}`, () => finishedClimateColor('satellite', s, fin.climate, W, lk.lut, fin)), lk.exaggeration * 1.25);
            if (id === 'satelliteClouds') cloudOver(cloudsOf(fin, s, W, lk), d, W, undefined, y0, n);
            return map('rgba', d);
        }
        if (id === 'clouds') return map('rgba', cloudPicture(cloudsOf(fin, s, W, lk), W, undefined, y0, n), true);
        if (id === 'koppen') return map('rgba', koppenRgba(classIndexMap(R, R.koppen, KOPPEN_RGB.length, W, pic.sea, y0, n)));
        if (id === 'rivers') {
            const d = lakesRgba(new Uint8ClampedArray(4 * W * n), pic.wat, pic.sea, lk.lut);
            if (fin.rivers) riversOverBand(d, B, fin, lk);
            return map('rgba', d, true);
        }
        return map('rgba', paint(lk.water, once(`clim|${id}|${s}`, () => finishedClimateColor(CLIMATE_LAYER_OF[id] || id, s, fin.climate, W, lk.lut, fin))));
    }
    const key = job.file.key;
    if (key === 'heightmap') return map('gray16', height16(pic.h));
    if (key === 'landheightmap') return map('gray16', landHeight16(bandPicture(B, { landOnly: true })));
    if (key === 'landmask') return map('gray8', mask8(pic.sea));
    if (key === 'hillshade') return map('gray8', hillshade8(B.fw.h, W, W >> 1, lk.exaggeration, { y0, n, from: B.from }));
    if (key === 'koppenIndex') return map('gray8', classIndexMap(R, R.koppen, KOPPEN_RGB.length, W, pic.sea, y0, n));
    const file = job.file, sea = pic.sea;
    if (job.row.needs === 'farming') {
        const at = once(`farmv|${key}`, () => finishedFarmingValue(key, fin, W)), eight = file.bits === 8, top = eight ? 255 : 65535, out = eight ? new Uint8Array(W * n) : new Uint16Array(W * n);
        for (let j = 0; j < n; j++) for (let x = 0; x < W; x++) { const p = j * W + x; out[p] = sea[p] ? 0 : Math.round(top * scaled(at(x, y0 + j), file.scale)); }
        return map(eight ? 'gray8' : 'gray16', out);
    }
    const at = once(`climv|${key}|${s}`, () => finishedClimateValue(key, s, fin.climate, W)), out = new Uint16Array(W * n);
    for (let j = 0; j < n; j++) for (let x = 0; x < W; x++) { const p = j * W + x; out[p] = Math.round(65535 * scaled(at(x, y0 + j, !!sea[p]), file.scale)); }
    return map('gray16', out);
}
