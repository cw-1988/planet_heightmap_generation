// The mesh's true neighbours (fork addition, for the valleys: region-basin.js, region-halves.js). The terrain mesh lists
// six neighbours a cell, but about a quarter of those pairs share no edge on the map (the short diagonal of a
// near-square: the two meet at a corner, or a third cell owns the point between them). A valley joined over such a pair
// is drawn in two pieces, so the valleys use only the pairs whose shared edge is at least MIN_EDGE of their distance.

const MIN_EDGE = 0.4;

/** w.tMesh with only its true neighbours (adjOffset, adjList); the rest as is. Kept on the world. */
export function edgeMesh(w) {
    if (w._edgeMesh) return w._edgeMesh;
    const mesh = w.tMesh, { adjOffset, adjList, numCells: n } = mesh, m = adjList.length;
    // Typed arrays only, no Map or per-cell arrays: at 10M cells the mesh has ~60M listed pairs, past a Map's ~16.7M.
    // Each pair {c, d} is judged once, the first time the loop meets it (c's list, or d's list when d < c lists c), and
    // every listing of it takes that verdict. first: the listing where the pair is met first, the one that joins it.
    const find = (a, b, end) => { for (let e = adjOffset[a]; e < end; e++) if (adjList[e] === b) return e; return -1; };
    const keep = new Uint8Array(m), first = new Uint8Array(m), count = new Int32Array(n);
    for (let c = 0; c < n; c++) {
        for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
            const d = adjList[e];
            let f = find(c, d, e);                              // (c lists d twice: the earlier)
            if (f < 0 && d < c) f = find(d, c, adjOffset[d + 1]);
            if (f >= 0) { keep[e] = keep[f]; continue; }
            const s = edgeSpan(mesh, c, d);
            keep[e] = s && s.hi - s.lo >= MIN_EDGE * s.dist ? 1 : 0;
            if (keep[e]) { first[e] = 1; count[c]++; count[d]++; }
        }
    }
    // (both ways, even where only one of the two lists the other; each list in the order the loop joins them)
    const off = new Int32Array(n + 1);
    for (let c = 0; c < n; c++) off[c + 1] = off[c] + count[c];
    const list = new Int32Array(off[n]), at = off.slice(0, n);
    for (let c = 0; c < n; c++) for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
        if (!first[e]) continue;
        const d = adjList[e];
        list[at[c]++] = d; list[at[d]++] = c;
    }
    return (w._edgeMesh = { ...mesh, adjOffset: off, adjList: list });
}

/**
 * The edge cells c and d share on the map (`mesh` with all its listed neighbours): the points p(s) = m + s·t (m their
 * midpoint, t along c × d, s in [lo, hi]) no other cell near either is nearer; null if none. dist: their chord, in the
 * same units as s.
 */
export function edgeSpan(mesh, c, d) {
    const { adjOffset, adjList, xyz } = mesh;
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2], dx = xyz[3 * d], dy = xyz[3 * d + 1], dz = xyz[3 * d + 2];
    let mx = cx + dx, my = cy + dy, mz = cz + dz, tx = cy * dz - cz * dy, ty = cz * dx - cx * dz, tz = cx * dy - cy * dx;
    const ml = Math.hypot(mx, my, mz), tl = Math.hypot(tx, ty, tz);
    mx /= ml; my /= ml; mz /= ml; tx /= tl; ty /= tl; tz /= tl;
    let lo = -Infinity, hi = Infinity;
    // (each other cell k: p no nearer k than c, i.e. (m + s·t)·(c − k) ≥ 0)
    const clip = (k) => {
        if (k === c || k === d) return;
        const ex = cx - xyz[3 * k], ey = cy - xyz[3 * k + 1], ez = cz - xyz[3 * k + 2];
        const a = mx * ex + my * ey + mz * ez, b = tx * ex + ty * ey + tz * ez;
        if (b > 0) lo = Math.max(lo, -a / b); else if (b < 0) hi = Math.min(hi, -a / b); else if (a < 0) hi = -Infinity;
    };
    for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) clip(adjList[e]);
    for (let e = adjOffset[d]; e < adjOffset[d + 1]; e++) clip(adjList[e]);
    if (!(hi > lo) || !isFinite(hi - lo)) return null;
    return { lo, hi, mx, my, mz, tx, ty, tz, dist: Math.hypot(cx - dx, cy - dy, cz - dz) };
}
