// The valleys' joining (fork addition, for region-basin.js): the drainage pieces merged into valleys over their lowest
// borders first. A border's barrier is how far its divide stands above the two pieces (the mean height of the cells on
// it less the pieces' mean heights, m): a low saddle between two plains joins early, a ridge or a mountain range late or
// never. A border through a thick river's cells (`wall`) is no border at all, and no valley holds both banks of one
// river (`side`). Smaller pairs go first (SIZE_M of barrier per valley's worth of size), so the valleys come out even.

const SIZE_M = 300;                                                          // (m of barrier the size of a whole valley weighs)

/**
 * `unit` (a piece per cell, −1 the sea) relabelled in place to the valleys: first the slivers under `min` cells join their
 * lowest neighbour, then all pairs join lowest barrier first while the two are under 1.6 × `target` cells together, then
 * what is left under a quarter of `target` joins its lowest neighbour (to 2.2 × `target`), and under `min` anything.
 * z: each cell's height (km), or null.
 */
export function joinByBarrier(mesh, z, unit, units, wall, side, min, target) {
    const { adjOffset, adjList } = mesh, n = unit.length, zc = z ?? new Float32Array(n);
    const root = new Int32Array(units).map((_, i) => i), find = (u) => { while (root[u] !== u) u = root[u] = root[root[u]]; return u; };
    const size = new Int32Array(units), sumZ = new Float64Array(units), ver = new Int32Array(units), coast = new Uint8Array(units);
    const sides = Array.from(side, (s) => (s >= 0 ? new Set([s]) : null)), nb = new Array(units).fill(null);
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
            if (!rec) { rec = { open: 0, h: 0, walled: 0 }; m.set(v, rec); (nb[v] ??= new Map()).set(u, rec); }
            if (wall[c] || wall[d]) rec.walled++; else { rec.open++; rec.h += Math.max(zc[c], zc[d]); }
        }
    }
    const mean = (u) => sumZ[u] / size[u];
    const barrier = (u, v, rec) => 1000 * (rec.h / rec.open - (mean(u) + mean(v)) / 2);
    const clash = (u, v) => {
        const a = sides[u], b = sides[v];
        if (!a || !b) return false;
        const [s, l] = a.size < b.size ? [a, b] : [b, a];
        for (const k of s) if (l.has(k ^ 1)) return true;
        return false;
    };
    const merge = (u, v) => {
        const [t, s] = (nb[u]?.size ?? 0) >= (nb[v]?.size ?? 0) ? [u, v] : [v, u], mt = (nb[t] ??= new Map());
        root[s] = t; size[t] += size[s]; sumZ[t] += sumZ[s]; coast[t] |= coast[s]; ver[t]++;
        if (sides[s]) { if (!sides[t]) sides[t] = sides[s]; else for (const k of sides[s]) sides[t].add(k); }
        sides[s] = null;
        for (const [x, rec] of nb[s] ?? []) {
            if (x === t) continue;
            const mx = nb[x], have = mt.get(x);
            mx.delete(s);
            if (have) { have.open += rec.open; have.h += rec.h; have.walled += rec.walled; } else { mt.set(x, rec); mx.set(t, rec); }
        }
        mt.delete(s); nb[s] = null;
        return t;
    };
    // the lowest neighbour a piece may join (open borders first; `walled` lets it touch only across river cells)
    const lowest = (u, cap, walled) => {
        let best = -1, low = Infinity;
        for (const [v, rec] of nb[u] ?? []) {
            if (size[u] + size[v] > cap || clash(u, v)) continue;
            const k = rec.open ? barrier(u, v, rec) : walled && rec.walled ? 1e9 - rec.walled : Infinity;
            if (k < low) { low = k; best = v; }
        }
        return best;
    };
    const slivers = (min, cap, walled) => {
        const order = [];
        for (let u = 0; u < units; u++) if (root[u] === u && size[u] && size[u] < min) order.push(u);
        order.sort((a, b) => size[a] - size[b]);
        for (const u0 of order) {
            const u = find(u0);
            if (size[u] >= min) continue;
            const v = lowest(u, cap, walled);
            if (v >= 0) merge(u, v);
        }
    };
    // a hole (a piece off the coast with one neighbour all round) is that neighbour's, whatever its size or banks
    const holes = () => {
        for (let u = 0; u < units; u++) {
            if (root[u] !== u || !size[u] || coast[u] || nb[u]?.size !== 1) continue;
            merge(u, nb[u].keys().next().value);
        }
    };
    slivers(min, Infinity, false);
    // the pairs, lowest barrier (and smallest) first
    const cap = 1.6 * target, heap = new Heap();
    const offer = (u) => {
        for (const [v, rec] of nb[u] ?? []) {
            if (!rec.open || size[u] + size[v] > cap) continue;
            heap.push(Math.max(0, barrier(u, v, rec)) + SIZE_M * (size[u] + size[v]) / target, u, v, ver[u], ver[v]);
        }
    };
    for (let u = 0; u < units; u++) if (root[u] === u && size[u]) offer(u);
    while (heap.n) {
        const [u, v, vu, vv] = heap.pop();
        if (root[u] !== u || root[v] !== v || ver[u] !== vu || ver[v] !== vv) continue;
        if (size[u] + size[v] > cap || clash(u, v)) continue;
        offer(merge(u, v));
    }
    // (the leftovers: under a quarter of a valley over open borders only, so none lands across a river; holes; then the
    // last slivers anywhere, across a river's cells too)
    slivers(Math.max(min, target / 4), 2.2 * target, false); holes(); slivers(min, Infinity, true); holes();
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
