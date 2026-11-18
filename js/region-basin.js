// Valleys (fork addition): the planet's land cut along its natural borders, for the region pick (region-pick.js). From
// the finish's drainage (world.fin.drain: where each cell's water goes, the land it drains, the sea) at a valley size S:
// the rivers are the cells draining at least S km², cut into stretches at each confluence and every ~2√S km; each land
// cell belongs to the stretch its water first reaches, on the bank it comes in from (the land above a river's head is
// its own valley). So a valley is bounded by divides (ridges), by rivers and by the coast. Land whose water reaches the
// sea or a closed basin before any such river is grouped in pieces of about S km² along the coast or round the basin.

/** A unit per mesh cell (−1 the sea) and each unit's cells, for valley size `sizeKm2`. Kept on the world per size. */
export function valleysOf(w, sizeKm2) {
    const memo = (w._valleys ??= new Map());
    if (memo.has(sizeKm2)) return memo.get(sizeKm2);
    // (at least a dozen cells: fewer and its edge is the mesh's, not the land's)
    const v = cut(w.tMesh, w.fin.drain, Math.max(sizeKm2, 12 * w.tMesh.cellAreaKm2));
    memo.set(sizeKm2, v);
    return v;
}

function cut(mesh, drain, S) {
    const { numCells: n, xyz, adjOffset, adjList, edgeKm, cellAreaKm2 } = mesh, { recv, area, sea } = drain;
    // the order upstream-first (each cell after all that drain into it)
    const up = new Int32Array(n), order = new Int32Array(n);
    for (let c = 0; c < n; c++) if (recv[c] >= 0) up[recv[c]]++;
    let a = 0, b = 0;
    for (let c = 0; c < n; c++) if (!up[c]) order[b++] = c;
    while (a < b) { const r = recv[order[a++]]; if (r >= 0 && --up[r] === 0) order[b++] = r; }
    // the rivers' stretches: a new one at a head, a confluence, or past the length cap
    const river = (c) => !sea[c] && area[c] >= S, np = new Uint8Array(n), par = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r)) { np[r] = Math.min(255, np[r] + 1); par[r] = c; } }
    const seg = new Int32Array(n).fill(-1), len = new Float32Array(n), lMax = 2 * Math.sqrt(S);
    let segs = 0;
    for (let k = 0; k < b; k++) {
        const c = order[k];
        if (!river(c)) continue;
        if (np[c] === 1 && len[par[c]] < lMax) { seg[c] = seg[par[c]]; len[c] = len[par[c]] + edgeKm; } else seg[c] = segs++;
    }
    // each cell: the stretch its water reaches and the bank (0 above a head, 1 left, 2 right); downstream-first
    const unit = new Int32Array(n).fill(-1);
    for (let k = b - 1; k >= 0; k--) {
        const c = order[k], r = recv[c];
        if (sea[c]) continue;
        if (river(c)) { unit[c] = 3 * seg[c] + (np[c] === 0 ? 0 : 1); continue; }
        if (r < 0 || sea[r]) continue;                                       // (left for the coast's and the basins' pieces)
        unit[c] = river(r) ? 3 * seg[r] + bank(xyz, recv, par, np, r, c) : unit[r];
    }
    // the rest of the land: in pieces of about S km² over the mesh
    let next = 3 * segs;
    const q = new Int32Array(n), cap = Math.max(1, Math.round(S / cellAreaKm2));
    for (let s = 0; s < n; s++) {
        if (sea[s] || unit[s] >= 0) continue;
        const id = next++;
        let qa = 0, qb = 0;
        q[qb++] = s; unit[s] = id;
        while (qa < qb && qb < cap) {
            const c = q[qa++];
            for (let e = adjOffset[c]; e < adjOffset[c + 1] && qb < cap; e++) { const d = adjList[e]; if (!sea[d] && unit[d] < 0) { unit[d] = id; q[qb++] = d; } }
        }
    }
    mergeSmall(unit, next, adjOffset, adjList, Math.max(4, Math.round(S / cellAreaKm2 / 3)));
    // each unit's cells
    const count = new Int32Array(next);
    for (let c = 0; c < n; c++) if (unit[c] >= 0) count[unit[c]]++;
    const cells = new Map();
    for (let u = 0; u < next; u++) if (count[u]) cells.set(u, new Int32Array(count[u]));
    count.fill(0);
    for (let c = 0; c < n; c++) { const u = unit[c]; if (u >= 0) cells.get(u)[count[u]++] = c; }
    return { unit, cells, sizeKm2: S };
}

/**
 * Units under `min` cells (a short stretch's bank, a sliver between two confluences) go into the neighbour they share
 * the longest border with, smallest first, over a few passes; `unit` is relabelled in place.
 */
function mergeSmall(unit, units, adjOffset, adjList, min) {
    const root = new Int32Array(units).map((_, i) => i), find = (u) => { while (root[u] !== u) u = root[u] = root[root[u]]; return u; };
    const n = unit.length, size = new Int32Array(units);
    for (let pass = 0; pass < 4; pass++) {
        size.fill(0);
        for (let c = 0; c < n; c++) if (unit[c] >= 0) size[find(unit[c])]++;
        const shared = new Map();                                           // small unit → Map(neighbour → edges)
        for (let c = 0; c < n; c++) {
            if (unit[c] < 0) continue;
            const u = find(unit[c]);
            if (size[u] >= min) continue;
            let m = shared.get(u);
            if (!m) shared.set(u, m = new Map());
            for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
                const d = adjList[e];
                if (unit[d] < 0) continue;
                const v = find(unit[d]);
                if (v !== u) m.set(v, (m.get(v) ?? 0) + 1);
            }
        }
        if (!shared.size) break;
        for (const u of [...shared.keys()].sort((a, b) => size[a] - size[b])) {
            let best = -1, most = 0;
            for (const [v, k] of shared.get(u)) if (k > most) { most = k; best = v; }
            const a = find(u), t = best >= 0 ? find(best) : a;
            if (t !== a) { root[a] = t; size[t] += size[a]; }
        }
    }
    for (let c = 0; c < n; c++) if (unit[c] >= 0) unit[c] = find(unit[c]);
}

/** Which bank of the river at `r` the water from `c` comes in on: 1 left, 2 right (looking downstream); 0 at a head. */
function bank(xyz, recv, par, np, r, c) {
    if (np[r] === 0) return 0;
    const d = recv[r] >= 0 ? recv[r] : -1, f = d >= 0 ? r : par[r], t = d >= 0 ? d : r;
    const dx = xyz[3 * t] - xyz[3 * f], dy = xyz[3 * t + 1] - xyz[3 * f + 1], dz = xyz[3 * t + 2] - xyz[3 * f + 2];
    const vx = xyz[3 * c] - xyz[3 * r], vy = xyz[3 * c + 1] - xyz[3 * r + 1], vz = xyz[3 * c + 2] - xyz[3 * r + 2];
    const cx = dy * vz - dz * vy, cy = dz * vx - dx * vz, cz = dx * vy - dy * vx;
    return cx * xyz[3 * r] + cy * xyz[3 * r + 1] + cz * xyz[3 * r + 2] > 0 ? 1 : 2;
}
