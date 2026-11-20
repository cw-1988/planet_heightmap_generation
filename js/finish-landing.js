// The finish landing in two steps (Generate, Import): the terrain first — its heights, sea, lakes, rivers and drain are
// final once the water is (finish.js onTerrain), ~40 % of the finish and its picture sooner — then the rest, the climate's,
// rocks' and farming's layers. The finished world keeps the terrain's picture, rivers and their caches (the same values),
// so what was made from them for the screen is not made again.

/** The terrain-only finished world: no climate or stats yet (`partial`: the layers that need them stay locked). The
 *  valleys' lines the worker drew for the page's rivers (`valleyQ`) go into the rivers' own cache (river-valleys.js
 *  riverLines), where the zoomed tiles look for them: not drawn again on the page's thread. */
export function terrainFin(cells, d) {
    if (d.lines) d.rivers._valleyLines = new Map([[d.valleyQ, d.lines]]);
    return { cells, raster: d.raster, rivers: d.rivers, drain: d.drain, climate: null, stats: null, partial: true };
}

/** The finished world — on the terrain's own picture, rivers and their drawn paths where it landed first. */
export function finishedFin(cells, res, before) {
    const early = before?.partial && before.cells === cells ? before : null;
    if (!early) return { cells, raster: res.raster, rivers: res.rivers, drain: res.drain, climate: res.climate, stats: res.stats };
    const { heightM, ocean, water, ...rest } = res.raster;
    return { cells, raster: Object.assign(early.raster, rest), rivers: early.rivers, drain: early.drain, climate: res.climate, stats: res.stats,
        paths: early.paths, segments: early.segments, grids: early.grids };
}
