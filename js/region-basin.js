// Valleys (fork addition): the planet's land cut along its natural borders, for the region pick (region-pick.js). From
// the finish's drainage (world.fin.drain: where each cell's water goes, the land it drains, the sea): the thick rivers
// are the cells draining at least RIVER_KM2, cut into stretches at each confluence and every ~2√RIVER_KM2 km; each land
// cell belongs to the stretch its water first reaches, on the bank it comes in from (the land above a river's head is
// its own piece). Land whose water reaches the sea or a closed basin before any thick river is grouped in pieces of
// about that size. Those pieces then grow to the valley size chosen by joining across divides only: a thick river is a
// wall like a ridge, so each side of it can be chosen on its own at any size. A valley is bounded by ridges, by thick
// rivers and by the coast.

const RIVER_KM2 = 30000;                                                    // (a thick river: the Meuse, the Elbe's upper reach)

/** A unit per mesh cell (−1 the sea) and each unit's cells, for valley size `sizeKm2`. Kept on the world per size. */
export function valleysOf(w, sizeKm2) {
    const memo = (w._valleys ??= new Map());
    if (memo.has(sizeKm2)) return memo.get(sizeKm2);
    // (the pieces at least a dozen cells: fewer and their edge is the mesh's, not the land's)
    const a = w.tMesh.cellAreaKm2, river = Math.max(12 * a, Math.min(sizeKm2, RIVER_KM2));
    const v = cut(w.tMesh, w.fin.drain, river, Math.max(sizeKm2, river));
    memo.set(sizeKm2, v);
    return v;
}

/** The pieces for thick rivers from S km², grown across divides to about `size` km². */
function cut(mesh, drain, S, size) {
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
    // (and each river's line, its main stem followed up through the confluences by the larger water: its left and right
    // stay apart, so a valley never holds both banks of one river, not even round its head)
    const main = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r) && (main[r] < 0 || area[c] > area[main[r]])) main[r] = c; }
    const seg = new Int32Array(n).fill(-1), len = new Float32Array(n), lMax = 2 * Math.sqrt(S), line = new Int32Array(n), segLine = [];
    let segs = 0, lines = 0;
    for (let k = 0; k < b; k++) {
        const c = order[k];
        if (!river(c)) continue;
        line[c] = main[c] >= 0 ? line[main[c]] : lines++;
        if (np[c] === 1 && len[par[c]] < lMax) { seg[c] = seg[par[c]]; len[c] = len[par[c]] + edgeKm; } else { seg[c] = segs++; segLine.push(line[c]); }
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
    // (what keeps the joins on one side: the river cells a border may not run through, each bank's river side)
    const wall = new Uint8Array(n), side = new Int32Array(next).fill(-1);
    for (let c = 0; c < n; c++) if (river(c)) wall[c] = 1;
    for (let u = 0; u < 3 * segs; u++) if (u % 3) side[u] = 2 * segLine[(u / 3) | 0] + (u % 3) - 1;
    join(unit, next, adjOffset, adjList, wall, side, Math.max(4, Math.round(S / cellAreaKm2 / 3)), Math.round(size / cellAreaKm2));
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
 * The pieces joined, smallest first, each into the neighbour it shares the longest border with; `unit` is relabelled in
 * place. First those under `min` cells (a short stretch's bank, a sliver between two confluences), across a divide if
 * they touch one and across a river only if not; then all under `target` cells, across divides only (a border through
 * a `wall` cell, a thick river, is never crossed) and to at most 1.6 × target. No join puts both sides of one river in
 * a piece (`side`: each piece's river side, 2 × line + 0 left / 1 right, or −1), unless a sliver has no other way.
 */
function join(unit, units, adjOffset, adjList, wall, side, min, target) {
    const root = new Int32Array(units).map((_, i) => i), find = (u) => { while (root[u] !== u) u = root[u] = root[root[u]]; return u; };
    const n = unit.length, size = new Int32Array(units), sides = Array.from(side, (s) => (s >= 0 ? new Set([s]) : null));
    const clash = (u, v) => {
        const a = sides[u], b = sides[v];
        if (!a || !b) return false;
        const [s, l] = a.size < b.size ? [a, b] : [b, a];
        for (const k of s) if (l.has(k ^ 1)) return true;
        return false;
    };
    const into = (u, t) => {
        root[u] = t; size[t] += size[u];
        if (sides[u]) { if (!sides[t]) sides[t] = sides[u]; else for (const k of sides[u]) sides[t].add(k); }
        sides[u] = null;
    };
    for (let pass = 0; pass < 12; pass++) {
        const small = pass < 3, below = small ? min : target;
        size.fill(0);
        for (let c = 0; c < n; c++) if (unit[c] >= 0) size[find(unit[c])]++;
        const shared = new Map();                                           // small unit → Map(neighbour → [open, walled] edges)
        for (let c = 0; c < n; c++) {
            if (unit[c] < 0) continue;
            const u = find(unit[c]);
            if (size[u] >= below) continue;
            let m = shared.get(u);
            if (!m) shared.set(u, m = new Map());
            for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
                const d = adjList[e];
                if (unit[d] < 0) continue;
                const v = find(unit[d]);
                if (v === u) continue;
                let k = m.get(v);
                if (!k) m.set(v, k = [0, 0]);
                k[wall[c] || wall[d] ? 1 : 0]++;
            }
        }
        let joined = 0;
        for (const u of [...shared.keys()].sort((a, b) => size[a] - size[b])) {
            if (find(u) !== u || size[u] >= below) continue;
            let best = -1, most = 0, bestW = -1, mostW = 0;
            for (const [v0, [open, walled]] of shared.get(u)) {
                const v = find(v0);
                if (v === u || (!small && size[u] + size[v] > 1.6 * target)) continue;
                const ok = !clash(u, v);
                if (ok && open > most) { most = open; best = v; }
                const score = open + walled + (ok ? 1e6 : 0);                   // (a sliver: one side of the river if it can)
                if ((ok || small) && score > mostW) { mostW = score; bestW = v; }
            }
            const t = best >= 0 ? best : small ? bestW : -1;
            if (t >= 0) { into(u, t); joined++; }
        }
        if (!joined && !small) break;
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
