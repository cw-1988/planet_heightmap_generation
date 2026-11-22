// The rivers cut into the world map's ground (fork addition; docs/world-map-detail.md): each river's line — the same
// smoothed line the page draws (riverParts, shared with river-draw.js; only the rivers it draws) — lowered into a valley
// as deep as its flow, its floor the channel as wide as the page draws it (CHANNEL), flattened of the finer detail, so up close the river runs in a valley of its own instead of over
// the hills drawn across it. Read on the planet's lines (no tile's own), so neighbouring tiles agree, and faded in with
// the pixels as every other detail (fine-detail.js `fade`). The line is bent by its meanders (river-meander.js) before
// it is cut, as the page draws it, so the valley winds with the river; its sides are gentle (VALLEY.side), no trench.

// By the laws (river-hydraulics.js, 2026-11-20): the channel as wide and deep as hydraulic geometry gives for its flow,
// the valley as deep as the river's own ground lies below the picture over it (the gorges' and the land's own relief, which
// the picture's pixels blur away), its walls at the hillslopes' threshold angle. (Before: 8 m · q^0.4 deep at most 300 m,
// 0.4 … 1 by the slope, sides 0.04, all set by eye.)

import { meanderAt, meanderSwing, MEANDER_PAD_KM, endTurns, curveAt, curveMaxKm } from './river-meander.js';
import { CHANNEL, channelKm, channelDepthKm, VALLEY_LAW } from './river-hydraulics.js';

export { CHANNEL, channelKm };
const TEX_W = 2048, TEX_H = 1024;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The river's bed as drawn (km): BED channels wide — the channel and the foot of its banks, eased flat of the finer
 *  detail and filled with the river's colour (river-draw.js), so no smooth bare band shows beside a thinner line. A
 *  drawing choice, not a law: the channel itself is channelKm. */
export const BED = 2;
export const bedKm = q => BED * channelKm(q);

/** The valleys (km): the floor's half-width the channel's; the walls' mean slope (tan) half the threshold reached at the
 *  bank; depthMax only bounds the windows' margins (the deepest gorges). */
export const VALLEY = { side: VALLEY_LAW.steepest / 2, depthMax: 3 };

/**
 * One river reach's parts as drawn: its points from i0 to i1 carrying at least q0 (a reach below it ends the part; a
 * part is split where it crosses the map's edge), each [x, y, q, extra(i), s, nx, ny, h, slope, z] on a texture 2048 px
 * wide, smoothed (Chaikin, twice — the numbers blended, the extra kept from the nearer point). Each part's `head`: 'reach' (the reach's first
 * point: a source, or a confluence), 'gap' (where the flow rises to q0) or 'edge'; its `tail` true where the flow
 * falls below q0 (the river goes on, undrawn).
 */
export function riverParts(R, i0, i1, q0, extra = () => 0) {
    const parts = [[]], DEG = Math.PI / 180, n = i1 - i0, sk = new Float64Array(n), zk = new Float64Array(n);
    // (how far along the river, km from its first point, whichever parts it falls into: the meanders' phase; and its ground,
    // km, never rising downstream — water runs through a bump the cells left — 0 where the rivers carry none)
    for (let k = 0, s = 0, zl = Infinity; k < n; k++) {
        const i = i0 + k;
        if (k) { let dl = R.lon[i] - R.lon[i - 1]; dl -= 360 * Math.round(dl / 360); s += 6371 * DEG * Math.hypot(R.lat[i] - R.lat[i - 1], dl * Math.cos(R.lat[i] * DEG)); }
        sk[k] = s; zk[k] = zl = R.z ? Math.min(zl, R.z[i]) : 0;
    }
    const s = n ? sk[n - 1] : 0;
    // (its slope, m/m: across the point's neighbours — whether it meanders, river-hydraulics.js)
    const slopeAt = k => { const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1); return sk[b] > sk[a] ? (zk[a] - zk[b]) / (sk[b] - sk[a]) : 0; };
    for (let i = i0; i < i1; i++) {
        const k = i - i0;
        if (!(R.q[i] >= q0)) { const cur = parts[parts.length - 1]; if (cur.length) { cur.tail = true; parts.push([]); } continue; }
        const p = [(R.lon[i] + 180) / 360 * TEX_W, (90 - R.lat[i]) / 180 * TEX_H, R.q[i], extra(i), sk[k], 0, 0, 0, slopeAt(k), zk[k]], cur = parts[parts.length - 1];
        if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > TEX_W / 2) { const nw = []; nw.head = 'edge'; parts.push(nw); }
        const into = parts[parts.length - 1];
        if (!into.length) into.head ??= i === i0 ? 'reach' : 'gap';
        into.push(p); into.end = i;
    }
    // (a confluence is smoothed as any other point of the river that runs on through it — the biggest reach into it and
    // the one out — with the neighbour's next point as a ghost, each reach then cut at the one point both share, joinAt;
    // a smaller tributary ends there too, at its own angle. Pinned, each reach kept its raw corner: 90°, drawn)
    const J = joinsOf(R), k = J.byStart.get(i0), u = k === undefined ? -1 : J.up[k], d = k === undefined ? -1 : J.down[k];
    const drawn = r => r >= 0 && R.q[J.starts[r + 1] - 1] >= q0, mu = d >= 0 ? J.up[d] : -1;
    const intoOut = d >= 0 && drawn(mu) && R.q[i1 - 1] >= q0 && R.q[J.starts[d]] >= q0 && J.starts[d + 1] - J.starts[d] >= 2;
    const out = [], first = parts.find(p => p.length >= 2), last = parts.findLast(p => p.length >= 2);
    for (let pts of parts) {
        if (pts.length < 2) continue;
        const head = pts.head, tail = !!pts.tail;
        const inJoin = pts === first && head === 'reach' && drawn(u) ? joinAt(R, J.starts[u + 1] - 2, i0, i0 + 1) : null;
        // (only a part that holds the reach's last point: one crossing the map's edge at that point leaves it a part of one
        // point, dropped, and the part before lies across the map — its join drawn there was a line 2,047 px long, which
        // drawRiversWindow's margin (half the longest segment) took for every tile: every river drawn into each one)
        const outJoin = pts === last && pts.end === i1 - 1 && !tail && intoOut ? joinAt(R, J.starts[mu + 1] - 2, i1 - 1, J.starts[d] + 1) : null;
        const runOn = outJoin && mu === k, ghost = (p, i) => { const g = p.slice(), x = (R.lon[i] + 180) / 360 * TEX_W; g[0] = x - TEX_W * Math.round((x - p[0]) / TEX_W); g[1] = (90 - R.lat[i]) / 180 * TEX_H; return g; };
        const M0 = inJoin && [inJoin[0], inJoin[1], ...pts[0].slice(2)];
        const M1 = outJoin && [outJoin[0], outJoin[1], ...pts[pts.length - 1].slice(2)];
        if (inJoin) pts.unshift(ghost(pts[0], J.starts[u + 1] - 2));
        if (runOn) pts.push(ghost(pts[pts.length - 1], J.starts[d] + 1));
        else if (outJoin) pts[pts.length - 1] = M1;                    // (a tributary: ends where the river runs on)
        for (let it = 0; it < 2; it++) {
            const nx = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1], mix = v => a.map((x, e) => e === 3 ? (v > 0.5 ? x : b[3]) : x * v + b[e] * (1 - v));
                nx.push(mix(0.75), mix(0.25));
            }
            nx.push(pts[pts.length - 1]); pts = nx;
        }
        // (the ghosts' side cut off at the shared point: it lies halfway along the 6th segment from that end, twice smoothed)
        if (inJoin || runOn) pts = [...(inJoin ? [M0] : []), ...pts.slice(inJoin ? 6 : 0, runOn ? pts.length - 6 : pts.length), ...(runOn ? [M1] : [])];
        // (each point's normal, km east and south, unit: the meanders' sideways — the line's direction through it)
        for (let k = 0; k < pts.length; k++) {
            const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], cl = Math.max(0.05, Math.cos((0.5 - pts[k][1] / TEX_H) * Math.PI));
            const tx = (b[0] - a[0]) * cl, ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
            pts[k][5] = -ty / l; pts[k][6] = tx / l;
        }
        pts.seed = i0; pts.head = head; pts.tail = tail; pts.sEnd = s;    // (s: the whole reach's length, its meanders pinned at both ends)
        out.push(pts);
    }
    return out;
}

/** Each reach's next one downstream (the reach starting at its last point; −1 at a mouth) and the biggest one running
 *  into it (the one carrying most among those ending at its first point; −1 at a source), cached on the rivers. */
function joinsOf(R) {
    if (R._joins) return R._joins;
    const starts = [...R.start, R.lat.length], n = starts.length - 1, key = i => R.lat[i] + ',' + R.lon[i], at = new Map(), byStart = new Map();
    for (let k = 0; k < n; k++) { at.set(key(starts[k]), k); byStart.set(starts[k], k); }
    const down = new Int32Array(n).fill(-1), up = new Int32Array(n).fill(-1);
    for (let k = 0; k < n; k++) {
        const e = starts[k + 1] - 1, d = at.get(key(e));
        if (d === undefined || d === k || starts[k + 1] - starts[k] < 2) continue;
        down[k] = d;
        if (up[d] < 0 || R.q[e] > R.q[starts[up[d] + 1] - 1]) up[d] = k;
    }
    return (R._joins = { starts, byStart, down, up });
}

/** The point a river running on through confluence `iV` (raw) passes, from raw point `iP` before it to `iN` after (on
 *  the 2048-wide texture): where Chaikin's two passes cut the corner, halfway along — the same for every reach there. */
function joinAt(R, iP, iV, iN) {
    const X = i => (R.lon[i] + 180) / 360 * TEX_W, Y = i => (90 - R.lat[i]) / 180 * TEX_H, xv = X(iV);
    const near = x => x - TEX_W * Math.round((x - xv) / TEX_W);
    return [0.75 * xv + 0.125 * (near(X(iP)) + near(X(iN))), 0.75 * Y(iV) + 0.125 * (Y(iP) + Y(iN))];
}

/** A segment's entries in the lines' array: x0 y0 x1 y1 (2048-wide texture), q0 q1, s0 s1 (km along), n0x n0y n1x n1y,
 *  seed, h0 h1 (the picture's height under each end, km: riverLines'; 0 for the page's), sHead sTail (km along where the
 *  drawn line truly begins and ends — its valley tapered in from there — or ∓1e9 where it goes on: riverLines'), sEnd (the
 *  reach's length, km: its meanders ease to nothing at its confluences and mouth, river-meander.js), S0 S1 (its slope,
 *  m/m: whether it meanders), z0 z1 (its own ground, km: the valley's floor). */
export const LINE = 22;
/** One part's segments onto `out`, LINE entries each (riverParts' points). */
export function pushSegments(out, pts) {
    const sHead = pts.sHead ?? -1e9, sTail = pts.sTail ?? 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push(a[0], a[1], b[0], b[1], a[2], b[2], a[4], b[4], a[5], a[6], b[5], b[6], pts.seed, a[7] ?? 0, b[7] ?? 0, sHead, sTail, pts.sEnd, a[8], b[8], a[9], b[9]);
    }
}

/** The picture `r` (heightM, m) at a point of the 2048-wide texture, km: its cubic B-spline, as fine-detail.js enlarges it
 *  inland (FINE.baseSmooth) — the height the window's ground has under the river's line. */
function pictureKm(r, x, y) {
    const u = x * r.w / TEX_W - 0.5, v = y * r.h / TEX_H - 0.5, xi = Math.floor(u), yi = Math.floor(v), fx = u - xi, fy = v - yi;
    const bs = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t, w = 1 - t; return (w * w * w * p0 + (3 * t3 - 6 * t2 + 4) * p1 + (-3 * t3 + 3 * t2 + 3 * t + 1) * p2 + t3 * p3) / 6; };
    const at = (i, j) => r.heightM[Math.min(r.h - 1, Math.max(0, j)) * r.w + ((i % r.w) + r.w) % r.w];
    const row = j => bs(at(xi - 1, j), at(xi, j), at(xi + 1, j), at(xi + 2, j), fx);
    return bs(row(yi - 1), row(yi), row(yi + 1), row(yi + 2), fy) / 1000;
}

/** Every river's segments carrying at least q0 m³/s — the rivers the page draws at that density, cut into the same parts
 *  (riverParts), so each valley lies under a drawn line and no valley lies under none — with the picture `r`'s height under
 *  each point, and where each drawn line truly begins and ends, LINE entries each (cached on the rivers per q0). */
export function riverLines(R, q0, r) {
    const cache = R._valleyLines ??= new Map();
    if (cache.has(q0)) return cache.get(q0);
    const starts = [...R.start, R.lat.length], s = [], parts = [];
    if (q0 < Infinity) for (let k = 0; k < starts.length - 1; k++) parts.push(...riverParts(R, starts[k], starts[k + 1], q0));
    // (a line's head is where no drawn line runs into it: a reach's first point is a confluence a drawn river ends at, or
    // a source, or a confluence of rivers too small to draw — the valley there ran on past the line's start, a rounded
    // cap as wide as the valley with no river in it)
    const ends = new Set(parts.map(pts => pts[pts.length - 1][0] + ',' + pts[pts.length - 1][1]));
    for (const pts of parts) {
        if (pts.head === 'gap' || (pts.head === 'reach' && !ends.has(pts[0][0] + ',' + pts[0][1]))) pts.sHead = pts[0][4];
        if (pts.tail) pts.sTail = pts[pts.length - 1][4];
        for (const p of pts) p[7] = pictureKm(r, p[0], p[1]);
        pushSegments(s, pts);
    }
    const out = Float64Array.from(s);
    cache.set(q0, out);
    return out;
}

/** How the ground is levelled to the line's height, in valley reaches: a bell LEVEL.bell wide, ending at LEVEL.out. */
const LEVEL = { bell: 1.2, out: 2.5 }, LEVEL_OUT = LEVEL.out;
/** The lowest a carved floor goes (km above the sea). */
const SEA_FLOOR = 0.003;
/** A valley of flow q, d km deep: its floor's half-width, and how far it reaches from its line (km). */
const reachOf = (q, d) => { const f = channelKm(q) / 2; return { f, d, out: f + d / VALLEY.side }; };

/**
 * The segments near a window (W px wide; columns x0 − m … x0 + w + m, rows likewise, m its margin in px), shifted across
 * the date line to where the window sees them — small enough to send to a worker with the window.
 */
export function cropLines(lines, { W, x0, y0, w, h }, mPx) {
    const k = W / TEX_W, pad = cropPad(W, mPx), out = [];
    const ya = (y0 / k) - pad, yb = (y0 + h) / k + pad, G = lineGrid(lines), r = G.reach, at = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v / GRID_PX)));
    for (const turn of [-1, 0, 1]) {
        const xa = x0 / k - turn * TEX_W - pad, xb = (x0 + w) / k - turn * TEX_W + pad, hit = [];
        if (xb + r < 0 || xa - r > TEX_W) continue;
        // (the cells holding the middles of the segments that may touch it, then each tested as before: in their order)
        for (let cy = at(ya - r, G.GH); cy <= at(yb + r, G.GH); cy++) for (let cx = at(xa - r, G.GW); cx <= at(xb + r, G.GW); cx++) {
            const c = cy * G.GW + cx;
            for (let j = G.start[c]; j < G.start[c + 1]; j++) {
                const s = G.idx[j] * LINE;
                // (out to its curve's bulge too: a third of its length at most, river-meander.js curveMaxKm)
                const ax = lines[s], ay = lines[s + 1], bx = lines[s + 2], by = lines[s + 3], cb = 0.3 * Math.hypot(bx - ax, by - ay);
                if (Math.max(ax, bx) + cb < xa || Math.min(ax, bx) - cb > xb || Math.max(ay, by) + cb < ya || Math.min(ay, by) - cb > yb) continue;
                hit.push(G.idx[j]);
            }
        }
        hit.sort((a, b) => a - b);
        for (const i of hit) {
            const s = i * LINE;
            out.push(lines[s] + turn * TEX_W, lines[s + 1], lines[s + 2] + turn * TEX_W, lines[s + 3]);
            for (let e = 4; e < LINE; e++) out.push(lines[s + e]);
        }
    }
    return Float64Array.from(out);
}
// (cropLines' margin in the texture's px: out to the widest valley, and the farthest a meander moves its line — 0.3 for a
// latitude's narrower pixels east–west)
export const cropPad = (W, mPx) => (mPx + (LEVEL_OUT * reachOf(2e5, VALLEY.depthMax).out + MEANDER_PAD_KM / 0.3) / (40030 / W)) / (W / TEX_W);

// (the lines indexed once by their middles on a coarse grid of the texture: a window reads the cells under it, not the
// planet's every segment three times — at 2.56M ~260k segments, ~16 ms a tile on the page's main thread as each was sent
// to a worker, ~70 ms a frame: the zoomed view's stutter. `reach`: how far a segment and its bulge lie from its middle)
const GRID_PX = 4, grids = new WeakMap();
function lineGrid(lines) {
    let G = grids.get(lines);
    if (G) return G;
    const GW = TEX_W / GRID_PX, GH = TEX_H / GRID_PX, n = lines.length / LINE, cell = new Int32Array(n), start = new Int32Array(GW * GH + 1), idx = new Int32Array(n);
    let reach = 0;
    for (let i = 0; i < n; i++) {
        const s = i * LINE, dx = lines[s + 2] - lines[s], dy = lines[s + 3] - lines[s + 1];
        reach = Math.max(reach, Math.max(Math.abs(dx), Math.abs(dy)) / 2 + 0.3 * Math.hypot(dx, dy));
        const cx = Math.min(GW - 1, Math.max(0, Math.floor((lines[s] + dx / 2) / GRID_PX))), cy = Math.min(GH - 1, Math.max(0, Math.floor((lines[s + 1] + dy / 2) / GRID_PX)));
        cell[i] = cy * GW + cx; start[cell[i] + 1]++;
    }
    for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c];
    const fill = start.slice(0, GW * GH);
    for (let i = 0; i < n; i++) idx[fill[cell[i]]++] = i;
    grids.set(lines, G = { GW, GH, start, idx, reach });
    return G;
}

/**
 * Cuts the valleys into D (km, the detail over the enlarged picture hb) over the extended window ew × eh starting at
 * pixel (X0, Y0) of a W-wide picture: `pxKm` its pixel north–south, `cosLa` each row's,
 * `seaB` its sea (none cut), `fade(λ km)` how much of a feature the pixels hold. Each valley's floor is the deepest of the
 * valleys over it (rivers meeting), its finer detail laid flat; the land is kept above the sea.
 */
export function carveValleys(D, lines, { hb, seaB, W, X0, Y0, ew, eh, pxKm, cosLa, fade }) {
    if (!lines || !lines.length) return;
    const N = ew * eh, cut = new Float32Array(N), flat = new Float32Array(N), levS = new Float32Array(N), levN = new Float32Array(N), levW = new Float32Array(N), k = W / TEX_W, swing = meanderSwing(fade), mo = [0, 0], turn = [0, 0], cv = [0, 0];
    // (the finer detail drained by the rivers — owner: on rough mountains the lines ran over the bumps, in no valley. The
    // valleys above are the picture's (its ground above the river's own); the detail added at this zoom (fine-ladder.js,
    // the rocks) is no part of them, and ran straight across every river. So the detail beside a line rises no faster than
    // the valleys' walls (VALLEY.side) from its floor: the river in a V of its own through any texture, as wide as the texture is
    // high, the same at every zoom (the detail is faded in by the pixels, and its valleys with it). How far that reaches: the
    // window's highest detail, climbed at that slope)
    let dMax = 0;
    for (let p = 0; p < N; p++) if (!seaB[p] && D[p] > dMax) dMax = D[p];
    const cone = new Float32Array(N).fill(Infinity), coneOut = dMax / VALLEY.side;
    for (let s = 0; s < lines.length; s += LINE) {
        // (faded in by the flow where each pixel's nearest point is, below: by the segment's larger end, two segments meeting
        // faded unlike, and the deepest cut stepped across the valley at every point of the line — a fringe of spurs)
        // (each end's depth: how far the river's own ground lies below the picture over it — the relief the gorges and the
        // land around them have, which the picture's pixels blur away; none where the picture lies lower)
        const qa = lines[s + 4], qb = lines[s + 5], ha = lines[s + 13], hb1 = lines[s + 14], Sa = lines[s + 18], Sb = lines[s + 19];
        const da = Math.min(VALLEY.depthMax, Math.max(0, ha - lines[s + 20])), db = Math.min(VALLEY.depthMax, Math.max(0, hb1 - lines[s + 21]));
        const big = reachOf(Math.max(qa, qb), Math.max(da, db)), bigOut = Math.max(LEVEL_OUT * big.out, big.f + coneOut);
        if (!(fade(2 * big.out) > 0) && !(coneOut > 0)) continue;
        const ax = lines[s] * k - X0, ay = lines[s + 1] * k - Y0, bx = lines[s + 2] * k - X0, by = lines[s + 3] * k - Y0;
        const sa = lines[s + 6], sb = lines[s + 7], n0x = lines[s + 8], n0y = lines[s + 9], n1x = lines[s + 10], n1y = lines[s + 11], seed = lines[s + 12];
        const sHead = lines[s + 15], sTail = lines[s + 16], sEnd = lines[s + 17];
        // (the segment's box, out to its valley's reach and its meanders' swing: east–west in pixels of this latitude)
        // (and the segment's own curve off its chord, river-meander.js curveAt: as the page draws it)
        const jMid = Math.min(eh - 1, Math.max(0, Math.round((ay + by) / 2))), cl = Math.max(0.05, cosLa[jMid]);
        const ex = (bx - ax) * cl, ey = by - ay, L2 = ex * ex + ey * ey, lenKm = Math.sqrt(L2) * pxKm;
        endTurns(lines, s, cl, turn);
        const bulge = curveMaxKm(turn[0], turn[1], lenKm), reach = bigOut + swing + bulge;
        const rx = reach / (pxKm * cl) + 1, ry = reach / pxKm + 1;
        const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - rx)), i1 = Math.min(ew - 1, Math.ceil(Math.max(ax, bx) + rx));
        const j0 = Math.max(0, Math.floor(Math.min(ay, by) - ry)), j1 = Math.min(eh - 1, Math.ceil(Math.max(ay, by) + ry));
        if (i0 > i1 || j0 > j1) continue;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const p = j * ew + i;
            if (seaB[p]) continue;
            // (where along the unbent segment the pixel lies, how far past its ends, and how far to its side along the
            // line's normal — blended along it as the drawn line's: km, east–west shrunk by the latitude)
            const px = (i + 0.5 - ax) * cl, py = j + 0.5 - ay, tr = L2 > 0 ? (px * ex + py * ey) / L2 : 0, t = Math.min(1, Math.max(0, tr));
            const over = (tr < 0 ? -tr : tr > 1 ? tr - 1 : 0) * lenKm;
            const nx = n0x + t * (n1x - n0x), ny = n0y + t * (n1y - n0y), side = ((px - t * ex) * nx + (py - t * ey) * ny) / (Math.hypot(nx, ny) || 1) * pxKm;
            // (the valley tapered in from where the drawn line begins, out to where it ends, none past them — read where the
            // pixel lies along the line run on past the segment's ends: the next segments' rounded ends reached back past
            // the head, a dip of 5 m 1 km upstream of the line)
            const q = qa + t * (qb - qa), v = reachOf(q, da + t * (db - da)), wide = LEVEL_OUT * v.out, sOn = sa + tr * (sb - sa);
            const ends = smooth(0, v.out, sOn - sHead) * smooth(0, v.out, sTail - sOn), fd = fade(2 * v.out) * ends, any = Math.max(wide, v.f + coneOut);
            if (!(ends > 0) || !(over < any) || !(Math.abs(side) - swing - bulge < any)) continue;
            // (the distance from the bent line — the river as drawn, river-meander.js: its offset to the side there, eased by
            // how steeply it swings — a pixel read once per segment, not once per step of the bent line: a bend's every step
            // swept a box as wide as the valley, ~1,000× the pixels up close)
            meanderAt(sa + t * (sb - sa), sEnd, q, Sa + t * (Sb - Sa), seed, fade, mo);
            curveAt(turn[0], turn[1], lenKm, t, cv); mo[0] += cv[0]; mo[1] += cv[1];
            // (the valley a clean profile about the drawn line, its width the flow's: no noise on its banks or its floor. Their
            // noises ran at a frequency set by the flow, times a place ~6,371 km from the centre — the flow's least change
            // along a river turned them thousands of waves: zigzag banks, and swirls on every slope a creek crossed; and the
            // floor's wander to either side flipped at each segment's end — removed 2026-11-18)
            const dist = Math.hypot(over, Math.abs(side - mo[0]) / Math.hypot(1, mo[1]));
            // (the detail's ceiling here: the walls' slope up from the floor's edge, let go where the line begins and ends)
            const cap = VALLEY.side * Math.max(0, dist - v.f) / Math.max(1e-3, ends);
            if (cap < cone[p]) cone[p] = cap;
            if (!(fd > 0) || !(dist < wide)) continue;
            // (the valley down to the river's own ground, which lies above the sea; and the channel in its floor as deep as its
            // flow's hydraulic geometry, across its width)
            const chan = channelDepthKm(q) * (1 - smooth(0.6 * v.f, v.f, dist));
            // (the wall rising from the bank at once, easing into the land at its rim, no hard edge: a smoothstep rose flat
            // from the bank, the floor within 1 m of its lowest ~800 m wide for a 190 m channel. The finer detail eased flat
            // across the bed alone (bedKm, which the river's colour fills), back to half at its edge: smoothed across the wall
            // (0.5–2.2 km), it read as a broad smooth bed 5–7× the drawn line; eased back past the bed, a bare rim showed)
            const u = v.out > v.f ? Math.min(1, Math.max(0, (dist - v.f) / (v.out - v.f))) : 1, inV = (1 - u) * (1 - u), c = fd * (v.d * inV + chan);
            const fl = 0.8 * fd * (1 - smooth((BED - 0.5) * v.f, (BED + 0.5) * v.f, dist));
            if (c > cut[p]) cut[p] = c;
            if (fl > flat[p]) flat[p] = fl;
            // (the valley level across: ground below the line's height raised toward it by a bell about the line — where
            // the picture's slope ran across the river, a cut a set depth into it left the line on a shelf, a wall above it
            // uphill and the ground falling away below; eased with the wall alone it still fell below the floor 3–4 km
            // out; raised flat to the valley's edge and let go over 0.6 reaches, it made a flat bed with a rim falling
            // ~4× the picture's slope. Raised only: the uphill side keeps its hill; the nearest valley's level where two meet)
            // (the height raised to blended over every segment by its weight: taken from the heaviest alone, it stepped a few
            // metres where two segments tied — inside a bend, a fan of dark streaks off the line)
            const lw = fd * Math.exp(-((dist / (LEVEL.bell * v.out)) ** 2)) * (1 - smooth(0.8 * wide, wide, dist));
            if (lw > levW[p]) levW[p] = lw;
            if (lw > 0) { levS[p] += lw * Math.max(0, ha + t * (hb1 - ha) - hb[p]); levN[p] += lw; }
        }
    }
    for (let p = 0; p < N; p++) {
        if (!(cut[p] > 0 || flat[p] > 0 || levW[p] > 0 || cone[p] < D[p])) continue;
        const before = D[p];
        let v = Math.min(before * (1 - flat[p]), cone[p]) - cut[p] + (levN[p] > 0 ? levW[p] * levS[p] / levN[p] : 0);
        // (no new sea inland and no channel of sea up the river: the floor stays a few metres up)
        if (hb[p] + v < SEA_FLOOR) v = Math.min(before, Math.max(v, SEA_FLOOR - hb[p]));
        D[p] = v;
    }
}
