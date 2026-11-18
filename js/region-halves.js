// River-cell halves (fork addition, for region-basin.js): which valley each side of a river cell's line belongs to, so
// a bank's valley reaches the river while every valley stays one piece on the map. A river cell is a Voronoi cell cut
// by its river's line (region-bank.js bankAt) in two halves; which half touches which neighbour is measured on the
// cells' shared edges (region-mesh.js), not guessed from the neighbours' centres: at a bend or a confluence the edge
// two river cells share can lie wholly on one side of the line.

import { bankAt } from './region-bank.js';
import { edgeSpan } from './region-mesh.js';

const K = 12;                 // (samples along a shared edge)
const MIN_TOUCH = 0.4;        // (of the two centres' distance: a contact shorter is a corner, not a link)

/**
 * `half`, 2 per cell (left, right; a head's both the same; −1 off the rivers): each river cell's halves given to a
 * valley. A half goes to the valley that most of the land along it is in, but never when the cell's own valley
 * (`unit`) would come apart without it: a valley that crosses a stream holds the stream's cells, and their halves may
 * be its only link from one bank to the other. mesh: the true neighbours (region-mesh.js edgeMesh); full: w.tMesh.
 */
export function halves(mesh, full, unit, { wall, recv, main, np }) {
    const { adjOffset, adjList, numCells: n } = mesh, half = new Int32Array(2 * n).fill(-1);
    for (let r = 0; r < n; r++) if (wall[r]) half[2 * r] = half[2 * r + 1] = unit[r];
    // (the graph: land cell c is node c, half b of river cell r node n + 2r + b − 1; links between land cells are the
    // mesh's, the rest measured)
    const link = contacts(mesh, full, unit, wall, recv, main, np), unitOf = (k) => (k < n ? unit[k] : half[k - n]);
    const nbrs = (k, fn) => {
        if (k < n) for (let e = adjOffset[k]; e < adjOffset[k + 1]; e++) { const d = adjList[e]; if (!wall[d] && unit[d] >= 0) fn(d); }
        const l = link.get(k);
        if (l) for (let i = 0; i < l.length; i += 2) fn(l[i]);
    };
    // (would valley x come apart without node k? its neighbours in x must still reach each other)
    const seen = new Int32Array(3 * n), stack = [];
    let stamp = 0;
    const cuts = (k, x) => {
        const ends = [];
        nbrs(k, (j) => { if (unitOf(j) === x && !ends.includes(j)) ends.push(j); });
        if (ends.length < 2) return false;
        stamp++; seen[k] = stamp; seen[ends[0]] = stamp; stack.push(ends[0]);
        let left = ends.length - 1;
        while (stack.length && left) {
            nbrs(stack.pop(), (j) => {
                if (seen[j] === stamp || unitOf(j) !== x) return;
                seen[j] = stamp; stack.push(j);
                if (ends.includes(j)) left--;
            });
        }
        stack.length = 0;
        return left > 0;
    };
    const votes = new Map();
    for (let r = 0; r < n; r++) {
        if (!wall[r] || !np[r]) continue;
        for (let b = 0; b < 2; b++) {
            const k = n + 2 * r + b, l = link.get(k) ?? [];
            votes.clear();
            for (let i = 0; i < l.length; i += 2) if (l[i] < n) votes.set(unit[l[i]], (votes.get(unit[l[i]]) ?? 0) + l[i + 1]);
            let y = -1, most = 0;
            for (const [u, w] of votes) if (w > most) { most = w; y = u; }
            const x = half[k - n];
            if (y >= 0 && y !== x && !cuts(k, x)) half[k - n] = y;
        }
    }
    return half;
}

/**
 * The measured links of the river cells' halves: Map(node → [node, length, …]), both ways. Each river cell's own two
 * halves always touch (its line runs through it).
 */
export function contacts(mesh, full, unit, wall, recv, main, np) {
    const { adjOffset, adjList, xyz, numCells: n } = mesh, link = new Map(), tally = new Map();
    const add = (a, b, w) => { (link.get(a) ?? link.set(a, []).get(a)).push(b, w); (link.get(b) ?? link.set(b, []).get(b)).push(a, w); };
    const side = (r, x, y, z) => (np[r] && bankAt(xyz, recv, main, np, r, x, y, z) === 2 ? 1 : 0);
    for (let r = 0; r < n; r++) {
        if (!wall[r]) continue;
        if (np[r]) add(n + 2 * r, n + 2 * r + 1, Infinity);
        for (let e = adjOffset[r]; e < adjOffset[r + 1]; e++) {
            const d = adjList[e];
            if (unit[d] < 0 || (wall[d] && d < r)) continue;
            const s = edgeSpan(full, r, d);
            if (!s) continue;
            // (each sample of the edge: which half of r, and of d if a river cell, it lies in)
            tally.clear();
            const step = (s.hi - s.lo) / K;
            for (let i = 0; i < K; i++) {
                const t = s.lo + (i + 0.5) * step;
                let x = s.mx + t * s.tx, y = s.my + t * s.ty, z = s.mz + t * s.tz;
                const l = Math.hypot(x, y, z);
                x /= l; y /= l; z /= l;
                const key = 4 * side(r, x, y, z) + (wall[d] ? side(d, x, y, z) : 3);
                tally.set(key, (tally.get(key) ?? 0) + step);
            }
            for (const [key, len] of tally) {
                if (len < MIN_TOUCH * s.dist) continue;
                const a = n + 2 * r + (key >> 2), j = key & 3;
                add(a, j === 3 ? d : n + 2 * d + j, len);
            }
        }
    }
    return link;
}
