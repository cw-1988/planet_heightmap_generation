// Roads that follow a river keep to one bank (fork addition; the owner, 2026-11-24: the roads "randomly cross a river,
// can you align them with the river when they follow it?"). A road is found on the States grid (~40 km a cell) and the
// river is drawn from the planet's own points, smoothed (river-valleys.js riverParts): a road running beside a river on
// the grid wanders from one side of the drawn line to the other. So, on the page, each road's line is read against the
// big rivers as they are drawn: where it runs along one (near it, and the same way, for a stretch), the stretch is moved
// onto the bank it mostly lies on, BANK.bankKm out from the river's line (beyond the widest swing of its meanders,
// river-meander.js), easing in and out at the stretch's ends, so it crosses the river where it truly leaves it and
// nowhere else. Its ends (the places, the forks) stay put, so the roads still meet.
import { riverParts } from '../finish/river-valleys.js';
import { MEANDER_PAD_KM } from '../finish/river-meander.js';
import { HAUL } from './city-haul.js';

/** q: the least flow (m³/s) of a river a road keeps a bank of (a navigable river's); reachKm: how near a road must run to
 *  follow it; along: how nearly its way (|cos| of the angle between the two); bankKm: how far out from the river's line
 *  the road runs; minRunKm: the shortest stretch that counts as following (shorter, it only passes or crosses); gapKm: a
 *  break shorter than this inside a stretch is bridged; easeKm: over how far the road eases onto the bank and off it;
 *  stepKm: the road's points near a river, at most this far apart (so it bends as the river does). */
export const BANK = { q: HAUL.navQ, reachKm: 22, along: 0.7, bankKm: 1.5 + MEANDER_PAD_KM, minRunKm: 25, gapKm: 12, easeKm: 12, stepKm: 2.5 };

const W = 2048, H = 1024, KM = 2 * Math.PI * 6371 / W, C = 2, GW = W / C, GH = H / C, D = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The big rivers' segments as drawn (on the 2048-wide texture), in a grid of C-px cells, each segment in every cell
 *  within BANK.reachKm of it. Cached per planet's rivers. */
const gridCache = new WeakMap();
function riverGrid(fin) {
    const R = fin?.rivers;
    if (!R?.lat) return null;
    let g = gridCache.get(R);
    if (g) return g;
    const seg = [], starts = [...R.start, R.lat.length];
    for (let r = 0; r < starts.length - 1; r++)
        for (const pts of riverParts(R, starts[r], starts[r + 1], BANK.q))
            for (let i = 0; i < pts.length - 1; i++) seg.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    const n = seg.length / 4, xy = Float32Array.from(seg), pad = BANK.reachKm / KM;
    const cells = (k, f) => {
        const o = 4 * k, cl = Math.max(0.1, Math.cos((0.5 - (xy[o + 1] + xy[o + 3]) / 2 / H) * Math.PI)), px = pad / cl;
        const x0 = Math.floor((Math.min(xy[o], xy[o + 2]) - px) / C), x1 = Math.floor((Math.max(xy[o], xy[o + 2]) + px) / C);
        const y0 = Math.max(0, Math.floor((Math.min(xy[o + 1], xy[o + 3]) - pad) / C)), y1 = Math.min(GH - 1, Math.floor((Math.max(xy[o + 1], xy[o + 3]) + pad) / C));
        if (x1 - x0 > GW / 2) return;   // (a segment across the map's edge: riverParts splits there)
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(y * GW + ((x % GW) + GW) % GW);
    };
    const count = new Int32Array(GW * GH + 1);
    for (let k = 0; k < n; k++) cells(k, c => { count[c + 1]++; });
    for (let c = 0; c < GW * GH; c++) count[c + 1] += count[c];
    const items = new Int32Array(count[GW * GH]), at = count.slice(0, GW * GH);
    for (let k = 0; k < n; k++) cells(k, c => { items[at[c]++] = k; });
    gridCache.set(R, g = { xy, count, items });
    return g;
}

/** The nearest big river's segment to a point (x, y on the texture, x unwrapped) within BANK.reachKm, into o:
 *  { d (km), px, py (the nearest point of it, in x's unwrapping), tx, ty (its way, a unit vector in km east and south) },
 *  or false. */
function nearest(g, x, y, o) {
    const gy = Math.floor(y / C);
    if (gy < 0 || gy >= GH) return false;
    const c = gy * GW + ((Math.floor(x / C) % GW) + GW) % GW, cl = Math.max(0.1, Math.cos((0.5 - y / H) * Math.PI));
    let best = BANK.reachKm;
    for (let j = g.count[c]; j < g.count[c + 1]; j++) {
        const s = 4 * g.items[j], sh = W * Math.round((x - g.xy[s]) / W);
        const ax = g.xy[s] + sh, ay = g.xy[s + 1], bx = g.xy[s + 2] + sh, by = g.xy[s + 3];
        const ex = (bx - ax) * cl * KM, ey = (by - ay) * KM, px = (x - ax) * cl * KM, py = (y - ay) * KM, ee = ex * ex + ey * ey || 1e-9;
        const t = Math.max(0, Math.min(1, (px * ex + py * ey) / ee)), dx = px - t * ex, dy = py - t * ey, d = Math.hypot(dx, dy);
        if (d < best) {
            best = d; const el = Math.sqrt(ee);
            o.d = d; o.px = ax + t * (bx - ax); o.py = ay + t * (by - ay); o.tx = ex / el; o.ty = ey / el;
        }
    }
    return best < BANK.reachKm;
}

/** A road's line [[lon, lat], …] (unwrapped) with its stretches along a big river moved onto one bank; the same line if it
 *  follows none. */
function bankRoad(l, g) {
    // (on the texture, its points near a river at most BANK.stepKm apart)
    const p = [];
    const near = (x, y) => { const gy = Math.floor(y / C); if (gy < 0 || gy >= GH) return false; const c = gy * GW + ((Math.floor(x / C) % GW) + GW) % GW; return g.count[c + 1] > g.count[c]; };
    for (let i = 0; i < l.length; i++) {
        const x = (l[i][0] + 180) / 360 * W, y = (90 - l[i][1]) / 180 * H;
        if (i) {
            const [ax, ay] = p[p.length - 1], cl = Math.max(0.1, Math.cos((0.5 - (ay + y) / 2 / H) * Math.PI));
            const km = Math.hypot((x - ax) * cl, y - ay) * KM, m = near(ax, ay) || near(x, y) ? Math.ceil(km / BANK.stepKm) : 1;
            for (let k = 1; k < m; k++) p.push([ax + (x - ax) * k / m, ay + (y - ay) * k / m]);
        }
        p.push([x, y]);
    }
    const n = p.length;
    if (n < 3) return l;
    const s = new Float64Array(n), hit = [], q = {};
    for (let i = 1; i < n; i++) {
        const cl = Math.max(0.1, Math.cos((0.5 - (p[i][1] + p[i - 1][1]) / 2 / H) * Math.PI));
        s[i] = s[i - 1] + Math.hypot((p[i][0] - p[i - 1][0]) * cl, p[i][1] - p[i - 1][1]) * KM;
    }
    let any = false;
    for (let i = 0; i < n; i++) {
        if (!nearest(g, p[i][0], p[i][1], q)) { hit.push(null); continue; }
        const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], cl = Math.max(0.1, Math.cos((0.5 - p[i][1] / H) * Math.PI));
        const rx = (b[0] - a[0]) * cl, ry = b[1] - a[1], rl = Math.hypot(rx, ry) || 1;
        // (which side: + to the river's left as it runs, its normal (ty, −tx) in km east and south)
        const side = ((p[i][0] - q.px) * cl * KM * q.ty - (p[i][1] - q.py) * KM * q.tx) >= 0 ? 1 : -1;
        const along = Math.abs((rx * q.tx + ry * q.ty) / rl) >= BANK.along;
        hit.push({ ...q, side, along, cl });
        if (along) any = true;
    }
    if (!any) return l;
    // (the stretches: points along a river, short breaks bridged, short stretches dropped)
    const runs = [];
    for (let i = 0; i < n; i++) {
        if (!hit[i]?.along) continue;
        const last = runs[runs.length - 1];
        if (last && s[i] - s[last[1]] <= BANK.gapKm) last[1] = i; else runs.push([i, i]);
    }
    const out = p.map(v => v.slice()), wt = new Float64Array(n);
    for (const [a, b] of runs) {
        if (s[b] - s[a] < BANK.minRunKm) continue;
        let sum = 0;
        for (let i = a; i <= b; i++) if (hit[i]) sum += hit[i].side / (1 + hit[i].d);
        const side = sum >= 0 ? 1 : -1;
        for (let i = Math.max(0, a - 1); i <= Math.min(n - 1, b + 1); i++) {
            const h = hit[i];
            if (!h) continue;
            const w = smooth(0, BANK.easeKm, Math.min(s[i] - s[a] + BANK.easeKm / 2, s[b] - s[i] + BANK.easeKm / 2)) * smooth(0, BANK.easeKm, Math.min(s[i], s[n - 1] - s[i]));
            if (w <= 0) continue;
            const tx = h.px + side * BANK.bankKm * h.ty / (h.cl * KM), ty = h.py - side * BANK.bankKm * h.tx / KM;
            out[i][0] = p[i][0] + w * (tx - p[i][0]); out[i][1] = p[i][1] + w * (ty - p[i][1]); wt[i] = w;
        }
    }
    // (the moved stretches smoothed a little: the nearest segment jumps at a river's corners)
    for (let k = 0; k < 2; k++) {
        const o = out.map(v => v.slice());
        for (let i = 1; i < n - 1; i++) if (wt[i] > 0) for (let j = 0; j < 2; j++) o[i][j] = (out[i - 1][j] + 2 * out[i][j] + out[i + 1][j]) / 4;
        for (let i = 1; i < n - 1; i++) out[i] = o[i];
    }
    return out.map(([x, y]) => [x / W * 360 - 180, 90 - y / H * 180]);
}

/** The roads (states-view.js roadNet's chains) with their stretches along the big rivers on one bank, or the same roads
 *  when the planet has no rivers. */
export function bankRoads(roads, fin) {
    const g = riverGrid(fin);
    if (!g || !g.items.length) return roads;
    return roads.map(r => ({ ...r, pts: bankRoad(r.pts, g) }));
}
