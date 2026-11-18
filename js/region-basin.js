// Valleys (fork addition): the planet's land cut along its natural borders, for the region pick (region-pick.js). From
// the finish's drainage (world.fin.drain: where each cell's water goes, the land it drains, the sea and lakes, each
// cell's height, its water), at the valley size T alone: a river whose water is a valley's worth (T km² of land at
// the planet's mean runoff, wetKm2: the map draws a river as wide as its water) is a valley's edge, never crossed (a
// valley is the land between such rivers, one bank each); a thinner one lies inside a valley, as its own stream. The
// rivers from S (a fifth of T, at least a dozen cells; by land drained or water) are cut into stretches at each confluence and every ~2√S km;
// each land cell belongs to the stretch its water first reaches, on the bank it comes in from (the land above a river's
// head is its own piece). Land whose water reaches the sea or a lake before any river is a piece per outlet. A piece in
// patches is split into one per patch. The pieces then join over their weakest borders first (region-join.js): a low
// saddle or a stream inside the valley early, a ridge late, a range or an edge river never. A river cell is half on
// each bank (region-bank.js halves): each half goes to its bank's valley unless that splits a valley in two.

import { joinByBarrier, cornersOf } from './region-join.js';
import { bankAt } from './region-bank.js';
import { halves } from './region-halves.js';
import { edgeMesh } from './region-mesh.js';

/**
 * A unit per mesh cell (−1 the sea) and each unit's cells, for valley size `sizeKm2`. With what a point's valley needs
 * (region-bank.js unitAt): wall, recv, main, np, half. Kept on the world.
 */
export function valleysOf(w, sizeKm2) {
    const memo = (w._valleys ??= new Map());
    if (memo.has(sizeKm2)) return memo.get(sizeKm2);
    // (a valley and a piece at least a dozen cells: fewer and their edge is the mesh's, not the land's)
    // (the mesh's true neighbours only: a valley joined over a corner would be drawn in two pieces)
    const mesh = edgeMesh(w), a = mesh.cellAreaKm2, T = Math.max(12 * a, sizeKm2), S = Math.max(12 * a, T / 5), drain = w.fin.drain;
    const P = pieces(mesh, drain, S);
    const riv = { wall: P.wall, recv: drain.recv, main: P.main, np: P.np, qe: P.qe, edgeKm2: T };
    riv.corner = cornersOf(w.tMesh, mesh, riv);
    joinByBarrier(mesh, drain.z ?? null, P.unit, P.units, riv, Math.max(4, Math.round(S / a / 3)), Math.round(T / a));
    const v = { unit: P.unit, cells: cellsOf(P.unit, P.units), sizeKm2, ...riv, half: halves(mesh, w.tMesh, P.unit, riv) };
    memo.set(sizeKm2, v);
    return v;
}

/**
 * Each cell's water (drain.q, m³/s) as the land that sheds it at the planet's mean runoff (km²): the water reaching the
 * sea over all the land that drains there.
 */
function wetKm2(mesh, drain, sea) {
    const { recv, q } = drain, n = recv.length;
    let out = 0, land = 0;
    for (let c = 0; c < n; c++) {
        if (sea[c]) continue;
        land++;
        const r = recv[c];
        if (r < 0 || drain.sea[r]) out += q[c];
    }
    const k = Math.max(1e-9, out / (land * mesh.cellAreaKm2));
    return Float32Array.from(q, (v) => v / k);
}

/** The drainage pieces cut by the rivers from S km²: { unit, units, wall (the rivers' cells), main, np, qe (water, as land: wetKm2) }. */
function pieces(mesh, drain, S) {
    const { numCells: n, xyz, edgeKm } = mesh, { recv, area } = drain;
    // (water: the sea and the standing lakes, fresh or salt; a dry pan is land)
    const sea = drain.lake ? Uint8Array.from(drain.sea, (s, c) => s || drain.lake[c] === 1 || drain.lake[c] === 2) : drain.sea;
    // the order upstream-first (each cell after all that drain into it)
    const up = new Int32Array(n), order = new Int32Array(n);
    for (let c = 0; c < n; c++) if (recv[c] >= 0) up[recv[c]]++;
    let a = 0, b = 0;
    for (let c = 0; c < n; c++) if (!up[c]) order[b++] = c;
    while (a < b) { const r = recv[order[a++]]; if (r >= 0 && --up[r] === 0) order[b++] = r; }
    // the rivers that cut the land into pieces: by the land they drain, wet or dry (a desert's great basin is cut along
    // its wadis too), or by their water. A river weighs as a border by its water, as the map draws it (finish-view.js:
    // its width is its discharge): qe, in km² of the planet's land at its mean runoff, so a river whose water is a
    // valley's worth or more (T) is an edge. By the land drained alone, a dry river that the map draws thin or not at all
    // was an edge, and a wet one drawn thick ran through a valley. Their stretches: a new one at a head, a confluence, or
    // past the length cap
    const qe = wetKm2(mesh, drain, sea);
    const river = (c) => !sea[c] && (area[c] >= S || qe[c] >= S), np = new Uint8Array(n), par = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) if (!river(c)) qe[c] = 0;
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r)) { np[r] = Math.min(255, np[r] + 1); par[r] = c; } }
    // (each river's main stem up through a confluence: the larger land, so its left and right stay apart)
    const main = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r) && (main[r] < 0 || area[c] > area[main[r]])) main[r] = c; }
    const seg = new Int32Array(n).fill(-1), len = new Float32Array(n), lMax = 2 * Math.sqrt(S);
    let segs = 0;
    for (let k = 0; k < b; k++) {
        const c = order[k];
        if (!river(c)) continue;
        if (np[c] === 1 && len[par[c]] < lMax) { seg[c] = seg[par[c]]; len[c] = len[par[c]] + edgeKm; } else seg[c] = segs++;
    }
    // each cell: the stretch its water reaches and the bank (0 above a head, 1 left, 2 right), or the outlet its water
    // leaves by (the coast, a closed basin, a loop of receivers in a lake: the order misses those, and the walk finds them)
    const wall = new Uint8Array(n), unit = new Int32Array(n).fill(-1), path = new Int32Array(n), seen = new Int32Array(n);
    for (let c = 0; c < n; c++) if (seg[c] >= 0) { wall[c] = 1; unit[c] = 3 * seg[c] + (np[c] === 0 ? 0 : 1); }
    let next = 3 * segs;
    for (let s = 0; s < n; s++) {
        if (sea[s] || unit[s] >= 0) continue;
        let c = s, k = 0, u = -1;
        for (;;) {
            if (unit[c] >= 0) { u = unit[c]; break; }
            if (seen[c] === s + 1) { u = next++; break; }
            seen[c] = s + 1; path[k++] = c;
            const r = recv[c];
            if (r < 0 || sea[r]) { u = next++; break; }
            if (wall[r]) { u = 3 * seg[r] + bankAt(xyz, recv, main, np, r, xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]); break; }
            c = r;
        }
        for (let i = 0; i < k; i++) unit[path[i]] = u;
    }
    return { unit, units: parts(mesh, unit, next), wall, main, np, qe };
}

/**
 * Each piece in its parts that touch (a bank cut by land that drains past the river, to the sea or a lake, comes in
 * patches): the largest keeps its number, the others get new ones, so a valley is always one patch. `unit` is
 * relabelled in place; returns the count.
 */
function parts(mesh, unit, units) {
    const { adjOffset, adjList } = mesh, n = unit.length, at = new Int32Array(n).fill(-1), stack = [], best = new Int32Array(units).fill(-1);
    const comps = [];                                                                       // (per part: its piece, cells)
    for (let s = 0; s < n; s++) {
        const u = unit[s];
        if (u < 0 || at[s] >= 0) continue;
        const k = comps.length, cells = [s];
        at[s] = k; stack.push(s);
        while (stack.length) {
            const c = stack.pop();
            for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) { const d = adjList[e]; if (unit[d] === u && at[d] < 0) { at[d] = k; cells.push(d); stack.push(d); } }
        }
        comps.push({ u, cells });
        if (best[u] < 0 || cells.length > comps[best[u]].cells.length) best[u] = k;
    }
    let next = units;
    for (let k = 0; k < comps.length; k++) {
        if (best[comps[k].u] === k) continue;
        for (const c of comps[k].cells) unit[c] = next;
        next++;
    }
    return next;
}

/** Each unit's cells: Map(unit → Int32Array). */
function cellsOf(unit, units) {
    const n = unit.length, count = new Int32Array(units), cells = new Map();
    for (let c = 0; c < n; c++) if (unit[c] >= 0) count[unit[c]]++;
    for (let u = 0; u < units; u++) if (count[u]) cells.set(u, new Int32Array(count[u]));
    count.fill(0);
    for (let c = 0; c < n; c++) { const u = unit[c]; if (u >= 0) cells.get(u)[count[u]++] = c; }
    return cells;
}
