// The mesh's true neighbours (fork addition, for the valleys: region-basin.js, region-halves.js). The terrain mesh lists
// six neighbours a cell, but about a quarter of those pairs share no edge on the map (the short diagonal of a
// near-square: the two meet at a corner, or a third cell owns the point between them). A valley joined over such a pair
// is drawn in two pieces, so the valleys use only the pairs whose shared edge is at least MIN_EDGE of their distance.

const MIN_EDGE = 0.4;

/** w.tMesh with only its true neighbours (adjOffset, adjList); the rest as is. Kept on the world. */
export function edgeMesh(w) {
    if (w._edgeMesh) return w._edgeMesh;
    const mesh = w.tMesh, { adjOffset, adjList, xyz, numCells: n } = mesh, keep = new Uint8Array(adjList.length);
    const pair = new Map();                                     // (c·n + d, c < d → kept?)
    for (let c = 0; c < n; c++) {
        for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
            const d = adjList[e], key = Math.min(c, d) * n + Math.max(c, d);
            let k = pair.get(key);
            if (k === undefined) {
                const s = edgeSpan(mesh, c, d);
                k = s && s.hi - s.lo >= MIN_EDGE * s.dist;
                pair.set(key, k);
            }
            keep[e] = k ? 1 : 0;
        }
    }
    // (both ways, even where only one of the two lists the other)
    const lists = Array.from({ length: n }, () => []);
    for (let c = 0; c < n; c++) for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
        const d = adjList[e];
        if (keep[e] && !lists[c].includes(d)) { lists[c].push(d); lists[d].push(c); }
    }
    const off = new Int32Array(n + 1);
    for (let c = 0; c < n; c++) off[c + 1] = off[c] + lists[c].length;
    const list = new Int32Array(off[n]);
    for (let c = 0; c < n; c++) list.set(lists[c], off[c]);
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
