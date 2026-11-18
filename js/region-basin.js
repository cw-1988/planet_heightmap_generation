// Valleys (fork addition): the planet's land cut along its natural borders, for the region pick (region-pick.js). From
// the finish's drainage (world.fin.drain: where each cell's water goes, the land it drains, its water, the sea and lakes,
// each cell's height): the thick rivers are those carrying as much water as the planet's rivers do at the valley size
// (so the map's thick strokes; a dry river past 4× that land too), cut into stretches at each confluence and every
// ~2√S km; each land cell belongs to the stretch its water first reaches, on the bank it comes in from (the land above
// a river's head is its own piece). Land whose water reaches the sea or a lake before any thick river is a piece per
// outlet. A piece in patches is split into one per patch. So a piece is whole drainage trees, and a river thinner than
// the wall lies inside one valley with all the land it drains. The pieces then join over their lowest divides first
// (region-join.js): a ridge or a mountain range holds longest, a thick river always.

import { joinByBarrier } from './region-join.js';

const RIVER_KM2 = 30000;                         // (the most land a wall's water is measured at: the Meuse, the Elbe's upper reach)

/** A unit per mesh cell (−1 the sea) and each unit's cells, for valley size `sizeKm2`. Kept on the world per size. */
export function valleysOf(w, sizeKm2) {
    const memo = (w._valleys ??= new Map());
    if (memo.has(sizeKm2)) return memo.get(sizeKm2);
    // (the pieces at least a dozen cells: fewer and their edge is the mesh's, not the land's)
    const a = w.tMesh.cellAreaKm2, S = Math.max(12 * a, Math.min(sizeKm2, RIVER_KM2)), drain = w.fin.drain;
    const { unit, units, wall, side } = pieces(w.tMesh, drain, S);
    joinByBarrier(w.tMesh, drain.z ?? null, unit, units, wall, side, Math.max(4, Math.round(S / a / 3)), Math.round(Math.max(sizeKm2, S) / a));
    const v = { unit, cells: cellsOf(unit, units), sizeKm2 };
    memo.set(sizeKm2, v);
    return v;
}

/** The drainage pieces for thick rivers from S km²: { unit, units, wall (the thick river's cells), side (per unit) }. */
function pieces(mesh, drain, S) {
    const { numCells: n, xyz, edgeKm } = mesh, { recv, area, q } = drain;
    // (water: the sea and the standing lakes, fresh or salt; a dry pan is land)
    const sea = drain.lake ? Uint8Array.from(drain.sea, (s, c) => s || drain.lake[c] === 1 || drain.lake[c] === 2) : drain.sea;
    // a thick river by its water, as the map draws it: as much as the planet's rivers carry at S km² (the median), so a
    // rainforest's rivers wall early and a desert's wadis late or never
    const at = [];
    for (let c = 0; c < n; c++) if (!sea[c] && area[c] >= S && area[c] < 1.5 * S) at.push(q[c]);
    at.sort((x, y) => x - y);
    const Q = at.length ? at[at.length >> 1] : Infinity;
    // the order upstream-first (each cell after all that drain into it)
    const up = new Int32Array(n), order = new Int32Array(n);
    for (let c = 0; c < n; c++) if (recv[c] >= 0) up[recv[c]]++;
    let a = 0, b = 0;
    for (let c = 0; c < n; c++) if (!up[c]) order[b++] = c;
    while (a < b) { const r = recv[order[a++]]; if (r >= 0 && --up[r] === 0) order[b++] = r; }
    // the rivers' stretches: a new one at a head, a confluence, or past the length cap
    // (and a dry river past 4 S km² still a valley's floor, so a desert's great basin is cut along its wadis too)
    const river = (c) => !sea[c] && (q[c] >= Q || area[c] >= 4 * S), np = new Uint8Array(n), par = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r)) { np[r] = Math.min(255, np[r] + 1); par[r] = c; } }
    // (and each river's line, its main stem followed up through the confluences by the larger water: its left and right
    // stay apart, so a valley never holds both banks of one river, not even round its head)
    const main = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = recv[c]; if (r >= 0 && river(c) && river(r) && (main[r] < 0 || q[c] > q[main[r]])) main[r] = c; }
    const seg = new Int32Array(n).fill(-1), len = new Float32Array(n), lMax = 2 * Math.sqrt(S), line = new Int32Array(n), segLine = [];
    let segs = 0, lines = 0;
    for (let k = 0; k < b; k++) {
        const c = order[k];
        if (!river(c)) continue;
        line[c] = main[c] >= 0 ? line[main[c]] : lines++;
        if (np[c] === 1 && len[par[c]] < lMax) { seg[c] = seg[par[c]]; len[c] = len[par[c]] + edgeKm; } else { seg[c] = segs++; segLine.push(line[c]); }
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
            if (wall[r]) { u = 3 * seg[r] + bank(xyz, recv, main, np, r, c); break; }
            c = r;
        }
        for (let i = 0; i < k; i++) unit[path[i]] = u;
    }
    const side0 = new Int32Array(next).fill(-1);
    for (let u = 0; u < 3 * segs; u++) if (u % 3) side0[u] = 2 * segLine[(u / 3) | 0] + (u % 3) - 1;
    const { units, of } = parts(mesh, unit, next);
    return { unit, units, wall, side: Int32Array.from(of, (u) => side0[u]) };
}

/**
 * Each piece in its parts that touch (a bank cut by land that drains past the river, to the sea or a lake, comes in
 * patches): the largest keeps its number, the others get new ones, so a valley is always one patch. `unit` is
 * relabelled in place; returns the count and, per piece, the piece it came from.
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
    const of = Array.from({ length: units }, (_, i) => i);
    let next = units;
    for (let k = 0; k < comps.length; k++) {
        const { u, cells } = comps[k];
        if (best[u] === k) continue;
        for (const c of cells) unit[c] = next;
        of.push(u); next++;
    }
    return { units: next, of };
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

/**
 * Which bank of the river at `r` the water from its neighbour `c` comes in on: 1 left, 2 right (looking downstream); 0
 * at a head. Round r, the river's line in (from `up`, its main stem) and out (to its receiver) split the neighbours in
 * two arcs: the left one sweeps counter-clockwise from downstream to upstream. (A straight line through r misreads a
 * bend: the inside of the bend comes out on both sides, and a bank in two pieces.)
 */
function bank(xyz, recv, up, np, r, c) {
    if (np[r] === 0) return 0;
    const P = (i) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]], o = P(r), d = recv[r];
    const rel = (i) => { const p = P(i), k = p[0] * o[0] + p[1] * o[1] + p[2] * o[2]; return [p[0] - k * o[0], p[1] - k * o[1], p[2] - k * o[2]]; };
    // (the tangent frame at r: e1 downstream, e2 = r × e1 to its left)
    let e1 = d >= 0 ? rel(d) : rel(up[r]).map((x) => -x);
    const l = Math.hypot(...e1) || 1;
    e1 = e1.map((x) => x / l);
    const e2 = [o[1] * e1[2] - o[2] * e1[1], o[2] * e1[0] - o[0] * e1[2], o[0] * e1[1] - o[1] * e1[0]];
    const angle = (i) => { const v = rel(i), t = Math.atan2(v[0] * e2[0] + v[1] * e2[1] + v[2] * e2[2], v[0] * e1[0] + v[1] * e1[1] + v[2] * e1[2]); return t < 0 ? t + 2 * Math.PI : t; };
    return angle(c) < angle(up[r]) ? 1 : 2;
}
