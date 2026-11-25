// Lakes as water you see into (docs/lake-water.md): a lake's surface is flat at its level (finish-hydro.js lakeLevel, the
// spill height of its basin), its bed is the ground under it (the finished heights below that level), so its depth at a
// pixel is the level less the ground. Light crossing the water fades by Beer–Lambert, exp(−K·path), per colour — red
// first, blue last — down to the bed and back up (the path twice the depth). What is left shows the bed; what is lost is
// replaced by the colour of water too deep to see through, darker the deeper (the sea's own depth colours).

/** Diffuse attenuation, 1/m, red · green · blue: a typical fresh lake (pure water takes red first, ~0.35 · 0.06 · 0.02,
 *  but the matter in a lake — humus, plankton, silt — takes green and blue nearly as fast); a salt lake greener and
 *  murkier (brine, plankton, fine silt). The bed shows through to ~5–6 m in green and blue, a few metres in red.
 *  (Until 2026-11-22 fresh was clear-water [0.40, 0.075, 0.04]: the bed's red gone while its green showed to ~15 m, a
 *  yellow-green then green ring round every lake before the deep blue. The owner: "the transition … doesnt really look
 *  good", docs/lake-water.md.) */
export const LAKE_WATER = { kFresh: [0.40, 0.22, 0.18], kSalt: [0.45, 0.12, 0.10], fallbackBlue: [70, 130, 200], deepKm: 0.6,
    shoreM: 15 };   // (lakeHere: half a picture pixel out of the lake, the ground 15 m under the level; a tenth out, 135 m)

/**
 * A lake pixel's colour into out[o…o+3]: the bed's colour `bed` (shaded already) seen through `depthM` of water over
 * `deep` (the colour of water too deep to see the bed); `salt` the salt lake's water. depthM NaN or ∞ (a picture without
 * its lakes' levels): the deep colour alone, as lakes were drawn before. The painters hand it the depth seen (shore-ramp.js
 * seenDepthM: held under a ramp from the shore), `deep` at the true one. `K`: another water's attenuation (the sea's).
 * `a`: how much of the water shows over the bed at all (shore-ramp.js shoreOpacity: 0 at the shore, 1 past its ramp).
 */
export function lakeMix(out, o, deep, bed, depthM, salt, K = salt ? LAKE_WATER.kSalt : LAKE_WATER.kFresh, a = 1) {
    const path = 2 * Math.max(0, depthM);
    for (let ch = 0; ch < 3; ch++) {
        const T = path === path ? Math.exp(-K[ch] * path) : 0;
        out[o + ch] = Math.min(255, bed[ch] + (deep[ch] * (1 - T) + bed[ch] * T - bed[ch]) * a);
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
    const j = 3 * Math.max(0, Math.min(lut.zero - 1, lut.zero - 1 - Math.round(d / lut.stepM))), blue = blueSea(lut);
    for (let ch = 0; ch < 3; ch++) rgb[ch] = blue ? L[j + ch] : LAKE_WATER.fallbackBlue[ch] * (0.55 + 0.45 * Math.exp(-d / 1000 / LAKE_WATER.deepKm));
    if (salt) { rgb[0] = rgb[0] * 0.6 + 40; rgb[1] = rgb[1] * 0.75 + 55; rgb[2] = rgb[2] * 0.7 + 25; }
    for (let ch = 0; ch < 3; ch++) rgb[ch] *= kk;
    return rgb;
}

/** Whether a height palette's sea is blue water (its 150 m deep entry bluer than red): not Grey's or Heightmap's — those
 *  draw no water to see into. */
export function blueSea(lut) {
    const j = 3 * Math.max(0, lut.zero - 15);
    return lut.rgb[j + 2] > lut.rgb[j] + 20;
}

/** The Satellite's lake (climate-view.js): its bed the land's own colour from space there (S at s, in its light k) seen
 *  through depthM over `deep` (the water's share a: shore-ramp.js shoreOpacity), then its ice (ICE, share f) over it in a
 *  cold season. */
const satBed = [0, 0, 0];
export function satLake(out, o, deep, S, s, k, depthM, salt, ICE, f, a = 1) {
    satBed[0] = S[s] * k; satBed[1] = S[s + 1] * k; satBed[2] = S[s + 2] * k;
    lakeMix(out, o, deep, satBed, depthM, salt, undefined, a);
    for (let ch = 0; ch < 3; ch++) out[o + ch] += (ICE[ch] - out[o + ch]) * f;
}

/** Of a pixel's four nearest picture pixels (a b c d, their weights), the lake one with the most weight: its kind into
 *  hit[0], its level (km) into hit[1], and the lake pixels' share of the weight (0 … 1) into hit[2]; 0, NaN and 0 if none.
 *  For the enlargers (rasterAt, fineWindow), with lakeHere. skip: the picture's small-lake bytes — a pixel marked +128
 *  is a small lake the window redraws at its own detail (small-lakes.js), not counted. */
export function nearestLake(water, level, a, b, c, d, wa, wb, wc, wd, hit, skip = null) {
    let best = -1, bw = 0, share = 0;
    if (water[a] && !(skip && skip[a] & 128)) { share += wa; if (wa > bw) { best = a; bw = wa; } }
    if (water[b] && !(skip && skip[b] & 128)) { share += wb; if (wb > bw) { best = b; bw = wb; } }
    if (water[c] && !(skip && skip[c] & 128)) { share += wc; if (wc > bw) { best = c; bw = wc; } }
    if (water[d] && !(skip && skip[d] & 128)) { share += wd; if (wd > bw) { best = d; bw = wd; } }
    hit[0] = best < 0 ? 0 : water[best]; hit[1] = best < 0 || !level ? NaN : level[best] / 1000; hit[2] = share;
    return hit;
}

/**
 * Whether an enlarged pixel is lake: its ground (km) under the nearest lake's level (km), by more the farther it is
 * out of the picture's lake (its share: 1 inside, falling to 0 a picture pixel past the last lake pixel). Inside, any
 * ground under the level is lake: the shore is the level's contour on the ground, finer detail included. Out at the
 * lake's edge the ground must lie deeper and deeper under the level, so the shore closes along a smooth line — ground
 * the finer detail sinks under the level just past the picture's lake no longer floods up to the pixels' square edge.
 */
export function lakeHere(levelKm, groundKm, share) {
    return lakeMarginKm(levelKm, groundKm, share) > 0;
}

/** By how much (km) an enlarged pixel passes lakeHere: the water's depth inside the picture's lake, less and less toward
 *  its edge; ≤ 0 is land. Whatever is done to a lake's bed (fine-detail.js's flattening) fades by this, never by "a lake
 *  pixel is near": that reached a picture pixel past the shore and stopped on the pixels' square grid — a flat band of
 *  land round every lake with stair-step edges (the owner, 2026-11-20: "wtf is this lake to terrain edge?"). */
export function lakeMarginKm(levelKm, groundKm, share) {
    return share > 0 ? share * (levelKm - groundKm) - LAKE_WATER.shoreM * (1 - share) / 1000 : -Infinity;
}
