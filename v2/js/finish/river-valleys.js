// The rivers cut into the world map's ground (fork addition; docs/world-map-detail.md): each river's line — the same
// smoothed line the page draws (riverParts, shared with finish-view.js) — lowered into a valley as wide and as deep as
// its flow, its floor flattened of the finer detail, so up close the river runs in a valley of its own instead of over
// the hills drawn across it. Read on the planet's lines (no tile's own), so neighbouring tiles agree, and faded in with
// the pixels as every other detail (fine-detail.js `fade`). The line is bent by its meanders (river-meander.js) before
// it is cut, as the page draws it, so the valley winds with the river; its sides are gentle (VALLEY.side), no trench.

import { meanderAt, meanderSwing, MEANDER_PAD_KM } from './river-meander.js';

const TEX_W = 2048, TEX_H = 1024;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The valleys' tunables (km unless named; q the flow, m³/s). */
export const VALLEY = {
    floorK: 0.04,      // the floor's half-width: floorK · √q (8 m³/s ~110 m, 1,000 ~1.3 km) …
    floorMax: 4,       // … at most this
    depthK: 0.008,     // the depth: depthK · q^0.4 (8 m³/s ~18 m, 1,000 ~130 m) …
    depthMax: 0.3,     // … at most this; times 0.4 … 1 by the ground's slope (plains shallow, mountains deep)
    side: 0.04,        // the sides' mean slope (tan, ~2.3°): how far out from the floor a valley reaches (0.2, ~11°,
                       // drew a trench with a hard rim along every river up close)
};

/**
 * One river reach's parts as drawn: its points from i0 to i1 carrying at least q0 (a reach below it ends the part; a
 * part is split where it crosses the map's edge), each [x, y, q, extra(i)] on a texture 2048 px wide, smoothed
 * (Chaikin, twice — q blended, the extra kept from the nearer point).
 */
export function riverParts(R, i0, i1, q0, extra = () => 0) {
    const parts = [[]], DEG = Math.PI / 180;
    let s = 0;
    for (let i = i0; i < i1; i++) {
        // (how far along the river, km from its first point, whichever parts it falls into: the meanders' phase)
        if (i > i0) { let dl = R.lon[i] - R.lon[i - 1]; dl -= 360 * Math.round(dl / 360); s += 6371 * DEG * Math.hypot(R.lat[i] - R.lat[i - 1], dl * Math.cos(R.lat[i] * DEG)); }
        if (!(R.q[i] >= q0)) { if (parts[parts.length - 1].length) parts.push([]); continue; }
        const p = [(R.lon[i] + 180) / 360 * TEX_W, (90 - R.lat[i]) / 180 * TEX_H, R.q[i], extra(i), s], cur = parts[parts.length - 1];
        if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > TEX_W / 2) parts.push([]);
        parts[parts.length - 1].push(p);
    }
    const out = [];
    for (let pts of parts) {
        if (pts.length < 2) continue;
        for (let it = 0; it < 2; it++) {
            const nx = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                nx.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], 0.75 * a[2] + 0.25 * b[2], a[3], 0.75 * a[4] + 0.25 * b[4]],
                    [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], 0.25 * a[2] + 0.75 * b[2], b[3], 0.25 * a[4] + 0.75 * b[4]]);
            }
            nx.push(pts[pts.length - 1]); pts = nx;
        }
        // (each point's normal, km east and south, unit: the meanders' sideways — the line's direction through it)
        for (let k = 0; k < pts.length; k++) {
            const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], cl = Math.max(0.05, Math.cos((0.5 - pts[k][1] / TEX_H) * Math.PI));
            const tx = (b[0] - a[0]) * cl, ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
            pts[k][5] = -ty / l; pts[k][6] = tx / l;
        }
        pts.seed = i0;
        out.push(pts);
    }
    return out;
}

/** A segment's entries in the lines' array: x0 y0 x1 y1 (2048-wide texture), q0 q1, s0 s1 (km along), n0x n0y n1x n1y, seed. */
export const LINE = 13;
/** One part's segments onto `out`, LINE entries each (riverParts' points). */
export function pushSegments(out, pts) {
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push(a[0], a[1], b[0], b[1], a[2], b[2], a[4], b[4], a[5], a[6], b[5], b[6], pts.seed);
    }
}

/** Every river's segments, LINE entries each (cached on the rivers). */
export function riverLines(R) {
    if (R._valleyLines) return R._valleyLines;
    const starts = [...R.start, R.lat.length], s = [];
    for (let r = 0; r < starts.length - 1; r++) for (const pts of riverParts(R, starts[r], starts[r + 1], 0)) pushSegments(s, pts);
    return (R._valleyLines = Float64Array.from(s));
}

/** The most a valley reaches from its line (km). */
const reachOf = q => { const f = Math.min(VALLEY.floorMax, VALLEY.floorK * Math.sqrt(q)), d = Math.min(VALLEY.depthMax, VALLEY.depthK * q ** 0.4); return { f, d, out: f + d / VALLEY.side }; };

/**
 * The segments near a window (W px wide; columns x0 − m … x0 + w + m, rows likewise, m its margin in px), shifted across
 * the date line to where the window sees them — small enough to send to a worker with the window.
 */
export function cropLines(lines, { W, x0, y0, w, h }, mPx) {
    // (out to the widest valley, and the farthest a meander moves its line — 0.3 for a latitude's narrower pixels east–west)
    const k = W / TEX_W, pad = (mPx + (1.6 * reachOf(2e5).out + MEANDER_PAD_KM / 0.3) / (40030 / W)) / k, out = [];
    const ya = (y0 / k) - pad, yb = (y0 + h) / k + pad;
    for (const turn of [-1, 0, 1]) {
        const xa = x0 / k - turn * TEX_W - pad, xb = (x0 + w) / k - turn * TEX_W + pad;
        for (let s = 0; s < lines.length; s += LINE) {
            const ax = lines[s], ay = lines[s + 1], bx = lines[s + 2], by = lines[s + 3];
            if (Math.max(ax, bx) < xa || Math.min(ax, bx) > xb || Math.max(ay, by) < ya || Math.min(ay, by) > yb) continue;
            out.push(ax + turn * TEX_W, ay, bx + turn * TEX_W, by);
            for (let e = 4; e < LINE; e++) out.push(lines[s + e]);
        }
    }
    return Float64Array.from(out);
}

/**
 * Cuts the valleys into D (km, the detail over the enlarged picture hb) over the extended window ew × eh starting at
 * pixel (X0, Y0) of a W-wide picture: `pxKm` its pixel north–south, `cosLa` each row's, `gE`, `gN` the picture's slope,
 * `seaB` its sea (none cut), `fade(λ km)` how much of a feature the pixels hold. Each valley's floor is the deepest of the
 * valleys over it (rivers meeting), its finer detail laid flat; the land is kept above the sea.
 */
export function carveValleys(D, lines, { hb, gE, gN, seaB, W, X0, Y0, ew, eh, pxKm, cosLa, fade }) {
    if (!lines || !lines.length) return;
    const N = ew * eh, cut = new Float32Array(N), flat = new Float32Array(N), k = W / TEX_W, swing = meanderSwing(fade), mo = [0, 0];
    for (let s = 0; s < lines.length; s += LINE) {
        // (faded in by the flow where each pixel's nearest point is, below: by the segment's larger end, two segments meeting
        // faded unlike, and the deepest cut stepped across the valley at every point of the line — a fringe of spurs)
        const qa = lines[s + 4], qb = lines[s + 5], big = reachOf(Math.max(qa, qb));
        if (!(fade(2 * big.out) > 0)) continue;
        const ax = lines[s] * k - X0, ay = lines[s + 1] * k - Y0, bx = lines[s + 2] * k - X0, by = lines[s + 3] * k - Y0;
        const sa = lines[s + 6], sb = lines[s + 7], n0x = lines[s + 8], n0y = lines[s + 9], n1x = lines[s + 10], n1y = lines[s + 11], seed = lines[s + 12];
        // (the segment's box, out to its valley's reach and its meanders' swing: east–west in pixels of this latitude)
        const jMid = Math.min(eh - 1, Math.max(0, Math.round((ay + by) / 2))), cl = Math.max(0.05, cosLa[jMid]), reach = 1.6 * big.out + swing;
        const rx = reach / (pxKm * cl) + 1, ry = reach / pxKm + 1;
        const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - rx)), i1 = Math.min(ew - 1, Math.ceil(Math.max(ax, bx) + rx));
        const j0 = Math.max(0, Math.floor(Math.min(ay, by) - ry)), j1 = Math.min(eh - 1, Math.ceil(Math.max(ay, by) + ry));
        if (i0 > i1 || j0 > j1) continue;
        const ex = (bx - ax) * cl, ey = by - ay, L2 = ex * ex + ey * ey, lenKm = Math.sqrt(L2) * pxKm;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const p = j * ew + i;
            if (seaB[p]) continue;
            // (where along the unbent segment the pixel lies, how far past its ends, and how far to its side along the
            // line's normal — blended along it as the drawn line's: km, east–west shrunk by the latitude)
            const px = (i + 0.5 - ax) * cl, py = j + 0.5 - ay, tr = L2 > 0 ? (px * ex + py * ey) / L2 : 0, t = Math.min(1, Math.max(0, tr));
            const over = (tr < 0 ? -tr : tr > 1 ? tr - 1 : 0) * lenKm;
            const nx = n0x + t * (n1x - n0x), ny = n0y + t * (n1y - n0y), side = ((px - t * ex) * nx + (py - t * ey) * ny) / (Math.hypot(nx, ny) || 1) * pxKm;
            const q = qa + t * (qb - qa), v = reachOf(q), fd = fade(2 * v.out);
            if (!(fd > 0) || !(over < v.out) || !(Math.abs(side) - swing < v.out)) continue;
            // (the distance from the bent line — the river as drawn, river-meander.js: its offset to the side there, eased by
            // how steeply it swings — a pixel read once per segment, not once per step of the bent line: a bend's every step
            // swept a box as wide as the valley, ~1,000× the pixels up close)
            meanderAt(sa + t * (sb - sa), q, seed, fade, mo);
            // (the valley a clean profile about the drawn line, its width the flow's: no noise on its banks or its floor. Their
            // noises ran at a frequency set by the flow, times a place ~6,371 km from the centre — the flow's least change
            // along a river turned them thousands of waves: zigzag banks, and swirls on every slope a creek crossed; and the
            // floor's wander to either side flipped at each segment's end — removed 2026-11-18)
            const dist = Math.hypot(over, Math.abs(side - mo[0]) / Math.hypot(1, mo[1]));
            if (!(dist < v.out)) continue;
            const deep = v.d * (0.4 + 0.6 * smooth(0.005, 0.08, Math.hypot(gE[p], gN[p])));
            // (the floor's finer detail eased flat, not wholly: a floodplain's own swells stay)
            const c = fd * deep * (1 - smooth(v.f, v.out, dist)), fl = 0.8 * fd * (1 - smooth(0.6 * v.f, v.f + 0.5 * (v.out - v.f), dist));
            if (c > cut[p]) cut[p] = c;
            if (fl > flat[p]) flat[p] = fl;
        }
    }
    for (let p = 0; p < N; p++) {
        if (!(cut[p] > 0 || flat[p] > 0)) continue;
        const before = D[p];
        let v = before * (1 - flat[p]) - cut[p];
        // (no new sea inland and no channel of sea up the river: the floor stays a few metres up)
        if (hb[p] + v < 0.003) v = Math.min(before, Math.max(v, 0.003 - hb[p]));
        D[p] = v;
    }
}
