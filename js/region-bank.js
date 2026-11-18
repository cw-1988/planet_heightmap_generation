// River banks (fork addition, for the valleys: region-basin.js, region-join.js, region-overlay.js, region-pick.js). A
// river runs through its cells' centres (finish-hydro.js traces it so, and the map draws it so), so a river cell is half
// on each bank: which side a place lies on is read off the river's line through that cell, not off the cell.

export const RIVER_Q0 = 40;                      // (m³/s: the thinnest river the map draws at its default density)

/**
 * Which bank of the river at cell `r` the point (px, py, pz) lies on: 1 left, 2 right (looking downstream), 0 at a head
 * (`np[r]` 0: no river comes in, the land round it is one). Round r, the line in (from `main[r]`, its main stem) and out
 * (to its receiver) split the plane in two arcs: the left one sweeps counter-clockwise from downstream to upstream. (A
 * straight line through r misreads a bend: the inside of the bend would come out on both sides.)
 */
export function bankAt(xyz, recv, main, np, r, px, py, pz) {
    if (np[r] === 0 || main[r] < 0) return 0;
    const ox = xyz[3 * r], oy = xyz[3 * r + 1], oz = xyz[3 * r + 2], d = recv[r], u = main[r];
    // (a point's direction in the tangent plane at r)
    const rel = (x, y, z) => { const k = x * ox + y * oy + z * oz; return [x - k * ox, y - k * oy, z - k * oz]; };
    let e1 = d >= 0 ? rel(xyz[3 * d], xyz[3 * d + 1], xyz[3 * d + 2]) : rel(xyz[3 * u], xyz[3 * u + 1], xyz[3 * u + 2]).map((x) => -x);
    const l = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    e1 = [e1[0] / l, e1[1] / l, e1[2] / l];
    const e2 = [oy * e1[2] - oz * e1[1], oz * e1[0] - ox * e1[2], ox * e1[1] - oy * e1[0]];
    const angle = (v) => { const t = Math.atan2(v[0] * e2[0] + v[1] * e2[1] + v[2] * e2[2], v[0] * e1[0] + v[1] * e1[1] + v[2] * e1[2]); return t < 0 ? t + 2 * Math.PI : t; };
    return angle(rel(px, py, pz)) < angle(rel(xyz[3 * u], xyz[3 * u + 1], xyz[3 * u + 2])) ? 1 : 2;
}

/**
 * The valley at a point (px, py, pz) whose nearest cell is `c` (valleysOf's `V`): a land cell's own; on a river cell,
 * the valley of the nearest land cell on the point's side of the line (so each valley along the bank reaches the river),
 * else that side's valley, else the river cell's own.
 */
export function unitAt(V, mesh, c, px, py, pz) {
    const u = V.unit[c];
    if (!V.wall[c]) return u;
    const b = bankAt(mesh.xyz, V.recv, V.main, V.np, c, px, py, pz);
    if (!b) return u;
    const { adjOffset, adjList, xyz } = mesh;
    let best = -1, near = -2;
    for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
        if (V.nbSide[e] !== b) continue;
        const d = adjList[e], k = px * xyz[3 * d] + py * xyz[3 * d + 1] + pz * xyz[3 * d + 2];
        if (k > near) { near = k; best = V.unit[d]; }
    }
    return best >= 0 ? best : V.bankUnit[2 * c + b - 1] >= 0 ? V.bankUnit[2 * c + b - 1] : u;
}
