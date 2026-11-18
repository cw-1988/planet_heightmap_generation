// Dev check (not shipped): is every valley of the region pick one piece, as the map shows it? Each pixel of a W × W/2
// grid is the map the overlay draws and the pick reads (region-grid.js; raw: off the cells, region-bank.js unitAt,
// before the map's repair); a valley drawn in two or more patches (4-connected, wrapping east–west) is a fault. Also
// checks the mesh: each valley's cells one patch. In the page: await (await
// import('/tuning/region-check.js')).onePiece(regionChosen) → { valleys, split, strayPx, meshSplit, worst }; drawnPieces
// the same on the map as drawn, 3 × finer, the edge rivers' lines included; lineSides whether the edge is the line.

import { unitAt } from '../js/region-bank.js';
import { edgeMesh } from '../js/region-mesh.js';
import { valleyGrid, W, H } from '../js/region-grid.js';
import { readAt } from '../js/region-lines.js';

export async function onePiece(C, raw = false) {
    const { world, V } = C, mesh = world.tMesh, U = new Int32Array(W * H);
    if (raw) {
        for (let j = 0; j < H; j++) {
            const lat = Math.PI / 2 - (j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
            for (let i = 0; i < W; i++) {
                const lon = (i + 0.5) / W * 2 * Math.PI - Math.PI, x = cl * Math.cos(lon), y = cl * Math.sin(lon);
                U[j * W + i] = unitAt(V, mesh, mesh.index.nearest(x, y, sl), x, y, sl);
            }
        }
    } else U.set(await valleyGrid(world, V));
    const per = patches(U.length, (p) => U[p], (p, fn) => {
        const i = p % W, j = (p - i) / W;
        fn(j * W + (i + 1) % W); fn(j * W + (i + W - 1) % W);
        if (j > 0) fn(p - W);
        if (j < H - 1) fn(p + W);
    });
    let split = 0, strayPx = 0;
    const worst = [];
    for (const [u, l] of per) {
        if (l.length < 2) continue;
        l.sort((a, b) => b - a); split++;
        const stray = l.slice(1).reduce((a, b) => a + b, 0);
        strayPx += stray; worst.push({ u, parts: l.slice(0, 4) });
    }
    worst.sort((a, b) => b.parts[1] - a.parts[1]);
    const { adjOffset, adjList } = edgeMesh(world);
    const cells = patches(V.unit.length, (c) => V.unit[c], (c, fn) => { for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) fn(adjList[e]); });
    let meshSplit = 0;
    for (const l of cells.values()) if (l.length > 1) meshSplit++;
    return { valleys: per.size, split, strayPx, meshSplit, worst: worst.slice(0, 6) };
}

/**
 * Every valley one piece as drawn, finer than the grid: the map read at F × F places a texel (region-lines.js readAt,
 * the shader's own reading, edge rivers' lines included) → { valleys, split, strays, worst: [{ u, size, x, y }] } (size
 * in fine places, x and y in grid px from the west and the south).
 */
export async function drawnPieces(C, F = 3) {
    const G = await valleyGrid(C.world, C.V), Ls = C.V.lines, FW = W * F, FH = H * F, lab = new Int32Array(FW * FH);
    for (let J = 0; J < FH; J++) for (let I = 0; I < FW; I++) lab[J * FW + I] = readAt(G, Ls, W, H, (I + 0.5) / F - 0.5, (J + 0.5) / F - 0.5);
    const seen = new Uint8Array(FW * FH), per = new Map(), stack = [];
    for (let s = 0; s < FW * FH; s++) {
        const u = lab[s];
        if (u < 0 || seen[s]) continue;
        let size = 0, sx = 0, sy = 0;
        seen[s] = 1; stack.push(s);
        while (stack.length) {
            const p = stack.pop(), i = p % FW, j = (p - i) / FW;
            size++; sx += i; sy += j;
            for (const q of [j * FW + (i + 1) % FW, j * FW + (i + FW - 1) % FW, j > 0 ? p - FW : -1, j < FH - 1 ? p + FW : -1]) {
                if (q >= 0 && !seen[q] && lab[q] === u) { seen[q] = 1; stack.push(q); }
            }
        }
        (per.get(u) ?? per.set(u, []).get(u)).push({ u, size, x: +((sx / size + 0.5) / F).toFixed(1), y: +((sy / size + 0.5) / F).toFixed(1) });
    }
    const worst = [];
    let split = 0;
    for (const l of per.values()) if (l.length > 1) { split++; l.sort((a, b) => b.size - a.size); worst.push(...l.slice(1)); }
    worst.sort((a, b) => b.size - a.size);
    return { valleys: per.size, split, strays: worst.length, worst: worst.slice(0, 8) };
}

/**
 * Whether the edge is the river's drawn line: per edge segment, the valleys read d px either side of its middle
 * (readAt) → { segments, split: the share with two different valleys }. Where both sides are one valley the river is not
 * that valley's edge there (a tip, or a stub inside one valley).
 */
export async function lineSides(C, d = 0.05) {
    const G = await valleyGrid(C.world, C.V), L = C.V._edgeLines, S = L.seg, n = S.length / 4;
    let split = 0;
    for (let k = 0; k < n; k++) {
        const dx = S[4 * k + 2] - S[4 * k], dy = S[4 * k + 3] - S[4 * k + 1], l = Math.hypot(dx, dy) || 1;
        const x = (S[4 * k] + S[4 * k + 2]) / 2 - 0.5, y = (S[4 * k + 1] + S[4 * k + 3]) / 2 - 0.5, ox = -dy / l * d, oy = dx / l * d;
        if (readAt(G, C.V.lines, W, H, x + ox, y + oy) !== readAt(G, C.V.lines, W, H, x - ox, y - oy)) split++;
    }
    return { segments: n, split: +(split / n).toFixed(3) };
}

/** Per label (≥ 0), the sizes of its connected patches: Map(label → [size…]). */
function patches(n, label, nbrs) {
    const seen = new Uint8Array(n), out = new Map(), stack = [];
    for (let s = 0; s < n; s++) {
        const u = label(s);
        if (u < 0 || seen[s]) continue;
        let size = 0;
        seen[s] = 1; stack.push(s);
        while (stack.length) {
            size++;
            nbrs(stack.pop(), (q) => { if (!seen[q] && label(q) === u) { seen[q] = 1; stack.push(q); } });
        }
        (out.get(u) ?? out.set(u, []).get(u)).push(size);
    }
    return out;
}
