// The opened region's parts (fork addition): which of its places lie in the chosen valleys, which in the border round
// them, which beyond. Read once the region is built, on a grid half the region's, off the valleys' map exactly as the
// pick reads it (region-grid.js gridAt: the 4 × 4 B-spline away from rivers, the drawn line along an edge river), with
// the region's own coast as the sea's share, so the chosen land ends where the region's sea begins. The outline is the
// edge of the chosen places traced between the grid's points (marching squares) and smoothed (Chaikin), a curve, not
// the grid's steps. Everything is read in km of the region's projection, so a zoom tile reads it too.

import { placeAt, cellXY, xyCell } from '../v2/js/region/region-frame.js';

const D = Math.PI / 180, SLICE_MS = 12, K = 2;

/**
 * The parts of `region` (its frame and sea): valley(x, y, z, seaShare) the valley at a point (the pick's reading), `ids`
 * the chosen ones, the border's width in km. Resolves to { m, on (2 chosen, 1 in the border, 0 beyond), partAt(x, y),
 * beyondAt(x, y) (0 inside the border … 1 two cells past it), outline (closed polylines in the region's cells) }.
 */
export async function regionMask(region, valley, ids, borderKm, progress) {
    const F = region.frame, N = F.n, m = N / K, on = new Uint8Array(m * m), dist = new Float32Array(m * m), sea = region.sea;
    const ll = [0, 0], xy = [0, 0], cell = F.km / m;
    for (let j = 0; j < m;) {
        const t = performance.now();
        for (; j < m && performance.now() - t < SLICE_MS; j++) for (let i = 0; i < m; i++) {
            let s = 0;
            for (let b = 0; b < K; b++) for (let a = 0; a < K; a++) s += sea[(K * j + b) * N + K * i + a];
            cellXY(F, K * i + K / 2 - 0.5, K * j + K / 2 - 0.5, xy); placeAt(F, xy[0], xy[1], ll);
            const la = ll[0] * D, lo = ll[1] * D, cl = Math.cos(la);
            dist[j * m + i] = ids.has(valley(cl * Math.cos(lo), cl * Math.sin(lo), Math.sin(la), s / (K * K))) ? 0 : Infinity;
        }
        progress?.(j / m);
        if (j < m) await new Promise((r) => setTimeout(r, 0));
    }
    chamfer(dist, m);
    for (let c = 0; c < m * m; c++) on[c] = dist[c] === 0 ? 2 : dist[c] * cell <= borderKm ? 1 : 0;
    const ramp = 2 * F.cellKm, q = [0, 0];
    // (a place's point on the half grid: its cell over K, the grid's points at the K × K blocks' centres)
    const toGrid = (x, y) => { xyCell(F, x, y, q); q[0] = q[0] / K - 0.5; q[1] = q[1] / K - 0.5; return q; };
    return {
        m, on,
        partAt(x, y) {
            const [gx, gy] = toGrid(x, y);
            return on[Math.min(m - 1, Math.max(0, Math.round(gy))) * m + Math.min(m - 1, Math.max(0, Math.round(gx)))];
        },
        beyondAt(x, y) {
            const [gx, gy] = toGrid(x, y), fx = Math.min(m - 1.001, Math.max(0, gx)), fy = Math.min(m - 1.001, Math.max(0, gy));
            const a = Math.floor(fx), b = Math.floor(fy), tx = fx - a, ty = fy - b, c = b * m + a;
            const d = (dist[c] * (1 - tx) + dist[c + 1] * tx) * (1 - ty) + (dist[c + m] * (1 - tx) + dist[c + m + 1] * tx) * ty;
            return Math.min(1, Math.max(0, (d * cell - borderKm) / ramp));
        },
        outline: outlineOf(on, m).map((p) => smoothLoop(p, 2).map((v) => (v + 0.5) * K)),
    };
}

/** The distance (in grid steps) to the nearest 0: a chamfer pass down and one back up. */
function chamfer(dist, m) {
    const S = Math.SQRT2;
    for (let pass = 0; pass < 2; pass++) {
        const down = pass === 0;
        for (let jj = 0; jj < m; jj++) for (let ii = 0; ii < m; ii++) {
            const j = down ? jj : m - 1 - jj, i = down ? ii : m - 1 - ii, c = j * m + i, s = down ? -1 : 1, y = j + s;
            let d = dist[c];
            if (i + s >= 0 && i + s < m) d = Math.min(d, dist[c + s] + 1);
            if (y >= 0 && y < m) {
                d = Math.min(d, dist[y * m + i] + 1);
                if (i - 1 >= 0) d = Math.min(d, dist[y * m + i - 1] + S);
                if (i + 1 < m) d = Math.min(d, dist[y * m + i + 1] + S);
            }
            dist[c] = d;
        }
    }
}

/**
 * The chosen places' edge (on === 2) as closed loops through the midpoints between the grid's points (marching squares;
 * past the grid counts as outside, so every loop closes; a saddle keeps the two inside corners apart). Each loop
 * [x0, y0, x1, y1, …] in grid points.
 */
function outlineOf(on, m) {
    const In = (i, j) => i >= 0 && j >= 0 && i < m && j < m && on[j * m + i] === 2;
    const P = m + 2, hk = (i, j) => 2 * ((j + 1) * P + i + 1), vk = (i, j) => hk(i, j) + 1;
    const mid = (k) => { const e = k >> 1, i = e % P - 1, j = (e - e % P) / P - 1; return k & 1 ? [i, j + 0.5] : [i + 0.5, j]; };
    const ends = new Map(), segs = [];
    const add = (a, b) => { const s = segs.length / 2; segs.push(a, b); for (const k of [a, b]) { const l = ends.get(k); if (l) l.push(s); else ends.set(k, [s]); } };
    for (let j = -1; j < m; j++) for (let i = -1; i < m; i++) {
        const tl = In(i, j), tr = In(i + 1, j), br = In(i + 1, j + 1), bl = In(i, j + 1);
        if (tl === tr && tr === br && br === bl) continue;
        const top = hk(i, j), bottom = hk(i, j + 1), left = vk(i, j), right = vk(i + 1, j);
        if (tl === br && tr === bl && tl !== tr) {
            if (tl) { add(top, left); add(bottom, right); } else { add(top, right); add(bottom, left); }
            continue;
        }
        const e = [];
        if (tl !== tr) e.push(top);
        if (tr !== br) e.push(right);
        if (br !== bl) e.push(bottom);
        if (bl !== tl) e.push(left);
        add(e[0], e[1]);
    }
    const used = new Uint8Array(segs.length / 2), loops = [];
    for (let s0 = 0; s0 < used.length; s0++) {
        if (used[s0]) continue;
        const pts = [], first = segs[2 * s0];
        let s = s0, at = first;
        while (s >= 0 && !used[s]) {
            used[s] = 1; pts.push(...mid(at));
            at = segs[2 * s] === at ? segs[2 * s + 1] : segs[2 * s];
            s = (ends.get(at) ?? []).find((t) => !used[t]) ?? -1;
        }
        loops.push(pts);
    }
    return loops;
}

/** A closed loop [x0, y0, …] cut at its corners `n` times (Chaikin): a smooth curve inside the steps' corners. */
function smoothLoop(p, n) {
    for (let r = 0; r < n; r++) {
        const q = [], L = p.length / 2;
        for (let k = 0; k < L; k++) {
            const a = 2 * k, b = 2 * ((k + 1) % L);
            q.push(0.75 * p[a] + 0.25 * p[b], 0.75 * p[a + 1] + 0.25 * p[b + 1], 0.25 * p[a] + 0.75 * p[b], 0.25 * p[a + 1] + 0.75 * p[b + 1]);
        }
        p = q;
    }
    return Float32Array.from(p);
}
