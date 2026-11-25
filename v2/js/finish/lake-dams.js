// Blocked-valley lakes (docs/lake-origins.md): a tributary's lower valley dammed by its trunk river. The trunk carries far
// more sediment and, where it aggrades on a low gradient, builds its floodplain and levees up faster than the tributary
// can keep pace: the tributary's mouth is blocked and its valley floods. The Yangtze's Poyang and Dongting, the Mekong's
// Tonle Sap, the Amazon's ria lakes (Tefé, Coari), the Mississippi's Lake Pepin the other way round (a tributary's fan
// across the trunk). A hollow the finishing made in a lowland valley is one of these where its spill joins such a trunk;
// elsewhere (a steep trunk cuts, it does not build up) it is cut through as before (finish-hydro.js).

/** Each cell's upstream area, in cells, down the flood's receivers before any cut (`order` downstream first). */
export function upstreamCells(order, count, recv, n) {
    const up = new Float32Array(n);
    for (let i = count - 1; i >= 0; i--) { const c = order[i]; up[c] += 1; if (recv[c] >= 0) up[recv[c]] += up[c]; }
    return up;
}

/**
 * Whether a hollow is a blocked tributary: down its spill from `outlet`, within F.damReachKm, a trunk draining at least
 * F.damRatio × its own area and F.damTrunkKm2, falling under F.damSlope (km per km) there — an aggrading river. `inHollow`
 * tells the hollow's own cells; `fill` the flood's spill levels (km), `stepKm` each cell's step to its receiver.
 */
export function blockedValley(inHollow, outlet, up, recv, fill, stepKm, cellKm2, F) {
    const own = up[outlet];
    let km = 0;
    for (let x = recv[outlet], guard = 0; x >= 0 && guard < 1000; x = recv[x], guard++) {
        if (inHollow(x)) continue;
        const r = recv[x];
        if (r < 0 || !(stepKm[x] > 0)) return false;                 // (the sea: a drowned valley is the sea's, not a lake)
        if (up[x] >= F.damRatio * own && up[x] * cellKm2 >= F.damTrunkKm2) return (fill[x] - fill[r]) / stepKm[x] <= F.damSlope;
        km += stepKm[x];
        if (km > F.damReachKm) return false;
    }
    return false;
}
