// Dev tool (not shipped): crops of the region pick's valleys for image checks, drawn as the Terrain view draws the planet
// (its colours, hillshade and lakes; the map's own rivers, at the crop's scale), each pixel's valley as the overlay
// shows it and the pick reads it (region-grid.js). Every valley's edge a thin dark line, the chosen ones' a white one over a light tint. Posted to
// the dev server's /__shot (tuning/screenshots/). In the page: (await import('/tuning/region-shots.js')).shot(...).

import { unitAt } from '../js/region-bank.js';
import { valleyGrid, gridAt } from '../js/region-grid.js';
import { colorMap } from '../v2/js/evolution/export.js';
import { drawRiversWindow } from '../v2/js/evolution/finish-view.js';
import { heightLutOf } from '../v2/js/evolution/looks.js';

const BASE_W = 4096;

/** The planet painted once at BASE_W (no rivers: those are drawn per crop, sharp). */
function base(world) {
    if (world._shotBase) return world._shotBase;
    const fin = world.fin, look = { lut: heightLutOf('relief'), exaggeration: 20, water: true, riverQ: 40, byRegime: false, shaded: true, centerLon: 0 };
    const m = colorMap({ ...fin, rivers: null }, BASE_W, look), c = new OffscreenCanvas(m.W, m.H);
    c.getContext('2d').putImageData(new ImageData(m.data, m.W, m.H), 0, 0);
    return (world._shotBase = c);
}

/**
 * A crop round the valleys `ids` of the pick's state `C` (region-pick.js regionChosen), `px` wide, `pad` of their extent
 * added each side; marked (white edge, tint) unless `mark` is false. Posted as `name`; returns its size and box.
 */
export async function shot(C, ids, name, { px = 900, pad = 0.8, mark = true } = {}) {
    const { world, V } = C, mesh = world.tMesh, xyz = mesh.xyz;
    await valleyGrid(world, V);
    let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
    for (const id of ids) for (const c of V.cells.get(id)) {
        const u = (Math.atan2(xyz[3 * c + 1], xyz[3 * c]) + Math.PI) / (2 * Math.PI), v = (Math.PI / 2 - Math.asin(xyz[3 * c + 2])) / Math.PI;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    // (a square-ish box: the extent padded, in the map's own pixels)
    const e = Math.max(u1 - u0, (v1 - v0) / 2) * (1 + 2 * pad), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const W = Math.round(px / e), H = W / 2, w = px, h = Math.min(Math.round(px * 0.8), Math.round(e * W * 0.8));
    const x0 = Math.round(cu * W - w / 2), y0 = Math.max(0, Math.round(cv * H - h / 2));
    await render(C, W, x0, y0, w, h, new Set(ids), mark, name);
    return { name, w, h, kmPx: 40030 * Math.cos(Math.PI / 2 - cv * Math.PI) / W };
}

/**
 * The whole planet at `W` px wide (equirectangular, longitude −180° at the left), every valley's edge a dark line,
 * none chosen: for an inspector to pick its own places. Posted as `name`.
 */
export async function atlas(C, name, W = 4096) {
    await valleyGrid(C.world, C.V);
    await render(C, W, 0, 0, W, W / 2, new Set(), false, name);
    return { name, w: W, h: W / 2, kmPxEquator: 40030 / W };
}

async function render(C, W, x0, y0, w, h, chosen, mark, name) {
    const { world, V } = C, mesh = world.tMesh, H = W / 2;
    const cv2 = new OffscreenCanvas(w, h), ctx = cv2.getContext('2d'), B = base(world), k = B.width / W;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(B, x0 * k, y0 * k, w * k, h * k, 0, 0, w, h);
    drawRiversWindow(ctx, world.fin, 40, false, W, x0, y0, w, h, 2 * (W / 4096) ** 0.3 / (W / 2048));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // each pixel's valley
    const U = new Int32Array(w * h);
    for (let j = 0; j < h; j++) {
        const lat = Math.PI / 2 - (y0 + j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let i = 0; i < w; i++) {
            const lon = (x0 + i + 0.5) / W * 2 * Math.PI - Math.PI, x = cl * Math.cos(lon), y = cl * Math.sin(lon);
            U[j * w + i] = gridAt(V, x, y, sl) ?? unitAt(V, mesh, mesh.index.nearest(x, y, sl), x, y, sl);
        }
    }
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const put = (p, r, g, b, a) => { d[4 * p] += (r - d[4 * p]) * a; d[4 * p + 1] += (g - d[4 * p + 1]) * a; d[4 * p + 2] += (b - d[4 * p + 2]) * a; };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const p = j * w + i, u = U[p];
        if (u < 0) continue;
        let edge = false, edgeChosen = false;
        for (const q of [i + 1 < w ? p + 1 : -1, j + 1 < h ? p + w : -1, i > 0 ? p - 1 : -1, j > 0 ? p - w : -1]) {
            if (q < 0 || U[q] === u || U[q] < 0) continue;
            edge = true;
            if (chosen.has(u) !== chosen.has(U[q])) edgeChosen = true;
        }
        if (mark && edgeChosen) put(p, 255, 255, 255, 1);
        else if (edge) put(p, 20, 20, 20, 0.55);
        else if (mark && chosen.has(u)) put(p, 255, 80, 220, 0.18);
    }
    ctx.putImageData(img, 0, 0);
    const blob = await cv2.convertToBlob({ type: 'image/png' });
    await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
}
