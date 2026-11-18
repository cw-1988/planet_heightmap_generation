// Valleys (fork addition): the planet's land cut along its natural borders, for the region pick (region-pick.js). From
// the finish's drainage (world.fin.drain: where each cell's water goes, the land it drains, its water, the sea and lakes,
// each cell's height): every river the map draws (from RIVER_Q0 m³/s, or the Rivers slider's floor; a dry river past 4×
// the stretch's land too) is cut into stretches at each confluence and every ~2√S km; each land cell belongs to the
// stretch its water first reaches, on the bank it comes in from (the land above a river's head is its own piece). Land
// whose water reaches the sea or a lake before any river is a piece per outlet. A piece in patches is split into one per
// patch. The pieces then join over their weakest borders first (region-join.js): a low saddle or a brook early, a ridge,
// a range or a great river late or never. A river cell is half on each bank (region-bank.js): its pixels go by side.

import { joinByBarrier } from './region-join.js';
import { bankAt, RIVER_Q0 } from './region-bank.js';

const RIVER_KM2 = 30000;                         // (the most land a stretch is measured at: the Meuse, the Elbe's upper reach)

/**
 * A unit per mesh cell (−1 the sea) and each unit's cells, for valley size `sizeKm2`, rivers from `riverQ` m³/s (0:
 * RIVER_Q0). With what a point's valley needs (region-bank.js unitAt): wall, recv, main, np, bankUnit, nbSide. Kept on
 * the world.
 */
export function valleysOf(w, sizeKm2, riverQ = 0) {
    const memo = (w._valleys ??= new Map()), key = `${sizeKm2}|${riverQ}`;
    if (memo.has(key)) return memo.get(key);
    // (the pieces at least a dozen cells: fewer and their edge is the mesh's, not the land's)
    const mesh = w.tMesh, a = mesh.cellAreaKm2, S = Math.max(12 * a, Math.min(sizeKm2, RIVER_KM2)), drain = w.fin.drain;
    const Q = riverQ > 0 ? riverQ : RIVER_Q0, P = pieces(mesh, drain, S, Q);
    const riv = { wall: P.wall, recv: drain.recv, main: P.main, np: P.np, qe: P.qe };
    joinByBarrier(mesh, drain.z ?? null, P.unit, P.units, riv, Math.max(4, Math.round(S / a / 3)), Math.round(Math.max(sizeKm2, S) / a));
    const v = { unit: P.unit, cells: cellsOf(P.unit, P.units), sizeKm2, riverQ: Q, ...riv, ...banks(mesh, P.unit, riv) };
    memo.set(key, v);
    return v;
}

/** The drainage pieces with walls from Q m³/s: { unit, units, wall (the rivers' cells), main, np, qe (a wall's water). */
function pieces(mesh, drain, S, Q) {
    const { numCells: n, xyz, edgeKm } = mesh, { recv, area, q } = drain;
    // (water: the sea and the standing lakes, fresh or salt; a dry pan is land)
    const sea = drain.lake ? Uint8Array.from(drain.sea, (s, c) => s || drain.lake[c] === 1 || drain.lake[c] === 2) : drain.sea;
    // the order upstream-first (each cell after all that drain into it)
    const up = new Int32Array(n), order = new Int32Array(n);
    for (let c = 0; c < n; c++) if (recv[c] >= 0) up[recv[c]]++;
    let a = 0, b = 0;
    for (let c = 0; c < n; c++) if (!up[c]) order[b++] = c;
    while (a < b) { const r = recv[order[a++]]; if (r >= 0 && --up[r] === 0) order[b++] = r; }
    // the rivers (a dry one past 4 S km² still a valley's floor, so a desert's great basin is cut along its wadis too),
    // their water as a border weighs it (a dry one as a wet one of its land's worth), and their stretches: a new one at
    // a head, a confluence, or past the length cap
    const river = (c) => !sea[c] && (q[c] >= Q || area[c] >= 4 * S), np = new Uint8Array(n), par = new Int32Array(n).fill(-1);
    const qe = new Float32Array(n);
    for (let c = 0; c < n; c++) if (river(c)) qe[c] = Math.max(q[c], RIVER_Q0 * area[c] / S);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r)) { np[r] = Math.min(255, np[r] + 1); par[r] = c; } }
    // (each river's main stem up through a confluence: the larger water, so its left and right stay apart)
    const main = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r) && (main[r] < 0 || q[c] > q[main[r]])) main[r] = c; }
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

/**
 * Per river cell, the valley on its left and on its right (bankUnit, 2 per cell, −1 none: the valley most of its
 * neighbours on that side are in), and each of its land neighbours' side (nbSide, per adjacency entry: 1 left, 2 right,
 * 0 not a bank). So the half of a river cell across its line is the far bank's, each bit of it the valley of the bank
 * cell nearest it (region-bank.js unitAt), and every valley that touches a river reaches its line.
 */
function banks(mesh, unit, { wall, recv, main, np }) {
    const { adjOffset, adjList, xyz, numCells: n } = mesh, out = new Int32Array(2 * n).fill(-1), votes = new Map();
    const nbSide = new Uint8Array(adjList.length);
    for (let r = 0; r < n; r++) {
        if (!wall[r] || !np[r]) continue;
        for (let e = adjOffset[r]; e < adjOffset[r + 1]; e++) {
            const d = adjList[e];
            if (!wall[d] && unit[d] >= 0) nbSide[e] = bankAt(xyz, recv, main, np, r, xyz[3 * d], xyz[3 * d + 1], xyz[3 * d + 2]);
        }
        for (let side = 1; side <= 2; side++) {
            votes.clear();
            for (let e = adjOffset[r]; e < adjOffset[r + 1]; e++) if (nbSide[e] === side) votes.set(unit[adjList[e]], (votes.get(unit[adjList[e]]) ?? 0) + 1);
            let best = side === 1 ? unit[r] : -1, most = 0;
            for (const [u, k] of votes) if (k > most) { most = k; best = u; }
            out[2 * r + side - 1] = best;
        }
    }
    return { bankUnit: out, nbSide };
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
