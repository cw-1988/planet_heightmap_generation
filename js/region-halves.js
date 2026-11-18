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
    const link = contacts(mesh, full, unit, wall, recv, main, np), votes = new Map();
    // (each half's land vote: the valley most of the land along it is in, −1 if none)
    const want = new Int32Array(2 * n).fill(-1);
    for (let r = 0; r < n; r++) {
        if (!wall[r] || !np[r]) continue;
        for (let b = 0; b < 2; b++) {
            const l = link.get(n + 2 * r + b) ?? [];
            votes.clear();
            for (let i = 0; i < l.length; i += 2) if (l[i] < n) votes.set(unit[l[i]], (votes.get(unit[l[i]]) ?? 0) + l[i + 1]);
            // (no land edge long enough along it, the half pinched at a bend: the land whose centre is on its side)
            if (!votes.size) for (let e = adjOffset[r]; e < adjOffset[r + 1]; e++) {
                const d = adjList[e];
                if (wall[d] || unit[d] < 0 || bankAt(mesh.xyz, recv, main, np, r, mesh.xyz[3 * d], mesh.xyz[3 * d + 1], mesh.xyz[3 * d + 2]) !== b + 1) continue;
                votes.set(unit[d], (votes.get(unit[d]) ?? 0) + 1);
            }
            let most = 0;
            for (const [u, w] of votes) if (u >= 0 && w > most) { most = w; want[2 * r + b] = u; }
        }
    }
    // (a half with no land along it, between two rivers or at a confluence, takes its target from the nearest halves of
    // other river cells that have one: else it kept the near bank's valley, and that valley reached across the river)
    const queue = [];
    for (let h = 0; h < 2 * n; h++) if (want[h] >= 0) queue.push(h);
    for (let q = 0; q < queue.length; q++) {
        const h = queue[q], l = link.get(n + h) ?? [];
        for (let i = 0; i < l.length; i += 2) {
            const j = l[i] - n;
            if (j >= 0 && j >> 1 !== h >> 1 && want[j] < 0 && np[j >> 1]) { want[j] = want[h]; queue.push(j); }
        }
    }
    // (a half bound elsewhere counts as gone already: else a row of far halves along a river held one another for the
    // near bank's valley, each one a link the next one's valley "needed")
    const unitOf = (k) => (k < n ? unit[k] : want[k - n] >= 0 && want[k - n] !== half[k - n] ? -2 : half[k - n]);
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
    // (each half to its target unless its valley would come apart; again while any moves, as one move can free another)
    for (let pass = 0; pass < 6; pass++) {
        let changed = 0;
        for (let h = 0; h < 2 * n; h++) {
            const y = want[h], x = half[h];
            if (y >= 0 && y !== x && np[h >> 1] && !cuts(n + h, x)) { half[h] = y; changed++; }
        }
        if (!changed) break;
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
