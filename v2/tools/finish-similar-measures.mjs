// The measures finish-similar.mjs compares a fast finish by (docs/fast-mode.md), each with its limit. Both finishes are
// on the same mesh (the same cell count: terrain-mesh.js builds it the same every time), so cells compare one to one;
// the rivers are allowed to move by a cell or two, as they do when a flat's routing tips the other way.

/** The limits: `max` for a difference, `min` for a share that must hold. */
export const LIMITS = {
    landHeightRmsKm: { max: 0.03 },          // the land's heights, root mean square
    heightP99Km: { max: 0.2 },               // the worst 1 % of cells (a valley moved by a cell: its depth)
    seaChanged: { max: 0.002 },              // share of cells that turned sea or land
    riversKept: { min: 0.9 },                // the exact finish's rivers (≥ RIVER_KM2) with a fast river within a cell
    riversTrue: { min: 0.9 },                // … and the fast finish's with an exact one within a cell
    trunksKept: { min: 0.95 },               // the big rivers (≥ TRUNK_KM2), within two cells
    lakeArea: { max: 0.1 },                  // the lakes' area, relative
    tempMeanC: { max: 0.3 },                 // the year's mean temperature, mean difference (°C)
    tempP99C: { max: 1 },                    // … and its worst 1 % of cells
    rainMedian: { max: 0.03 },               // the year's rain on land, median relative difference
    rainMean: { max: 0.06 },                 // … and its mean
    koppenSame: { min: 0.97 },               // land cells with the same Köppen climate
};
const RIVER_KM2 = 1000, TRUNK_KM2 = 50000;

/** The measures of fast finish `b` against exact `a` (both: z, ocean, area, lakeLevel, koppen, tAnnual, pAnnual). */
export function compareFinishes(mesh, a, b) {
    const n = a.z.length, out = [];
    const put = (name, value) => out.push({ name, value, ...LIMITS[name] });
    let sq = 0, land = 0, sea = 0;
    const dz = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        dz[c] = Math.abs(a.z[c] - b.z[c]);
        if (!a.ocean[c]) { sq += dz[c] * dz[c]; land++; }
        if (a.ocean[c] !== b.ocean[c]) sea++;
    }
    put('landHeightRmsKm', Math.sqrt(sq / Math.max(1, land)));
    dz.sort();
    put('heightP99Km', dz[Math.floor(0.99 * (n - 1))]);
    put('seaChanged', sea / n);
    const riverA = rivers(a, RIVER_KM2), riverB = rivers(b, RIVER_KM2);
    put('riversKept', kept(mesh, riverA, near(mesh, riverB, 1)));
    put('riversTrue', kept(mesh, riverB, near(mesh, riverA, 1)));
    put('trunksKept', kept(mesh, rivers(a, TRUNK_KM2), near(mesh, rivers(b, TRUNK_KM2), 2)));
    let la = 0, lb = 0;
    for (let c = 0; c < n; c++) { if (a.lakeLevel[c] === a.lakeLevel[c]) la++; if (b.lakeLevel[c] === b.lakeLevel[c]) lb++; }
    put('lakeArea', la ? Math.abs(lb / la - 1) : lb ? 1 : 0);
    // (cells without a climate value, NaN in either finish, are left out; a cell whose height moved takes the lapse
    // rate's 6.5 °C per km with it, so the temperature's tail is judged at 99 %, not at its single worst cell)
    let tSum = 0, same = 0;
    const rel = [], dts = [];
    for (let c = 0; c < n; c++) {
        const dt = Math.abs(a.tAnnual[c] - b.tAnnual[c]);
        if (dt === dt) { tSum += dt; dts.push(dt); }
        if (a.ocean[c]) continue;
        if (a.koppen[c] === b.koppen[c]) same++;
        const dp = Math.abs(b.pAnnual[c] - a.pAnnual[c]) / Math.max(10, a.pAnnual[c]);
        if (dp === dp) rel.push(dp);
    }
    put('tempMeanC', tSum / Math.max(1, dts.length));
    const t = Float64Array.from(dts).sort();
    put('tempP99C', t.length ? t[Math.floor(0.99 * (t.length - 1))] : 0);
    const r = Float64Array.from(rel).sort();
    put('rainMedian', r.length ? r[r.length >> 1] : 0);
    put('rainMean', r.length ? r.reduce((s, v) => s + v, 0) / r.length : 0);
    put('koppenSame', land ? same / land : 1);
    return out;
}

/** 1 on the land cells draining at least `km2`. */
function rivers(f, km2) {
    const m = new Uint8Array(f.z.length);
    for (let c = 0; c < m.length; c++) if (!f.ocean[c] && f.area[c] >= km2 && f.lakeLevel[c] !== f.lakeLevel[c]) m[c] = 1;
    return m;
}

/** `mask` grown by `steps` rings of neighbours. */
function near(mesh, mask, steps) {
    const { adjOffset, adjList } = mesh;
    let cur = mask;
    for (let s = 0; s < steps; s++) {
        const next = cur.slice();
        for (let c = 0; c < cur.length; c++) if (cur[c]) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) next[adjList[k]] = 1;
        cur = next;
    }
    return cur;
}

/** The share of `mask`'s cells inside `within`. */
function kept(mesh, mask, within) {
    let all = 0, hit = 0;
    for (let c = 0; c < mask.length; c++) if (mask[c]) { all++; if (within[c]) hit++; }
    return all ? hit / all : 1;
}
