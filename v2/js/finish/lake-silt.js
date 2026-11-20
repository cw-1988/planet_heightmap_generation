// A lake's rivers fill it with what they wash off their catchment (owner, 2026-11-20: a lake behind a high rim drowned
// a whole lowland; "a curve that prevents lakes from growing too big while allowing smaller ones"). The sediment's
// volume is the catchment's area × lakeSiltKm, the ground its rivers took off it while the lake stood. It fills the
// shallow water first, a delta plain and floodplain built up to the lake's level: a broad, shallow lake loses most of its
// area, a deep one little (the Pannonian lake filled this way; the Po and Mesopotamian plains are filled lakes and gulfs).
// What water is left under lakeMinKm2 in a piece is filled too. The ground filled stands just above the water, so the
// rivers cross it to what is left.

const ABOVE_KM = 0.001;   // (filled ground: 1 m above the water)

/** Fills `water` (cell ids, a lake at `level` km) with `volumeKm3` of sediment, shallowest first; returns the water left. */
export function siltLake(water, level, volumeKm3, z, cellKm2, minKm2, adjOffset, adjList) {
    if (!(volumeKm3 > 0) || !water.length) return water;
    const byDepth = water.slice().sort((a, b) => z[b] - z[a]);
    let left = volumeKm3, i = 0;
    for (; i < byDepth.length; i++) {
        const v = (level - z[byDepth[i]]) * cellKm2;
        if (v > left) break;
        left -= v; z[byDepth[i]] = level + ABOVE_KM;
    }
    if (i === 0) return water;
    // (the water left, in pieces; one under minKm2 is filled too)
    const wet = new Set(byDepth.slice(i)), seen = new Set(), out = [];
    for (const s of wet) {
        if (seen.has(s)) continue;
        const piece = [s];
        seen.add(s);
        for (let k = 0; k < piece.length; k++) for (let a = adjOffset[piece[k]]; a < adjOffset[piece[k] + 1]; a++) {
            const nb = adjList[a];
            if (wet.has(nb) && !seen.has(nb)) { seen.add(nb); piece.push(nb); }
        }
        if (piece.length >= 2 && piece.length * cellKm2 >= minKm2) for (const x of piece) out.push(x);
        else for (const x of piece) z[x] = level + ABOVE_KM;
    }
    return out;
}
