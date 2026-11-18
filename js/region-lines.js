// The edge rivers as the map draws them (fork addition, for the region pick: region-grid.js, region-walls.js and the
// globe's REGION_GLSL, v2/js/app/region-glsl.js). A valley's edge along a river is that river's drawn line itself: the
// same points (world.fin.rivers, its cells' centres), the same reaches, smoothed by Chaikin twice as finish-view.js
// riverSegments smooths them. Near such a line a place reads only the map's texels on its own side of it (readAt, and
// the shader alike), so the edge is the river at any zoom; elsewhere the four texels round it decide.
// Why: docs/region-rivers-vs-cells.md.

const D = Math.PI / 180;
const KEEP = 3.5, BOX = 3.96, Q = 32;        // (a texel keeps its nearest line within KEEP px, clipped to ±BOX, in 1/Q px)
const STEP = 1;                              // (px: the drawn line's points kept at least this far apart, a chord between them)
const GROW = 1;                              // (px: a run's end drawn on to meet the river it joins, where it stops short)
const FAR = 3;                               // (texels: how far readAt and the shader look for land the tiles draw past the coast)
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * The edge rivers' segments on a W × H map (rows from the south; x unwrapped along a reach, so a line crosses the date
 * line whole): { seg: [x0, y0, x1, y1, …], end: per segment, bit 1 its start and bit 2 its end a river's real end
 * (where it stops being an edge: a place past it is the pixels'), bits 4 and 8 the same ends drawn on (realEnds), run }.
 * The drawn line's points are kept STEP px apart (Chaikin leaves steps of a fifth of a pixel): a chord between them
 * strays a few hundredths of a pixel from the drawn curve. Kept on V.
 */
export function edgeLines(w, V, W, H) {
    if (V._edgeLines?.W === W) return V._edgeLines;
    const R = w.fin.rivers, idx = w.tMesh.index, starts = [...R.start, R.lat.length], seg = [], end = [], run = [];
    const edge = (c) => V.wall[c] && V.qe[c] >= V.edgeKm2;
    let runs = 0;
    for (let r = 0; r < starts.length - 1; r++) {
        let p = [], s = [];                                          // (points; per step, whether an edge river's)
        for (let i = starts[r]; i < starts[r + 1]; i++) {
            const la = R.lat[i] * D, lo = R.lon[i] * D, c = idx.nearest(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
            let x = (R.lon[i] + 180) / 360 * W;
            if (p.length) x += Math.round((p[p.length - 1][0] - x) / W) * W;
            if (i > starts[r]) s.push(p[p.length - 1][2]);
            p.push([x, (R.lat[i] + 90) / 180 * H, edge(c)]);
        }
        if (p.length < 2) continue;
        for (let it = 0; it < 2; it++) [p, s] = chaikin(p, s);
        for (let k = 0; k < s.length; k++) {
            if (!s[k] || (k > 0 && s[k - 1])) continue;               // (each run of edge steps, points k … e)
            let e = k;
            while (e < s.length && s[e]) e++;
            runs++;
            const first = end.length;
            for (let a = k; a < e;) {                                // (its points in chords of ≥ STEP px, no stub left at the end)
                let b = a + 1;
                while (b < e && dist(p[a], p[b]) < STEP) b++;
                if (b < e && dist(p[b], p[e]) < STEP / 2) b = e;
                seg.push(p[a][0], p[a][1], p[b][0], p[b][1]); run.push(runs); end.push(0);
                a = b;
            }
            end[first] |= 1; end[end.length - 1] |= 2;
        }
    }
    const L = { W, H, seg: Float32Array.from(seg), end: Uint8Array.from(end), run: Int32Array.from(run) };
    realEnds(L);
    return (V._edgeLines = L);
}

/** One Chaikin pass, as the map's: each step's flag kept by its two new points' step, a cut corner an edge's if both were. */
function chaikin(p, s) {
    const q = [p[0]], f = [];
    for (let k = 0; k < s.length; k++) {
        const a = p[k], b = p[k + 1];
        f.push(k === 0 ? s[0] : s[k - 1] && s[k], s[k]);
        q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    q.push(p[p.length - 1]); f.push(s[s.length - 1]);
    return [q, f];
}

/** Distance from (px, py) to segment k, and where along it (t): px taken round the planet to the segment's side. */
function toSeg(L, k, px, py) {
    const S = L.seg, ax = S[4 * k], ay = S[4 * k + 1], dx = S[4 * k + 2] - ax, dy = S[4 * k + 3] - ay;
    px += Math.round((ax + dx / 2 - px) / L.W) * L.W;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
    return { d: Math.hypot(px - ax - t * dx, py - ay - t * dy), t, cr: dx * (py - ay) - dy * (px - ax) };
}

/** The segments within a pixel of (x, y): (x, y) => indices (a 4-px bucket's, each segment in every bucket it comes within a pixel of). */
function buckets(L) {
    const C = 4, nx = Math.ceil(L.W / C), hash = new Map(), S = L.seg, none = [];
    const key = (i, j) => j * nx + ((i % nx) + nx) % nx;
    for (let k = 0; k < L.end.length; k++) {
        const i0 = Math.floor((Math.min(S[4 * k], S[4 * k + 2]) - 1) / C), i1 = Math.floor((Math.max(S[4 * k], S[4 * k + 2]) + 1) / C);
        const j0 = Math.floor((Math.min(S[4 * k + 1], S[4 * k + 3]) - 1) / C), j1 = Math.floor((Math.max(S[4 * k + 1], S[4 * k + 3]) + 1) / C);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (hash.get(key(i, j)) ?? hash.set(key(i, j), []).get(key(i, j))).push(k);
    }
    return (x, y) => hash.get(key(Math.floor(x / C), Math.floor(y / C))) ?? none;
}

/**
 * A run's end is a real one only with no other edge river within a pixel (a tributary ends on its main stem's line);
 * one that stops short of that river, not on it, is drawn on to meet it (end bit 4 its start, 8 its end: packLines).
 */
function realEnds(L) {
    const S = L.seg, near = buckets(L);
    for (let k = 0; k < L.end.length; k++) for (const b of [1, 2]) {
        if (!(L.end[k] & b)) continue;
        const px = S[4 * k + (b === 1 ? 0 : 2)], py = S[4 * k + (b === 1 ? 1 : 3)];
        let d = Infinity;
        for (const m of near(px, py)) if (L.run[m] !== L.run[k]) d = Math.min(d, toSeg(L, m, px, py).d);
        if (d < 1) L.end[k] &= ~b;
        if (d < 1 && d > 0.01) L.end[k] |= 4 * b;
    }
}

/** Each pixel's nearest edge segment within KEEP px: { near, dist }. */
function nearest(L) {
    const { W, H, seg: S } = L, near = new Int32Array(W * H).fill(-1), dist = new Float32Array(W * H).fill(KEEP);
    for (let k = 0; k < L.end.length; k++) {
        const i0 = Math.floor(Math.min(S[4 * k], S[4 * k + 2]) - KEEP), i1 = Math.floor(Math.max(S[4 * k], S[4 * k + 2]) + KEEP);
        const j0 = Math.max(0, Math.floor(Math.min(S[4 * k + 1], S[4 * k + 3]) - KEEP)), j1 = Math.min(H - 1, Math.floor(Math.max(S[4 * k + 1], S[4 * k + 3]) + KEEP));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const p = j * W + ((i % W) + W) % W, d = toSeg(L, k, i + 0.5, j + 0.5).d;
            if (d < dist[p]) { dist[p] = d; near[p] = k; }
        }
    }
    return { near, dist };
}

/** Whether the step a → b crosses the segment c → d (strictly: touching is not crossing). */
export function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
    const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    return o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0 && o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0;
}

/**
 * The flooded map G cut along the edge rivers' lines. A wall pixel (M: one the line passes through) has no side of its
 * own in the flood; it takes the valley of the land next to it that it reaches without crossing a line, nearest first,
 * so every pixel's centre holds a valley of its own side. In place; the lines kept on V. (Before, each segment carried
 * one valley a side, voted or probed off the flood, and gave it to every pixel near it: where a valley lies in a strip
 * thinner than the probe beside the river, the segment took the valley beyond it and cut the strip into specks.)
 */
export function cutAlong(w, V, G, M, W, H) {
    const L = edgeLines(w, V, W, H), { near } = nearest(L), S = L.seg, around = buckets(L);
    L.near = near;
    const open = (p, q) => {                                           // (a step between two pixels' centres no line cuts)
        const ip = p % W, jp = (p - ip) / W, iq = q % W, jq = (q - iq) / W;
        let bx = iq + 0.5;
        bx += Math.round((ip + 0.5 - bx) / W) * W;
        for (const k of around((ip + 0.5 + bx) / 2, (jp + jq) / 2 + 0.5)) {
            const sh = Math.round((ip + 0.5 - (S[4 * k] + S[4 * k + 2]) / 2) / W) * W;
            if (crosses(ip + 0.5, jp + 0.5, bx, jq + 0.5, S[4 * k] + sh, S[4 * k + 1], S[4 * k + 2] + sh, S[4 * k + 3])) return false;
        }
        return true;
    };
    let front = [];
    for (let p = 0; p < W * H; p++) if (M[p] && G[p] >= 0) G[p] = -2;     // (−2: a wall pixel still to be given)
    for (let p = 0; p < W * H; p++) if (G[p] >= 0 && near[p] >= 0) front.push(p);
    while (front.length) {
        const next = [];
        for (const p of front) for (const q of four(p, W, H)) if (G[q] === -2 && open(p, q)) { G[q] = G[p]; next.push(q); }
        front = next;
    }
    for (let p = 0; p < W * H; p++) if (G[p] === -2) for (const q of four(p, W, H)) if (G[q] >= 0) { G[p] = G[q]; break; }
    for (let p = 0; p < W * H; p++) if (G[p] === -2) G[p] = -1;
}

/** A pixel's 4 neighbours (east–west round the planet). */
function four(p, W, H) {
    const i = p % W, j = (p - i) / W, out = [j * W + (i + 1) % W, j * W + (i + W - 1) % W];
    if (j > 0) out.push(p - W);
    if (j < H - 1) out.push(p + W);
    return out;
}

/**
 * The lines for the GPU and the pick: per texel near a line, its nearest segment (the chords share their points, so the
 * texels round a place, each holding its own piece, leave no gap in the line; drawn straight on past a point they would
 * cut the outer side of a bend off), a run's end that stops short of the river it joins drawn on GROW px, clipped to the texel's ±BOX px (geo: x0, y0, x1, y1 from its centre, in 1/Q px); on: R 1 a line. V.lines.
 */
export function packLines(V, G, W, H) {
    const L = V._edgeLines, N = W * H, geo = new Uint8Array(4 * N), on = new Uint8Array(4 * N), S = L.seg;
    const byte = (v) => Math.max(0, Math.min(255, Math.round((v + 4) * Q)));
    for (let p = 0; p < N; p++) {
        const k = L.near[p];
        if (k < 0) continue;
        const i = p % W, ox = i + 0.5, oy = (p - i) / W + 0.5, sh = Math.round((ox - (S[4 * k] + S[4 * k + 2]) / 2) / W) * W;
        let ax = S[4 * k] + sh - ox, ay = S[4 * k + 1] - oy, bx = S[4 * k + 2] + sh - ox, by = S[4 * k + 3] - oy;
        const l = Math.hypot(bx - ax, by - ay) || 1, ex = (bx - ax) / l * GROW, ey = (by - ay) / l * GROW;
        if (L.end[k] & 4) { ax -= ex; ay -= ey; }
        if (L.end[k] & 8) { bx += ex; by += ey; }
        const dx = bx - ax, dy = by - ay, c = clip(ax, ay, dx, dy);
        if (!c) continue;
        geo[4 * p] = byte(ax + c[0] * dx); geo[4 * p + 1] = byte(ay + c[0] * dy); geo[4 * p + 2] = byte(ax + c[1] * dx); geo[4 * p + 3] = byte(ay + c[1] * dy);
        on[4 * p] = 1;
    }
    L.near = null;
    return (V.lines = { geo, on });
}

/** A segment a + t·d clipped to the box ±BOX (Liang–Barsky): [t0, t1], or null. */
function clip(ax, ay, dx, dy) {
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, ax + BOX], [dx, BOX - ax], [-dy, ay + BOX], [dy, BOX - ay]]) {
        if (p === 0) { if (q < 0) return null; continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) return null; t0 = Math.max(t0, r); } else { if (r < t0) return null; t1 = Math.min(t1, r); }
    }
    return [t0, t1];
}

/** The cubic B-spline's weights of the 4 texels along an axis, at t of the way from the second to the third. */
const spline = (t) => { const s = 1 - t; return [s * s * s / 6, (3 * t * t * t - 6 * t * t + 4) / 6, (3 * s * s * s - 6 * s * s + 4) / 6, t * t * t / 6]; };

/** The land valley with the most spline weight of the 4 × 4 texels round (i + fx, j + fy), as the shader's regionSmooth. */
function smooth(G, W, H, i, j, fx, fy) {
    const wx = spline(fx), wy = spline(fy), id = [], wt = [];
    for (let k = 0; k < 16; k++) {
        const kx = k % 4, ky = k >> 2, b = Math.max(0, Math.min(H - 1, j + ky - 1));
        id.push(G[b * W + ((i + kx - 1) % W + W) % W]);
        wt.push(id[k] >= 0 ? wx[kx] * wy[ky] : 0);
    }
    let best = -1, top = -1;
    for (let a = 0; a < 16; a++) {
        if (wt[a] <= 0) continue;
        let s = 0;
        for (let b = 0; b < 16; b++) if (id[b] === id[a]) s += wt[b];
        if (s > top) { top = s; best = id[a]; }
    }
    return best;
}

/**
 * The valley at (px, py) on map G (in texels less a half: texel i's centre at i; rows from the south), as the globe's
 * shader reads it (region-glsl.js regionAt), so what is picked is what is drawn. The sea where the map draws it: `sea`
 * (the tile's sea share, filtered as the shader reads it: detail-view.js seaAt) ≥ ½ where the zoomed tiles draw the
 * place, else where the sea's share of the four texels round it is ½ or more,
 * as the picture is painted (finish-view.js rasterAt). On land, of the 4 × 4 texels round it the land valley with the
 * most cubic B-spline weight (a smooth curve, not the texels' steps and square corners). Near an edge river (its nearest
 * texel within KEEP of a line) of the four, and only the texels the point reaches without crossing one of the
 * lines the 3 × 3 texels round it keep count. None of the four (or land drawn past the grid's): the nearest land texel
 * of the 7 × 7 (FAR) so reached. So the edge is the river's line and the coast the drawn one at any zoom, and every place takes
 * a valley its own side's texels hold: the reading can make no piece the map does not have.
 */
export function readAt(G, lines, W, H, px, py, sea = null) {
    const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
    const at = (a, b) => Math.max(0, Math.min(H - 1, b)) * W + ((a % W) + W) % W;
    const T = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]], id = T.map(([a, b]) => G[at(a, b)]);
    const wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    if ((sea ?? id.reduce((s, v, k) => s + (v < 0 ? wt[k] : 0), 0)) >= 0.5) return -1;
    const most = (ok) => {
        let best = -2, top = -1;
        for (let a = 0; a < 4; a++) {
            if (!ok[a]) continue;
            let s = 0;
            for (let b = 0; b < 4; b++) if (ok[b] && id[b] === id[a]) s += wt[b];
            if (s > top) { top = s; best = id[a]; }
        }
        return best;
    };
    const land = id.map((v) => v >= 0), ci = Math.round(px), cj = Math.round(py);
    const near0 = cj >= 0 && cj < H && lines && lines.on[4 * at(ci, cj)];
    if (!near0 && land.some(Boolean)) return smooth(G, W, H, i, j, fx, fy);
    const seg = [];
    if (near0) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = ci + di, b = cj + dj, p = at(a, b), { geo, on } = lines;
        if (b < 0 || b >= H || !on[4 * p]) continue;
        seg.push([a + geo[4 * p] / Q - 4, b + geo[4 * p + 1] / Q - 4, a + geo[4 * p + 2] / Q - 4, b + geo[4 * p + 3] / Q - 4]);
    }
    const clear = (a, b) => seg.every((s) => !crosses(px, py, a, b, s[0], s[1], s[2], s[3]));
    const ok = T.map(([a, b], k) => land[k] && clear(a, b));
    if (ok.some(Boolean)) return most(ok);
    let near = Infinity, u = -1;
    // (land the zoomed tiles draw past the grid's coast reaches ~2 texels out: the nearest land of the 7 × 7, as the shader)
    for (let dj = -FAR; dj <= FAR; dj++) for (let di = -FAR; di <= FAR; di++) {
        const a = ci + di, b = cj + dj, d = (a - px) ** 2 + (b - py) ** 2, v = G[at(a, b)];
        if (d < near && v >= 0 && clear(a, b)) { near = d; u = v; }
    }
    return u;
}
