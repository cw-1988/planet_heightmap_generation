// Dev check (not shipped): is every valley of the region pick one piece, as the map shows it? Each pixel of a W × W/2
// grid is the map the overlay draws and the pick reads (region-grid.js; raw: off the cells, region-bank.js unitAt,
// before the map's repair); a valley drawn in two or more patches (4-connected, wrapping east–west) is a fault. Also
// checks the mesh: each valley's cells one patch. In the page: await (await
// import('/tuning/region-check.js')).onePiece(regionChosen) → { valleys, split, strayPx, meshSplit, worst }.

import { unitAt } from '../js/region-bank.js';
import { edgeMesh } from '../js/region-mesh.js';
import { valleyGrid, W, H } from '../js/region-grid.js';

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
