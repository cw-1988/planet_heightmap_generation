// A region's frame (fork addition): a square of the planet `km` across about a centre, as an N × N grid on an
// azimuthal equidistant projection (true distances from the centre, little distortion over a country's width). Rows run
// north → south, columns west → east; x east and y north in km from the centre.
//
// The planet's pictures it is made from (the finished moment's heights, sea, lakes and climate) are cut to the box with a
// margin on the page (cropPlanet) and sent to the region's worker, which reads them smoothly (sampler).

export const R = 6371;
const D = Math.PI / 180;

/**
 * The frame: the projection's centre (lat, lon in degrees), its width `km`, `n` cells a side; (ox, oy) km where the
 * box's own centre lies in the projection (0 for a region; a zoom tile is a smaller box in its region's projection).
 */
export function regionFrame(lat, lon, km, n, ox = 0, oy = 0) {
    return { lat, lon, km, n, cellKm: km / n, ox, oy, sp: Math.sin(lat * D), cp: Math.cos(lat * D) };
}

/** The place (degrees) at x east, y north (km) of the frame's centre, into out [lat, lon]. */
export function placeAt(F, x, y, out = [0, 0]) {
    const rho = Math.hypot(x, y);
    if (rho < 1e-9) { out[0] = F.lat; out[1] = F.lon; return out; }
    const c = rho / R, sc = Math.sin(c), cc = Math.cos(c);
    out[0] = Math.asin(Math.max(-1, Math.min(1, cc * F.sp + y * sc * F.cp / rho))) / D;
    let lon = F.lon + Math.atan2(x * sc, rho * F.cp * cc - y * F.sp * sc) / D;
    out[1] = ((lon + 540) % 360) - 180;
    return out;
}

/** x east, y north (km) of a place (degrees), into out [x, y]. */
export function xyOf(F, lat, lon, out = [0, 0]) {
    const p = lat * D, dl = (lon - F.lon) * D, sp = Math.sin(p), cp = Math.cos(p), cdl = Math.cos(dl);
    const cosc = Math.max(-1, Math.min(1, F.sp * sp + F.cp * cp * cdl)), c = Math.acos(cosc), k = c < 1e-9 ? 1 : c / Math.sin(c);
    out[0] = R * k * cp * Math.sin(dl);
    out[1] = R * k * (F.cp * sp - F.sp * cp * cdl);
    return out;
}

/** A cell's centre (column i, row j; fractional for a point within one) as x, y km in the projection. */
export const cellXY = (F, i, j, out = [0, 0]) => { out[0] = (F.ox ?? 0) + (i + 0.5) * F.cellKm - F.km / 2; out[1] = (F.oy ?? 0) + F.km / 2 - (j + 0.5) * F.cellKm; return out; };
/** The cell (fractional column, row; a cell's centre at +0.5) at x, y km in the projection: cellXY's inverse. */
export const xyCell = (F, x, y, out = [0, 0]) => { out[0] = (x - (F.ox ?? 0) + F.km / 2) / F.cellKm; out[1] = ((F.oy ?? 0) + F.km / 2 - y) / F.cellKm; return out; };

/** The picture's columns and rows the frame covers (with `pad` pixels round it), for a picture `W` × `H`. */
function bounds(F, W, H, pad) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const q = [0, 0], S = 24;
    for (let a = 0; a <= S; a++) for (let b = 0; b <= S; b++) {
        placeAt(F, (F.ox ?? 0) + (a / S - 0.5) * F.km, (F.oy ?? 0) + (b / S - 0.5) * F.km, q);
        let dl = q[1] - F.lon; dl = ((dl + 540) % 360) - 180;                       // (unwrapped about the centre)
        const px = (F.lon + dl + 180) / 360 * W, py = (90 - q[0]) / 180 * H;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const ya = Math.max(0, Math.floor(y0) - pad), yb = Math.min(H, Math.ceil(y1) + pad);
    // (a box over a pole: every column)
    const polar = Math.abs(F.lat) + (F.km / 2 + Math.hypot(F.ox ?? 0, F.oy ?? 0)) / R / D > 89;
    let xa = Math.floor(x0) - pad, xb = Math.ceil(x1) + pad;
    if (polar || xb - xa >= W) { xa = 0; xb = W; }
    return { x0: xa, y0: ya, w: xb - xa, h: yb - ya };
}

/** Rows `b` of the arrays (each `per` values a pixel) of a picture W wide, the columns wrapping round the world. */
function cut(arrays, W, b, per = 1) {
    const out = {};
    for (const [k, A] of Object.entries(arrays)) {
        if (!A) continue;
        const p = per[k] ?? 1, o = new A.constructor(b.w * b.h * p);
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
            const s = ((b.y0 + y) * W + (((b.x0 + x) % W) + W) % W) * p, d = (y * b.w + x) * p;
            for (let c = 0; c < p; c++) o[d + c] = A[s + c];
        }
        out[k] = o;
    }
    return out;
}

/**
 * The planet's pictures over the frame (on the page, from a finished moment `fin`): heights, sea and lakes; the
 * climate's year (°C × 100, mm, its colours from space); the rivers whose points fall near the box. Typed arrays, to be
 * sent to the worker.
 */
export function cropPlanet(fin, F) {
    const P = fin.raster, C = fin.climate?.raster ?? P.climate;
    const hb = bounds(F, P.w, P.h, 4);
    const height = { ...hb, W: P.w, H: P.h, ...cut({ heightM: P.heightM, ocean: P.ocean, water: P.water }, P.w, hb) };
    let climate = null;
    if (C) {
        const cb = bounds(F, C.w, C.h, 3);
        climate = { ...cb, W: C.w, H: C.h, ...cut({ tAnnual: C.tAnnual, pAnnual: C.pAnnual, sat: C.sat?.year }, C.w, cb, { sat: 3 }) };
    }
    // the rivers: each reach with a point within the box and half again round it, kept whole
    const V = fin.rivers, rivers = { start: [], x: [], y: [], q: [] };
    if (V) {
        const lim = F.km * 0.75, q = [0, 0], starts = [...V.start, V.lat.length];
        for (let s = 0; s < starts.length - 1; s++) {
            let near = false;
            const pts = [];
            for (let i = starts[s]; i < starts[s + 1]; i++) {
                xyOf(F, V.lat[i], V.lon[i], q);
                pts.push(q[0], q[1], V.q[i]);
                if (Math.abs(q[0] - (F.ox ?? 0)) < lim && Math.abs(q[1] - (F.oy ?? 0)) < lim) near = true;
            }
            if (!near) continue;
            rivers.start.push(rivers.x.length);
            for (let k = 0; k < pts.length; k += 3) { rivers.x.push(pts[k]); rivers.y.push(pts[k + 1]); rivers.q.push(pts[k + 2]); }
        }
    }
    return { height, climate, rivers: { start: Int32Array.from(rivers.start), x: Float32Array.from(rivers.x), y: Float32Array.from(rivers.y), q: Float32Array.from(rivers.q) } };
}

/** The arrays a crop holds, for a transfer list. */
export const cropBuffers = (crop) => [crop.height.heightM, crop.height.ocean, crop.height.water, crop.climate?.tAnnual, crop.climate?.pAnnual, crop.climate?.sat,
    crop.rivers.start, crop.rivers.x, crop.rivers.y, crop.rivers.q].filter(Boolean).map((a) => a.buffer);

/**
 * A crop's reader at a place (degrees): the fractional pixel (fx, fy) within it, into out. Columns unwrap about the
 * crop's left edge.
 */
export function pixelOf(c, lat, lon, out) {
    let px = (lon + 180) / 360 * c.W - 0.5 - c.x0;
    px = ((px % c.W) + c.W) % c.W;
    if (px > c.w + (c.W - c.w) / 2) px -= c.W;
    out[0] = px; out[1] = (90 - lat) / 180 * c.H - 0.5 - c.y0;
    return out;
}

const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
/** Catmull–Rom across a crop's array `A` (w × h) at the fractional pixel (fx, fy). */
export function bicubic(A, w, h, fx, fy) {
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y, row = [0, 0, 0, 0];
    for (let k = -1; k <= 2; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k)) * w;
        const a = A[yy + Math.min(w - 1, Math.max(0, x - 1))], b = A[yy + Math.min(w - 1, Math.max(0, x))], c = A[yy + Math.min(w - 1, Math.max(0, x + 1))], d = A[yy + Math.min(w - 1, Math.max(0, x + 2))];
        row[k + 1] = cr(a, b, c, d, tx);
    }
    return cr(row[0], row[1], row[2], row[3], ty);
}

/** Bilinear across `A` (w × h, `per` values a pixel, value `k` of them), skipping pixels where ok(index) is false;
 *  NaN if none of the four is. */
export function bilinearIf(A, w, h, fx, fy, ok, per = 1, k = 0) {
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
    let s = 0, ws = 0;
    for (let b = 0; b <= 1; b++) for (let a = 0; a <= 1; a++) {
        const xx = Math.min(w - 1, Math.max(0, x + a)), yy = Math.min(h - 1, Math.max(0, y + b)), i = yy * w + xx;
        if (!ok(i)) continue;
        const wt = (a ? tx : 1 - tx) * (b ? ty : 1 - ty) + 1e-6;
        s += wt * A[i * per + k]; ws += wt;
    }
    return ws ? s / ws : NaN;
}
