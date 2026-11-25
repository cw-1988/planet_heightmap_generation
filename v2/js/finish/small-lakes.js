// Small lakes (docs/small-lakes.md): the lakes too small for the mesh. A 15 km cell holds no hollow of its own, yet
// most of the world's lakes are small ones: lakes cover ~3.7 % of the land outside the ice sheets, and their numbers
// follow a power law, about as much area in each size class from ponds up to ~10 km² (Verpoorter et al. 2014;
// HydroLAKES, Messager et al. 2016). Where they crowd is the landscape's, and few places hold many:
//  · glacial: the last ice age's scoured, hummocky lowland: Finland, the Canadian Shield, ~10 % water;
//  · thermokarst: permafrost lowland, thaw lakes in ice-rich ground: the Siberian and Alaskan tundra;
//  · floodplains: a big river's oxbows and backswamps on its own flat plain: the Amazon, the Ob, the Mississippi;
//  · humid flats: wetland lakes where the land is flat and rain outweighs evaporation;
//  · elsewhere a trace: landslide dams, sinkholes. Sloping, unglaciated country drains its hollows: rivers, few lakes.
// Each needs water to persist (rain over Köppen's dry line). Karst is not counted: the rocks come after the terrain.
// pondShare gives each land cell its expected share of small-lake area; small-lakes-draw.js places and draws the lakes,
// octave by octave (lattices 40 km … 1.25 km), the big ones holding a little more of the area than the next size down:
// N(>A) ∝ A^−1.14 (Cael & Seekell 2016). Ponds below ~0.6 km are left out: on a map they are specks, not lakes.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The tunables: shares of land under small lakes, and where each process reaches full strength. */
export const SMALL_LAKES = {
    unit: 300,                  // a share's byte: share × unit (≤ 127; the top bit marks a pixel drawn as one)
    maxShare: 0.4,              // no cell more than this share water
    // (rain over Köppen's dry line, 20 T + 280 mm — its summer-rain form, the strictest: below 1 the climate is steppe or
    // desert, whose hollows dry out to pans; none … full)
    aridity: [0.8, 1.6],
    // (its share, on slopes up to … — no steeper than a lake's ground holds one: holdM below — by the ice's thickness)
    glacial: 0.10, glacialSlope: [0.004, 0.012], glacialIceKm: [0.4, 1.4],
    thermokarst: 0.12, permafrostC: [-1, -6], thermokarstSlope: [0.001, 0.01],
    // (a river's meander belt, where its oxbows and backswamps lie: ~15 channel widths, a channel ~4 m × √Q (m³/s) wide —
    // ~4 km for 5000 m³/s, ~27 km for the Amazon; the share is of the belt, on the river's cell and its neighbours)
    floodplain: 0.12, floodBeltKm: 0.06, floodSlope: [0.0005, 0.005],
    humid: 0.01, humidSlope: [0.001, 0.01], humidAI: [1.5, 3],   // (on the same ratio as aridity)
    base: 0.002,
    // (the lattices: 40 km, 20 km … 1.25 km — lakes ~28 km … ~0.6 km across, nothing finer: below that a lake is a
    // pond, specks on any map; their area by octave falls 4^(2 − tau) per halving: Cael & Seekell 2016, tau ≈ 2.14)
    topKm: 40, octaves: 6, tau: 2.14,
    rho: 0.25,                  // a lake's radius as a share of its lattice's spacing (0.6–1.4 × this)
    stretch: 0.3,               // how far a lake may run long (its shore 1 ± this along an axis of its own)
    pixels: 5,                  // a lake drawn once it is this many pixels across (smaller ones are specks, not lakes)…
    worldPixels: 2.5,           // …on the world's picture this many (it is seen shrunk; the windows take over zoomed in)
    // (each lake a basin: its level the lowest ground just past its shore; its bowl this deep at its middle — 1 m and 7 m
    // more a km across, at most 60: ponds of a few hundred metres are 1–3 m deep, small glacial and thaw lakes a few km
    // across ~10–30 m. A 5 m floor made a 150 m pond a pit with 10 % walls, its hillshade a crater's crescent — the owner,
    // 2026-11-22, docs/small-lakes.md — its bank eased down to the level no steeper than bankSlope on average, out to
    // 1.5 … rim × its radius; a lake only where its level stands lipM + 1 m over the sea's)
    depthM: [1, 7, 60], lipM: 1, rim: 3, bankSlope: 0.008,
    // (a lake only where the ground holds one: round its shore the ground level within holdM[0] + holdM[1] per km across
    // — a slope of 0.6 %, 1 % for a 150 m pond — and none of it falling away past its bank; the owner, 2026-11-20: a lake
    // "on top of a mountain". A 3 m floor let a 150 m pond sit on a 2.6 % slope, its bank a 4 m cut into the uphill side
    // within half its radius: a crater's crescent under the hillshade — the owner, 2026-11-22, docs/small-lakes.md)
    holdM: [0.5, 6],
};

/**
 * Each land cell's expected share of small-lake area: a Uint8Array (share × unit) and the land's shares by process (%).
 * ctx: { mesh, z (km), ocean, lake (finish-hydro.js kinds), ice (today's ice caps), glaciated (the last ice age's),
 * iceH (its ice, km, or null), tAnn (°C), pAnn (mm a year), q (m³/s), cellKm2 }; F.pondScale (the Small lakes
 * slider: lake-amount.js) scales it, 0 none.
 */
export function pondShare(ctx, F) {
    const { mesh, z, ocean, lake, ice, glaciated, iceH, tAnn, pAnn, q, cellKm2 } = ctx, S = SMALL_LAKES;
    const { adjOffset, adjList, numCells: n } = mesh, share = new Uint8Array(n), cellKm = Math.sqrt(cellKm2), scale = F.pondScale ?? 1;
    const sums = { glacial: 0, thermokarst: 0, floodplain: 0, humid: 0, base: 0 };
    let land = 0;
    for (let c = 0; c < n; c++) {
        if (ocean[c] || !(pAnn[c] === pAnn[c])) continue;
        land++;
        if (lake[c] || ice[c] || !(scale > 0)) continue;
        const ai = pAnn[c] / Math.max(40, 20 * tAnn[c] + 280), wet = smooth(S.aridity[0], S.aridity[1], ai);
        if (!(wet > 0)) continue;
        let dz = 0, qn = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const a = adjList[k]; dz += Math.abs(z[c] - z[a]); if (!ocean[a] && q[a] > qn) qn = q[a]; }
        // (the belt's share of the cell: on the river's own cell up to all of it, what is wider spills half to each side)
        const beltKm = S.floodBeltKm * Math.sqrt(Math.max(0, q[c])), beltN = S.floodBeltKm * Math.sqrt(qn);
        const belt = Math.max(Math.min(1, beltKm / cellKm), Math.min(1, Math.max(0, beltN - cellKm) / (2 * cellKm)));
        const slope = dz / Math.max(1, adjOffset[c + 1] - adjOffset[c]) / cellKm;
        const g = glaciated[c] ? S.glacial * (1 - smooth(S.glacialSlope[0], S.glacialSlope[1], slope)) * (0.5 + 0.5 * smooth(S.glacialIceKm[0], S.glacialIceKm[1], iceH ? iceH[c] : 1)) : 0;
        const t = S.thermokarst * smooth(S.permafrostC[0], S.permafrostC[1], tAnn[c]) * (1 - smooth(S.thermokarstSlope[0], S.thermokarstSlope[1], slope));
        const f = S.floodplain * belt * (1 - smooth(S.floodSlope[0], S.floodSlope[1], slope));
        const h = S.humid * (1 - smooth(S.humidSlope[0], S.humidSlope[1], slope)) * smooth(S.humidAI[0], S.humidAI[1], ai);
        const parts = g + t + f + h + S.base, total = Math.min(S.maxShare, wet * parts * scale), k = total / parts;
        share[c] = Math.min(127, Math.round(total * S.unit));
        sums.glacial += g * k; sums.thermokarst += t * k; sums.floodplain += f * k; sums.humid += h * k; sums.base += S.base * k;
    }
    const stats = {};
    for (const key in sums) stats[key] = +(100 * sums[key] / Math.max(1, land)).toFixed(3);
    stats.total = +Object.values(stats).reduce((a, b) => a + b, 0).toFixed(3);
    return { share, stats };
}
