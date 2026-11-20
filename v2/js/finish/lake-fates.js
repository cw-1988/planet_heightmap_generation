// What became of the land's hollows (the hydrology's stats, `water.fates`): why a hollow the map can show is or is not a
// lake. Per fate, the hollows' count and their full area (km²), all of them and those within lowLatDeg of the equator
// (where no ice age scoured lake districts). Fates:
// - noOrigin: neither glacial nor tectonic (a fan, loess or a dissected floor damming a valley): cut through.
// - tooSmall: under lakeMinKm2, two cells or lakeMinDepthM.
// - drained: a gorge cut from a basin upstream already runs through it below its rim.
// - filled: kept by its river, but its sediment filled it (or what was left was under lakeMinKm2).
// - lake / salt / pan: what is there.

const LOW_LAT_DEG = 35;

/** The tally: { all: { fate: [count, km²] }, low: { … } } over the hollows of two cells or more. */
export function hollowFates(hollows, lat, cellKm2, Water) {
    const all = {}, low = {};
    const add = (t, f, km2) => { const e = (t[f] ??= [0, 0]); e[0]++; e[1] += Math.round(km2); };
    for (const h of hollows) {
        if (h.cells.length < 2) continue;
        const fate = !h.origin ? 'noOrigin' : !h.lake ? 'tooSmall' : h.kind === Water.FRESH ? 'lake' : h.kind === Water.SALT ? 'salt'
            : h.kind === Water.PAN ? 'pan' : h.drained ? 'drained' : 'filled';
        const km2 = h.cells.length * cellKm2;
        add(all, fate, km2);
        let la = 0;
        if (lat) { for (const c of h.cells) la += lat[c]; la /= h.cells.length; }
        if (lat && Math.abs(la) < LOW_LAT_DEG) add(low, fate, km2);
    }
    return { all, low };
}
