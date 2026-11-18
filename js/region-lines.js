// The edge rivers as the map draws them (fork addition, for the region pick: region-grid.js, region-walls.js and the
// globe's REGION_GLSL, v2/js/app/region-glsl.js). A valley's edge along a river is that river's drawn line itself: the
// same points (world.fin.rivers, its cells' centres), the same reaches, smoothed by Chaikin twice as finish-view.js
// riverSegments smooths them. Near such a line (within BAND px of the valleys' 2048 × 1024 map) a place's valley is the
// one on its side of the line, not the map's pixel's, so the edge is the river at any zoom; elsewhere the pixels decide.
// Why: docs/region-rivers-vs-cells.md.

const D = Math.PI / 180;
export const BAND = 2;                       // (px: within it of an edge river, the line's side decides)
const KEEP = 3.5, BOX = 3.96, Q = 32;        // (a texel keeps its nearest line within KEEP px, clipped to ±BOX, in 1/Q px)

/**
 * The edge rivers' segments on a W × H map (rows from the south; x unwrapped along a reach, so a line crosses the date
 * line whole): { seg: [x0, y0, x1, y1, …], end: per segment, bit 1 its start and bit 2 its end a river's real end
 * (where it stops being an edge: a place past it is the pixels'), run }. Kept on V.
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
            if (!s[k]) continue;
            if (k === 0 || !s[k - 1]) runs++;
            seg.push(p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]); run.push(runs);
            end.push((k === 0 || !s[k - 1] ? 1 : 0) | (k === s.length - 1 || !s[k + 1] ? 2 : 0));
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

/** A run's end is a real one only with no other edge river within a pixel (a tributary ends on its main stem's line). */
function realEnds(L) {
    const C = 4, nx = Math.ceil(L.W / C), hash = new Map(), n = L.end.length, S = L.seg;
    const key = (i, j) => j * nx + ((i % nx) + nx) % nx;
    for (let k = 0; k < n; k++) {
        const i0 = Math.floor((Math.min(S[4 * k], S[4 * k + 2]) - 1) / C), i1 = Math.floor((Math.max(S[4 * k], S[4 * k + 2]) + 1) / C);
        const j0 = Math.floor((Math.min(S[4 * k + 1], S[4 * k + 3]) - 1) / C), j1 = Math.floor((Math.max(S[4 * k + 1], S[4 * k + 3]) + 1) / C);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (hash.get(key(i, j)) ?? hash.set(key(i, j), []).get(key(i, j))).push(k);
    }
    for (let k = 0; k < n; k++) for (const b of [1, 2]) {
        if (!(L.end[k] & b)) continue;
        const px = S[4 * k + (b === 1 ? 0 : 2)], py = S[4 * k + (b === 1 ? 1 : 3)];
        const near = (hash.get(key(Math.floor(px / C), Math.floor(py / C))) ?? []).some((m) => L.run[m] !== L.run[k] && toSeg(L, m, px, py).d < 1);
        if (near) L.end[k] &= ~b;
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

/** The side of segment k a point is on: 1 left, 0 right, −1 past a real end (no side). */
function sideOf(L, k, px, py) {
    const { t, cr } = toSeg(L, k, px, py);
    if ((t <= 0 && L.end[k] & 1) || (t >= 1 && L.end[k] & 2)) return -1;
    return cr > 0 ? 1 : 0;
}

/** The valley of map G at (x, y) off segment k's middle, `d` px to one side (+1 left, −1 right). */
function offside(L, G, k, s, d) {
    const S = L.seg, dx = S[4 * k + 2] - S[4 * k], dy = S[4 * k + 3] - S[4 * k + 1], l = Math.hypot(dx, dy) || 1;
    const x = (S[4 * k] + S[4 * k + 2]) / 2 - s * d * dy / l, y = (S[4 * k + 1] + S[4 * k + 3]) / 2 + s * d * dx / l;
    const j = Math.max(0, Math.min(L.H - 1, Math.floor(y))), i = ((Math.floor(x) % L.W) + L.W) % L.W;
    return j * L.W + i;
}

/**
 * The flooded map G cut along the edge rivers' lines: each segment's valley on either side read off the flood a little
 * past the wall (M), then every pixel within BAND of a line given its side's. In place; the lines kept on V.
 */
export function cutAlong(w, V, G, M, W, H) {
    const L = edgeLines(w, V, W, H), n = L.end.length, { near, dist } = nearest(L);
    L.near = near; L.left = new Int32Array(n); L.right = new Int32Array(n);
    for (let k = 0; k < n; k++) for (const s of [1, -1]) {
        let u = -1;
        for (const d of [1.5, 2, 2.5, 3, 3.5]) { const p = offside(L, G, k, s, d); if (G[p] >= 0 && !M[p]) { u = G[p]; break; } }
        if (u < 0) for (const d of [1, 1.5, 2]) { const p = offside(L, G, k, s, d); if (G[p] >= 0) { u = G[p]; break; } }
        (s > 0 ? L.left : L.right)[k] = u;
    }
    for (let p = 0; p < W * H; p++) {
        const k = near[p];
        if (k < 0 || dist[p] >= BAND || G[p] < 0) continue;
        const i = p % W, s = sideOf(L, k, i + 0.5, (p - i) / W + 0.5), u = s < 0 ? -1 : s ? L.left[k] : L.right[k];
        if (u >= 0) G[p] = u;
    }
}

/**
 * The lines for the GPU and the pick, after the map is final (each side's valley read again off it, a pixel out, for a
 * patch the map gave to another valley): per texel near a line, its nearest segment clipped to the texel's ±BOX px
 * (geo: x0, y0, x1, y1 from its centre, in 1/Q px), the valley + 1 left (lid RGB) and right (rid RGB), lid A the flags
 * (1 a line, 2 its start a real end, 4 its end). V.lines.
 */
export function packLines(V, G, W, H) {
    const L = V._edgeLines, n = L.end.length, N = W * H, geo = new Uint8Array(4 * N), lid = new Uint8Array(4 * N), rid = new Uint8Array(4 * N);
    for (let k = 0; k < n; k++) for (const s of [1, -1]) {
        const u = G[offside(L, G, k, s, 1)];
        if (u >= 0) (s > 0 ? L.left : L.right)[k] = u;
    }
    const S = L.seg, put = (T, p, u) => { u++; T[4 * p] = u & 255; T[4 * p + 1] = (u >> 8) & 255; T[4 * p + 2] = (u >> 16) & 255; };
    const byte = (v) => Math.max(0, Math.min(255, Math.round((v + 4) * Q)));
    for (let p = 0; p < N; p++) {
        const k = L.near[p];
        if (k < 0 || (L.left[k] < 0 && L.right[k] < 0)) continue;
        const i = p % W, ox = i + 0.5, oy = (p - i) / W + 0.5, sh = Math.round((ox - (S[4 * k] + S[4 * k + 2]) / 2) / W) * W;
        const ax = S[4 * k] + sh - ox, ay = S[4 * k + 1] - oy, dx = S[4 * k + 2] + sh - ox - ax, dy = S[4 * k + 3] - oy - ay;
        const c = clip(ax, ay, dx, dy);
        if (!c) continue;
        geo[4 * p] = byte(ax + c[0] * dx); geo[4 * p + 1] = byte(ay + c[0] * dy); geo[4 * p + 2] = byte(ax + c[1] * dx); geo[4 * p + 3] = byte(ay + c[1] * dy);
        put(lid, p, L.left[k]); put(rid, p, L.right[k]);
        lid[4 * p + 3] = 1 | (c[0] === 0 && L.end[k] & 1 ? 2 : 0) | (c[1] === 1 && L.end[k] & 2 ? 4 : 0);
    }
    L.near = null;
    return (V.lines = { geo, lid, rid });
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

/**
 * The valley a line decides at (px, py) on the map (px from 0 to W, rows from the south), or −2: none (no line within
 * BAND, or past a line's real end). The same as the globe's shader (region-glsl.js regionLine), so what is picked is
 * what is drawn: the nearest of the lines kept by the 3 × 3 texels round the point.
 */
export function lineAt(lines, W, H, px, py) {
    const { geo, lid, rid } = lines, ci = Math.floor(px), cj = Math.floor(py);
    const at = (i, j) => (j < 0 || j >= H ? -1 : j * W + ((i % W) + W) % W);
    const p0 = at(ci, cj);
    if (p0 < 0 || !(lid[4 * p0 + 3] & 1)) return -2;
    let best = Infinity, id = -2;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const p = at(ci + di, cj + dj);
        if (p < 0 || !(lid[4 * p + 3] & 1)) continue;
        const ox = ci + di + 0.5, oy = cj + dj + 0.5, ax = ox + geo[4 * p] / Q - 4, ay = oy + geo[4 * p + 1] / Q - 4;
        const dx = ox + geo[4 * p + 2] / Q - 4 - ax, dy = oy + geo[4 * p + 3] / Q - 4 - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
        const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        if (d >= best) continue;
        best = d;
        const f = lid[4 * p + 3];
        if ((t <= 0 && f & 2) || (t >= 1 && f & 4)) { id = -2; continue; }
        const T = dx * (py - ay) - dy * (px - ax) > 0 ? lid : rid;
        id = T[4 * p] + 256 * T[4 * p + 1] + 65536 * T[4 * p + 2] - 1;
    }
    return best < BAND ? id : -2;
}
