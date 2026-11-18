// The edge rivers as lines on the valleys' map (fork addition, for region-grid.js). The map draws a river as a line
// through its cells' centres, smoothed (finish-view.js riverSegments: Chaikin twice, each stretch from a head or a
// confluence), and a valley built of cells can't follow such a line: a cell is on both banks of it, and 4 in 10 of the
// planet's river steps go corner to corner, past two land cells that meet across the river. So the valleys' map has the
// edge rivers drawn into it, the same lines, as walls: a valley's pixels never reach across one.

/**
 * A wall mask (1 on an edge river's line) for a W × H grid (rows from the south), of the rivers draining V.edgeKm2 or
 * more (V: region-basin.js valleysOf), drawn 4-connected so no diagonal step slips through. Kept on V.
 */
export function wallMask(w, V, W, H) {
    if (V._walls?.length === W * H) return V._walls;
    const { xyz } = w.tMesh, { recv } = w.fin.drain, n = V.unit.length, M = new Uint8Array(W * H);
    const edge = (c) => V.wall[c] && V.qe[c] >= V.edgeKm2;
    const up = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (edge(c) && recv[c] >= 0 && edge(recv[c])) up[recv[c]] = Math.min(255, up[recv[c]] + 1);
    const at = (c) => [(Math.atan2(xyz[3 * c + 1], xyz[3 * c]) / Math.PI + 1) / 2 * W, (Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) / Math.PI + 0.5) * H];
    for (let s = 0; s < n; s++) {
        if (!edge(s) || up[s] === 1) continue;                                       // (a head or a confluence: a stretch starts)
        const pts = [at(s)];
        for (let c = s, guard = 0; guard < n; guard++) {
            const r = recv[c];
            if (r < 0) break;
            pts.push(at(r));
            if (!edge(r) || up[r] !== 1) break;
            c = r;
        }
        // (split where it crosses the map's edge, then smoothed as the map smooths it)
        let part = [pts[0]];
        for (let i = 1; i <= pts.length; i++) {
            if (i < pts.length && Math.abs(pts[i][0] - pts[i - 1][0]) < W / 2) { part.push(pts[i]); continue; }
            draw(M, W, H, chaikin(chaikin(part)));
            if (i < pts.length) part = [pts[i]];
        }
    }
    return (V._walls = M);
}

function chaikin(p) {
    if (p.length < 3) return p;
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    out.push(p[p.length - 1]);
    return out;
}

/** A polyline into M, every pixel it passes through, each step to an edge neighbour. */
function draw(M, W, H, p) {
    let pi = -1, pj = -1;
    const put = (i, j) => { if (j >= 0 && j < H) M[j * W + ((i % W) + W) % W] = 1; };
    for (let k = 0; k < p.length - 1; k++) {
        const [x0, y0] = p[k], [x1, y1] = p[k + 1], steps = Math.max(1, Math.ceil(4 * Math.hypot(x1 - x0, y1 - y0)));
        for (let t = 0; t <= steps; t++) {
            const i = Math.floor(x0 + (x1 - x0) * t / steps), j = Math.floor(y0 + (y1 - y0) * t / steps);
            if (i === pi && j === pj) continue;
            if (pi >= 0 && i !== pi && j !== pj) put(i, pj);                       // (a diagonal step closed)
            put(i, j); pi = i; pj = j;
        }
    }
}
