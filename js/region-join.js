// The valleys' joining (fork addition, for region-basin.js): the drainage pieces merged into valleys over their weakest
// borders first. A border is a divide, a river, or both, and each weighs in metres of barrier:
//   · a divide: how far it stands above the two pieces (the mean height of the cells on it less the pieces' mean
//     heights, m), so a low saddle between two plains joins early and a ridge or a range late or never;
//   · a river between them (one piece on each bank: region-bank.js): one that drains a valley's land or more (riv.edgeKm2)
//     is a valley's edge, never crossed; a thinner one is the valley's own stream, up to STREAM_M by its share of that.
// Smaller pairs go first (SIZE_M of barrier per valley's worth of size), so the valleys come out even. Without a ceiling
// the weakest-first joining crossed anything once the cheap borders ran out: an edge river or a ridge of HARD_M is never
// crossed, however small the valleys stay.

import { bankAt } from './region-bank.js';

const SIZE_M = 300;                                                          // (m of barrier the size of a whole valley weighs)
const STREAM_M = 100;                                                        // (m: a stream just short of an edge river)
const HARD_M = 600;                                                          // (m: a ridge this high over both sides)
const NECK_M = 400, NECK_R = 0.35;                                           // (m: a join by a point; the border share that costs none)

/**
 * `unit` (a piece per cell, −1 the sea) relabelled in place to the valleys: first the slivers under `min` cells join their
 * weakest neighbour, then all pairs join weakest border first while the two are under 1.6 × `target` cells together,
 * then what is left under a quarter of `target` joins its weakest neighbour (to 2.2 × `target`), and under `min` any
 * but across an edge river. z: each cell's height (km), or null. riv: the rivers ({ wall, recv, main, np, qe (land
 * drained, km²), edgeKm2 }: region-basin.js).
 */
export function joinByBarrier(mesh, z, unit, units, riv, min, target) {
    const { adjOffset, adjList, xyz } = mesh, n = unit.length, zc = z ?? new Float32Array(n), { wall, recv, main, np, qe, edgeKm2, corner } = riv;
    const root = new Int32Array(units).map((_, i) => i), find = (u) => { while (root[u] !== u) u = root[u] = root[root[u]]; return u; };
    const size = new Int32Array(units), sumZ = new Float64Array(units), ver = new Int32Array(units), coast = new Uint8Array(units);
    const per = new Int32Array(units);                                       // (each piece's border, in cell sides)
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
            if (v < 0) { coast[u] = 1; per[u]++; continue; }
            if (d <= c || v === u) continue;
            per[u]++; per[v]++;
            const m = (nb[u] ??= new Map());
            let rec = m.get(v);
            if (!rec) { rec = { open: 0, h: 0, cross: 0, q: 0 }; m.set(v, rec); (nb[v] ??= new Map()).set(u, rec); }
            const qx = Math.max(across(c, d) ? qe[c] : 0, across(d, c) ? qe[d] : 0, corner?.get(c * n + d) ?? 0);
            if (qx > 0) { rec.cross++; rec.q = Math.max(rec.q, qx); } else { rec.open++; rec.h += Math.max(zc[c], zc[d]); }
        }
    }
    const banks = banksOf(mesh, unit, units, riv);
    const mean = (u) => sumZ[u] / size[u];
    // (an edge river anywhere on the border: never; a stream one cell apart and otherwise open is a bank's corner)
    const barrier = (u, v, rec) => {
        if (rec.q >= edgeKm2 || bothBanks(banks[u], banks[v])) return Infinity;
        const divide = rec.open ? 1000 * (rec.h / rec.open - (mean(u) + mean(v)) / 2) : 0;
        const river = rec.cross ? STREAM_M * rec.q / edgeKm2 : 0;
        return rec.cross >= 2 || !rec.open ? Math.max(divide, river) : divide;
    };
    // (a join through a neck — a border short against the smaller piece's whole rim — makes a valley of lobes and tails:
    // up to NECK_M more, the shorter the border)
    const neck = (u, v, rec) => NECK_M * Math.max(0, 1 - (rec.open + rec.cross) / (NECK_R * Math.max(1, Math.min(per[u], per[v]))));
    const merge = (u, v) => {
        const [t, s] = (nb[u]?.size ?? 0) >= (nb[v]?.size ?? 0) ? [u, v] : [v, u], mt = (nb[t] ??= new Map());
        const shared = nb[s]?.get(t);
        per[t] += per[s] - 2 * (shared ? shared.open + shared.cross : 0);
        root[s] = t; size[t] += size[s]; sumZ[t] += sumZ[s]; coast[t] |= coast[s]; ver[t]++;
        if (banks[s]) { const bt = (banks[t] ??= new Map()); for (const [k, m] of banks[s]) bt.set(k, (bt.get(k) ?? 0) | m); banks[s] = null; }
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
        let best = -1, low = Infinity;
        for (const [v, rec] of nb[u] ?? []) {
            if (size[u] + size[v] > cap) continue;
            const k = barrier(u, v, rec);
            if (k < hard && k + neck(u, v, rec) < low) { low = k + neck(u, v, rec); best = v; }
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
            const v = nb[u].keys().next().value;
            if (!bothBanks(banks[u], banks[v])) merge(u, v);
        }
    };
    slivers(min, Infinity);
    // the pairs, weakest border (and smallest) first
    const cap = 1.6 * target, heap = new Heap();
    const offer = (u) => {
        for (const [v, rec] of nb[u] ?? []) {
            const k = barrier(u, v, rec);
            if (size[u] + size[v] > cap || k >= HARD_M) continue;
            heap.push(Math.max(0, k) + neck(u, v, rec) + SIZE_M * (size[u] + size[v]) / target, u, v, ver[u], ver[v]);
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
    slivers(Math.max(min, target / 4), 2.2 * target, HARD_M); holes(); slivers(min, Infinity, Infinity); holes();
    for (let c = 0; c < n; c++) if (unit[c] >= 0) unit[c] = find(unit[c]);
}

/**
 * Per piece, the edge rivers it lies along and on which bank: Map(stem → 1 left | 2 right | 3), null if none. A stem is
 * a river's main line (followed up each confluence by the larger land), and only its stretch that drains a valley's land
 * or more counts. A valley may hold one bank of each: never both, even joined round the river's head, where it is
 * still a stream (a valley wrapped round a great river's upper end was drawn on both its banks).
 */
function banksOf(mesh, unit, units, { wall, recv, main, np, qe, edgeKm2 }) {
    const { adjOffset, adjList, xyz } = mesh, n = unit.length, stem = new Int32Array(n).fill(-1), banks = new Array(units).fill(null), path = [];
    for (let c = 0; c < n; c++) {
        if (!wall[c] || stem[c] >= 0) continue;
        let k = c;
        while (stem[k] < 0) { path.push(k); const r = recv[k]; if (r < 0 || !wall[r] || main[r] !== k) break; k = r; }
        const s = stem[k] >= 0 ? stem[k] : k;
        for (const p of path) stem[p] = s;
        path.length = 0;
    }
    const mark = (u, s, side) => { const m = (banks[u] ??= new Map()); m.set(s, (m.get(s) ?? 0) | side); };
    for (let r = 0; r < n; r++) {
        if (!wall[r] || !np[r] || qe[r] < edgeKm2) continue;
        if (unit[r] >= 0) mark(unit[r], stem[r], 1);                           // (a river's cells: its left bank's piece)
        for (let e = adjOffset[r]; e < adjOffset[r + 1]; e++) {
            const d = adjList[e];
            if (unit[d] < 0 || wall[d]) continue;
            mark(unit[d], stem[r], bankAt(xyz, recv, main, np, r, xyz[3 * d], xyz[3 * d + 1], xyz[3 * d + 2]));
        }
    }
    return banks;
}

/**
 * The river steps that go corner to corner (4 in 10: a cell's water to a cell it touches only at a point, mesh.adjList's
 * neighbours but not `edges`' true ones): each passes between the two cells the two share, which meet side by side
 * across the river. Map(a · n + b, a < b → the land the river drains there, km²), so the join counts that side as a
 * river crossed, not open land.
 */
export function cornersOf(mesh, edges, { wall, recv, qe }) {
    const n = wall.length, out = new Map(), A = mesh.adjOffset, L = mesh.adjList;
    const touches = (m, a, b) => { for (let e = m.adjOffset[a]; e < m.adjOffset[a + 1]; e++) if (m.adjList[e] === b) return true; return false; };
    for (let c = 0; c < n; c++) {
        const r = recv[c];
        if (!wall[c] || r < 0 || touches(edges, c, r)) continue;
        const both = [];
        for (let e = A[c]; e < A[c + 1]; e++) if (touches(mesh, r, L[e])) both.push(L[e]);
        for (let i = 0; i < both.length; i++) for (let j = i + 1; j < both.length; j++) {
            const a = Math.min(both[i], both[j]), b = Math.max(both[i], both[j]);
            if (touches(edges, a, b)) out.set(a * n + b, Math.max(out.get(a * n + b) ?? 0, qe[c]));
        }
    }
    return out;
}

/** Would two pieces together lie on both banks of one edge river? */
function bothBanks(a, b) {
    if (!a || !b) return false;
    const [s, l] = a.size <= b.size ? [a, b] : [b, a];
    for (const [k, m] of s) if (((l.get(k) ?? 0) | m) === 3) return true;
    return false;
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
