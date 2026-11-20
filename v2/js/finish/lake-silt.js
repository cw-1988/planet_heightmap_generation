// A lake's rivers fill it with what they wash off their catchment (owner, 2026-11-20: a lake behind a high rim drowned
// a whole lowland; then "how do we allow for more smaller lakes, while making big ones adjustable in size?"). This one
// rule decides which lakes a river keeps: a small lake on a small river, a big one on a big river; a pond on a great
// river is filled (it replaced lakeKeepKm2's size-for-river cut). Three parts:
// - Supply: the catchment's area × lakeSiltKm, the ground its rivers took off it while the lake stood (the ice age's young
//   lakes glacialSiltShare of that: they have stood ~12 000 years).
// - Trapping: a lake traps its inflow's sediment in proportion to the share of its basin still open water (a shoaling lake
//   holds its water a shorter time and passes more on: Brune's trap-efficiency curve). So dV/dS = −V/V0, and what is
//   left is V0·exp(−S/V0): every lake shrinks smoothly as the supply grows, none drops from full to nothing at a threshold.
// - Where: deltas build out from where the rivers come in, the big river's furthest, round the deep water before over
//   it (the Rhône in Lake Geneva, the Volga in the Caspian). Area falls with volume even on a flat floor.
// What water is left under minKm2 in a piece is filled too. The ground filled stands just above the water, so the rivers
// cross it to what is left.

const ABOVE_KM = 0.001;   // (filled ground: 1 m above the water)

/** Fills `water` (cell ids, a lake at `level` km) from its `inlets` ([cell, m³/s] pairs) with what it traps of
 *  `supplyKm3` of sediment; returns the water left. */
export function siltLake(water, level, supplyKm3, inlets, z, cellKm2, minKm2, adjOffset, adjList) {
    if (!(supplyKm3 > 0) || !water.length) return water;
    let v0 = 0;
    for (const x of water) v0 += Math.max(0, level - z[x]) * cellKm2;
    if (!(v0 > 0)) return water;
    let left = v0 * (1 - Math.exp(-supplyKm3 / v0));
    const inWater = new Set(water), meanDepth = v0 / (water.length * cellKm2);
    // (the deltas' reach: a step costs 1 + its depth over the mean depth, divided by √ its river's share — Dijkstra from
    // every inlet at once; without inlets, from the shallowest cell)
    let total = 0;
    for (const [, q] of inlets) total += q;
    const cost = new Map(), heap = [];
    const push = (x, d) => { if (!(d < (cost.get(x) ?? Infinity))) return; cost.set(x, d); heap.push([d, x]); up(heap.length - 1); };
    const up = i => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
        return top;
    };
    const weight = new Map();
    if (total > 0) for (const [x, q] of inlets) if (inWater.has(x)) weight.set(x, Math.max(weight.get(x) ?? 0, Math.sqrt(q / total)));
    if (!weight.size) { let s = water[0]; for (const x of water) if (z[x] > z[s]) s = x; weight.set(s, 1); }
    const reach = new Map();
    for (const [x, w] of weight) { reach.set(x, w); push(x, 0); }
    const filled = new Set();
    while (heap.length && left > 0) {
        const [d, x] = pop();
        if (d > cost.get(x) || filled.has(x)) continue;
        const v = Math.max(0, level - z[x]) * cellKm2;
        if (v > left) break;
        left -= v; filled.add(x); z[x] = level + ABOVE_KM;
        const w = reach.get(x);
        for (let a = adjOffset[x]; a < adjOffset[x + 1]; a++) {
            const nb = adjList[a];
            if (!inWater.has(nb) || filled.has(nb)) continue;
            const nd = d + (1 + Math.max(0, level - z[nb]) / meanDepth) / w;
            if (nd < (cost.get(nb) ?? Infinity)) { reach.set(nb, w); push(nb, nd); }
        }
    }
    if (!filled.size) return water;
    // (the water left, in pieces; one under minKm2 is filled too)
    const seen = new Set(), out = [];
    for (const s of water) {
        if (filled.has(s) || seen.has(s)) continue;
        const piece = [s];
        seen.add(s);
        for (let k = 0; k < piece.length; k++) for (let a = adjOffset[piece[k]]; a < adjOffset[piece[k] + 1]; a++) {
            const nb = adjList[a];
            if (inWater.has(nb) && !filled.has(nb) && !seen.has(nb)) { seen.add(nb); piece.push(nb); }
        }
        if (piece.length >= 2 && piece.length * cellKm2 >= minKm2) for (const x of piece) out.push(x);
        else for (const x of piece) z[x] = level + ABOVE_KM;
    }
    return out;
}

/** The inlets of `water`: [cell, m³/s] for each water cell some land cell's river runs into (`recv`, its flow `q`). */
export function lakeInlets(water, q, recv, adjOffset, adjList) {
    const inWater = new Set(water), into = new Map();
    for (const x of water) for (let a = adjOffset[x]; a < adjOffset[x + 1]; a++) {
        const nb = adjList[a];
        if (!inWater.has(nb) && recv[nb] === x && q[nb] > 0) into.set(x, (into.get(x) ?? 0) + q[nb]);
    }
    return [...into];
}
