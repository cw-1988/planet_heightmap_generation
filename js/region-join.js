// The valleys' joining (fork addition, for region-basin.js): the drainage pieces merged into valleys over their weakest
// borders first. A border is a divide, a river, or both, and each weighs in metres of barrier:
//   · a divide: how far it stands above the two pieces (the mean height of the cells on it less the pieces' mean
//     heights, m), so a low saddle between two plains joins early and a ridge or a range late or never;
//   · a river between them (one piece on each bank: region-bank.js): RIVER_M a tenfold of its water past RIVER_Q0, so a
//     brook is a low saddle, a 100 m³/s river a 320 m ridge, and from ~225 m³/s a border never crossed (HARD_M).
// Smaller pairs go first (SIZE_M of barrier per valley's worth of size), so the valleys come out even.

import { bankAt, RIVER_Q0 } from './region-bank.js';

const SIZE_M = 300;                                                          // (m of barrier the size of a whole valley weighs)
const RIVER_M = 800;                                                         // (m of barrier per tenfold of a river's water)
// (m: a border this high is never crossed, however small the valleys stay: a river from ~225 m³/s, a ridge 600 m over
// both sides. Without it the weakest-first joining crossed anything once the cheap borders ran out. On the test planet
// at the medium size, drawn rivers of 250–900 m³/s had a valley on both banks along 26% of their length with no ceiling,
// 2% now (the last slivers), the greater ones never; the thinner ones lie inside a valley along a third of theirs)
const HARD_M = 600;

/**
 * `unit` (a piece per cell, −1 the sea) relabelled in place to the valleys: first the slivers under `min` cells join their
 * weakest neighbour, then all pairs join weakest border first while the two are under 1.6 × `target` cells together,
 * then what is left under a quarter of `target` joins its weakest neighbour (to 2.2 × `target`), and under `min` any.
 * z: each cell's height (km), or null. riv: the rivers ({ wall, recv, main, np, qe }: region-basin.js).
 */
export function joinByBarrier(mesh, z, unit, units, riv, min, target) {
    const { adjOffset, adjList, xyz } = mesh, n = unit.length, zc = z ?? new Float32Array(n), { wall, recv, main, np, qe } = riv;
    const root = new Int32Array(units).map((_, i) => i), find = (u) => { while (root[u] !== u) u = root[u] = root[root[u]]; return u; };
    const size = new Int32Array(units), sumZ = new Float64Array(units), ver = new Int32Array(units), coast = new Uint8Array(units);
    const nb = new Array(units).fill(null);
    // (does a river at wall cell r part it from its neighbour d? not along its own line, not at a head, not on its left —
    // the river's cells are its left bank's piece)
    const across = (r, d) => wall[r] && d !== recv[r] && d !== main[r] && bankAt(xyz, recv, main, np, r, xyz[3 * d], xyz[3 * d + 1], xyz[3 * d + 2]) === 2;
    for (let c = 0; c < n; c++) {
        const u = unit[c];
        if (u < 0) continue;
        size[u]++; sumZ[u] += zc[c];
        for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) {
            const d = adjList[e], v = unit[d];
            if (v < 0) { coast[u] = 1; continue; }
            if (d <= c || v === u) continue;
            const m = (nb[u] ??= new Map());
            let rec = m.get(v);
            if (!rec) { rec = { open: 0, h: 0, cross: 0, q: 0 }; m.set(v, rec); (nb[v] ??= new Map()).set(u, rec); }
            const qx = Math.max(across(c, d) ? qe[c] : 0, across(d, c) ? qe[d] : 0);
            if (qx > 0) { rec.cross++; rec.q = Math.max(rec.q, qx); } else { rec.open++; rec.h += Math.max(zc[c], zc[d]); }
        }
    }
    const mean = (u) => sumZ[u] / size[u];
    // (a pair one river cell apart and otherwise open is open: a bank's corner, not a crossing)
    const barrier = (u, v, rec) => {
        const divide = rec.open ? 1000 * (rec.h / rec.open - (mean(u) + mean(v)) / 2) : 0;
        const river = rec.cross ? RIVER_M * Math.log10(Math.max(1, rec.q / RIVER_Q0)) : 0;
        return rec.cross >= 2 || !rec.open ? Math.max(divide, river) : divide;
    };
    const merge = (u, v) => {
        const [t, s] = (nb[u]?.size ?? 0) >= (nb[v]?.size ?? 0) ? [u, v] : [v, u], mt = (nb[t] ??= new Map());
        root[s] = t; size[t] += size[s]; sumZ[t] += sumZ[s]; coast[t] |= coast[s]; ver[t]++;
        for (const [x, rec] of nb[s] ?? []) {
            if (x === t) continue;
            const mx = nb[x], have = mt.get(x);
            mx.delete(s);
            if (have) { have.open += rec.open; have.h += rec.h; have.cross += rec.cross; have.q = Math.max(have.q, rec.q); } else { mt.set(x, rec); mx.set(t, rec); }
        }
        mt.delete(s); nb[s] = null;
        return t;
    };
    const weakest = (u, cap, hard) => {
        let best = -1, low = hard;
        for (const [v, rec] of nb[u] ?? []) {
            if (size[u] + size[v] > cap) continue;
            const k = barrier(u, v, rec);
            if (k < low) { low = k; best = v; }
        }
        return best;
    };
    const slivers = (min, cap, hard = Infinity) => {
        const order = [];
        for (let u = 0; u < units; u++) if (root[u] === u && size[u] && size[u] < min) order.push(u);
        order.sort((a, b) => size[a] - size[b]);
        for (const u0 of order) {
            const u = find(u0);
            if (size[u] >= min) continue;
            const v = weakest(u, cap, hard);
            if (v >= 0) merge(u, v);
        }
    };
    // a hole (a piece off the coast with one neighbour all round) is that neighbour's, whatever its size
    const holes = () => {
        for (let u = 0; u < units; u++) {
            if (root[u] !== u || !size[u] || coast[u] || nb[u]?.size !== 1) continue;
            merge(u, nb[u].keys().next().value);
        }
    };
    slivers(min, Infinity);
    // the pairs, weakest border (and smallest) first
    const cap = 1.6 * target, heap = new Heap();
    const offer = (u) => {
        for (const [v, rec] of nb[u] ?? []) {
            const k = barrier(u, v, rec);
            if (size[u] + size[v] > cap || k >= HARD_M) continue;
            heap.push(Math.max(0, k) + SIZE_M * (size[u] + size[v]) / target, u, v, ver[u], ver[v]);
        }
    };
    for (let u = 0; u < units; u++) if (root[u] === u && size[u]) offer(u);
    while (heap.n) {
        const [u, v, vu, vv] = heap.pop();
        if (root[u] !== u || root[v] !== v || ver[u] !== vu || ver[v] !== vv) continue;
        if (size[u] + size[v] > cap) continue;
        offer(merge(u, v));
    }
    // (the leftovers: under a quarter of a valley to their weakest neighbour; holes; the last slivers anywhere)
    slivers(Math.max(min, target / 4), 2.2 * target, HARD_M); holes(); slivers(min, Infinity); holes();
    for (let c = 0; c < n; c++) if (unit[c] >= 0) unit[c] = find(unit[c]);
}

/** A binary min-heap of (cost, u, v, ver u, ver v). */
class Heap {
    constructor() { this.k = []; this.e = []; this.n = 0; }
    push(k, u, v, vu, vv) {
        let i = this.n++;
        this.k[i] = k; this.e[i] = [u, v, vu, vv];
        while (i) {
            const p = (i - 1) >> 1;
            if (this.k[p] <= this.k[i]) break;
            this.swap(i, p); i = p;
        }
    }
    pop() {
        const top = this.e[0], last = --this.n;
        this.k[0] = this.k[last]; this.e[0] = this.e[last];
        let i = 0;
        for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < this.n && this.k[l] < this.k[m]) m = l;
            if (r < this.n && this.k[r] < this.k[m]) m = r;
            if (m === i) break;
            this.swap(i, m); i = m;
        }
        return top;
    }
    swap(a, b) { [this.k[a], this.k[b]] = [this.k[b], this.k[a]]; [this.e[a], this.e[b]] = [this.e[b], this.e[a]]; }
}
