// Lakes as water you see into (docs/lake-water.md): a lake's surface is flat at its level (finish-hydro.js lakeLevel, the
// spill height of its basin), its bed is the ground under it (the finished heights below that level), so its depth at a
// pixel is the level less the ground. Light crossing the water fades by Beer–Lambert, exp(−K·path), per colour — red
// first, blue last — down to the bed and back up (the path twice the depth). What is left shows the bed; what is lost is
// replaced by the colour of water too deep to see through, darker the deeper (the sea's own depth colours).

/** Diffuse attenuation, 1/m, red · green · blue: clear fresh water (pure water's own absorption, ~0.35 · 0.06 · 0.02,
 *  plus a little matter in it — an oligotrophic lake, Jerlov type I–II); a salt lake greener and murkier (brine,
 *  plankton, fine silt). The bed shows through to ~10–20 m in blue, a few metres in red. */
export const LAKE_WATER = { kFresh: [0.40, 0.075, 0.04], kSalt: [0.45, 0.12, 0.10], fallbackBlue: [70, 130, 200], deepKm: 0.6 };

/**
 * A lake pixel's colour into out[o…o+3]: the bed's colour `bed` (shaded already) seen through `depthM` of water over
 * `deep` (the colour of water too deep to see the bed); `salt` the salt lake's water. depthM NaN or ∞ (a picture without
 * its lakes' levels): the deep colour alone, as lakes were drawn before.
 */
export function lakeMix(out, o, deep, bed, depthM, salt) {
    const K = salt ? LAKE_WATER.kSalt : LAKE_WATER.kFresh, path = 2 * Math.max(0, depthM);
    for (let ch = 0; ch < 3; ch++) {
        const T = path === path ? Math.exp(-K[ch] * path) : 0;
        out[o + ch] = Math.min(255, deep[ch] * (1 - T) + bed[ch] * T);
    }
    out[o + 3] = 255;
}

/**
 * The colour of water too deep to see the bed, in a height palette (looks.js heightLutOf): the palette's own sea at the
 * lake's depth (its bathymetry, as the sea is drawn: the deeper the darker), or a plain blue darkening with depth for a
 * palette whose sea is not blue (Grey, Heightmap); a salt lake's turned toward teal. Into `rgb`, times the light `kk`.
 */
export function deepLakeRgb(lut, depthM, salt, kk, rgb) {
    const L = lut.rgb, d = depthM === depthM && depthM < Infinity ? Math.max(0, depthM) : 150;
    const j = 3 * Math.max(0, Math.min(lut.zero - 1, lut.zero - 1 - Math.round(d / lut.stepM)));
    const blueSea = L[3 * Math.max(0, lut.zero - 15) + 2] > L[3 * Math.max(0, lut.zero - 15)] + 20;
    for (let ch = 0; ch < 3; ch++) rgb[ch] = blueSea ? L[j + ch] : LAKE_WATER.fallbackBlue[ch] * (0.55 + 0.45 * Math.exp(-d / 1000 / LAKE_WATER.deepKm));
    if (salt) { rgb[0] = rgb[0] * 0.6 + 40; rgb[1] = rgb[1] * 0.75 + 55; rgb[2] = rgb[2] * 0.7 + 25; }
    for (let ch = 0; ch < 3; ch++) rgb[ch] *= kk;
    return rgb;
}

/** The Satellite's lake (climate-view.js): its bed the land's own colour from space there (S at s, in its light k) seen
 *  through depthM over `deep`, then its ice (ICE, share f) over it in a cold season. */
const satBed = [0, 0, 0];
export function satLake(out, o, deep, S, s, k, depthM, salt, ICE, f) {
    satBed[0] = S[s] * k; satBed[1] = S[s + 1] * k; satBed[2] = S[s + 2] * k;
    lakeMix(out, o, deep, satBed, depthM, salt);
    for (let ch = 0; ch < 3; ch++) out[o + ch] += (ICE[ch] - out[o + ch]) * f;
}

/** Of a pixel's four nearest picture pixels (a b c d, their weights), the lake one with the most weight: its kind into
 *  hit[0], its level (km) into hit[1]; 0 and NaN if none. For the enlargers (rasterAt, fineWindow): a pixel is lake where
 *  its own ground lies under that level, so the shore is the level's contour line on the ground, not a pixel's edge. */
export function nearestLake(water, level, a, b, c, d, wa, wb, wc, wd, hit) {
    let best = -1, bw = 0;
    if (water[a] && wa > bw) { best = a; bw = wa; }
    if (water[b] && wb > bw) { best = b; bw = wb; }
    if (water[c] && wc > bw) { best = c; bw = wc; }
    if (water[d] && wd > bw) { best = d; bw = wd; }
    hit[0] = best < 0 ? 0 : water[best]; hit[1] = best < 0 || !level ? NaN : level[best] / 1000;
    return hit;
}
