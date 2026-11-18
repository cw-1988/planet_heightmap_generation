// The valleys' map (fork addition, for the region pick): which valley each pixel of a 2048 × 1024 grid is in. It is
// the one picture of the valleys: the overlay draws it (region-overlay.js), the pointer picks from it and the region's
// mask is cut from it (region-pick.js), so what is shown is what is chosen. Its pixels are filled over the planet's
// heights from the valleys' cells, the edge rivers walls (region-flood.js). A valley is one piece on it by
// construction: a cell's or a river half's pixels can fall apart on the grid (a Voronoi corner thinner than a pixel,
// a half pinched at a bend), so each valley keeps its largest patch and every other patch goes to the valley round
// it, the one it shares the longest border with.

import { floodGrid } from './region-flood.js';

export const W = 2048, H = 1024;
const SLICE_MS = 8;

/** Each pixel's nearest cell (rows from the south), kept on the world: built a few rows at a time between frames. */
function pixelCells(w) {
    return (w._pixelCells ??= (async () => {
        const { index } = w.tMesh, out = new Int32Array(W * H);
        for (let j = 0; j < H;) {
            const t = performance.now();
            for (; j < H && performance.now() - t < SLICE_MS; j++) {
                const lat = -Math.PI / 2 + (j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
                for (let i = 0; i < W; i++) {
                    const lon = (i + 0.5) / W * 2 * Math.PI - Math.PI;
                    out[j * W + i] = index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl);
                }
            }
            if (j < H) await new Promise((r) => setTimeout(r, 0));
        }
        return out;
    })());
}

/**
 * The valley per pixel (−1 the sea; rows from the south), kept on V (valleysOf's): a promise, and V.grid once done.
 * A valley's stray patch that touches no other valley (a speck across a strait) becomes a valley of its own, its cells
 * added to V.cells.
 */
export function valleyGrid(w, V) {
    return (V._grid ??= pixelCells(w).then((pc) => {
        const G = floodGrid(w, V, pc, W, H);
        onePiece(G, V, pc);
        return (V.grid = G);
    }));
}

/**
 * The valley at a point on the sphere off the grid, read as the globe's shader reads it (globe-view.js regionAt: the
 * valley with the most weight of the four pixels round the point, so a smooth line, not the pixels' steps): what is
 * picked is what is drawn. Undefined while the grid is not built.
 */
export function gridAt(V, x, y, z) {
    const G = V.grid;
    if (!G) return undefined;
    const px = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI) * W - 0.5, py = (Math.asin(Math.max(-1, Math.min(1, z))) + Math.PI / 2) / Math.PI * H - 0.5;
    const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
    const at = (a, b) => G[Math.max(0, Math.min(H - 1, b)) * W + ((a % W) + W) % W];
    const id = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)], wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let best = id[0], most = -1;
    for (let a = 0; a < 4; a++) {
        let s = 0;
        for (let b = 0; b < 4; b++) if (id[b] === id[a]) s += wt[b];
        if (s > most) { most = s; best = id[a]; }
    }
    return best;
}

/** Each pixel's 4 neighbours (east–west round the planet). */
function around(p, fn) {
    const i = p % W, j = (p - i) / W;
    fn(j * W + (i + 1) % W); fn(j * W + (i + W - 1) % W);
    if (j > 0) fn(p - W);
    if (j < H - 1) fn(p + W);
}

/** Every valley one patch: G relabelled in place, until no stray patch is left. */
function onePiece(G, V, pc) {
    const comp = new Int32Array(W * H), stack = [];
    let fresh = 0;
    for (const u of V.cells.keys()) fresh = Math.max(fresh, u + 1);
    for (let pass = 0; pass < 8; pass++) {
        // the patches: per patch its valley and pixels; per valley its largest
        comp.fill(-1);
        const label = [], size = [], best = new Map();
        for (let s = 0; s < W * H; s++) {
            if (G[s] < 0 || comp[s] >= 0) continue;
            const k = label.length, u = G[s];
            let z = 0;
            comp[s] = k; stack.push(s);
            while (stack.length) { z++; around(stack.pop(), (q) => { if (comp[q] < 0 && G[q] === u) { comp[q] = k; stack.push(q); } }); }
            label.push(u); size.push(z);
            if (!best.has(u) || z > size[best.get(u)]) best.set(u, k);
        }
        // each stray patch: the valley it borders most (a largest patch first: then that valley stays one piece)
        const to = new Int32Array(label.length).fill(-1), border = new Map();
        let strays = 0;
        for (let k = 0; k < label.length; k++) if (best.get(label[k]) !== k) { to[k] = -2; strays++; }
        if (!strays) return;
        for (let p = 0; p < W * H; p++) {
            const k = comp[p];
            if (k < 0 || to[k] !== -2) continue;
            around(p, (q) => {
                const m = comp[q];
                if (m < 0 || m === k) return;
                const key = k * 2 + (best.get(label[m]) === m ? 0 : 1), b = border.get(key) ?? new Map();
                b.set(label[m], (b.get(label[m]) ?? 0) + 1); border.set(key, b);
            });
        }
        const added = new Map();
        for (let k = 0; k < label.length; k++) {
            if (to[k] !== -2) continue;
            const b = border.get(2 * k) ?? border.get(2 * k + 1);
            let y = -1, most = 0;
            if (b) for (const [u, c] of b) if (c > most) { most = c; y = u; }
            to[k] = y >= 0 ? y : fresh++;
            if (y < 0) added.set(to[k], k);
        }
        for (let p = 0; p < W * H; p++) { const k = comp[p]; if (k >= 0 && to[k] >= 0) G[p] = to[k]; }
        // (a new valley's cells: those its pixels are nearest)
        for (const [u, k] of added) {
            const cells = new Set();
            for (let p = 0; p < W * H; p++) if (comp[p] === k) cells.add(pc[p]);
            V.cells.set(u, Int32Array.from(cells));
        }
    }
}
