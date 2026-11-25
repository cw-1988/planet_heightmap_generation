// The sea's own history on the coast (docs/raised-shorelines.md): the sea stood ~120 m lower in the last ice age and rose
// to today's level ~7,000 years ago. Where the land has stayed put since, the rising sea drowned the lower valleys the
// rivers had cut to the old shore — rias, long branching inlets up the valleys. Where the land rises — an active margin
// lifted by its plates, or ground freed of an ice sheet's weight rebounding — old shores stand above the sea as raised
// beaches and marine terraces: flat steps cut by the waves, a few tens of metres apart, risers between them. Both on a
// fine window's margin grid (fine-detail.js), near the coast only.

import { smoothNoise } from './lattice-noise.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const HISTORY = {
    riaDepthKm: 0.035, riaKm: [2.5, 6],       // a ria: how far the sea has risen into a valley's floor at the coast; faded out this far inland (km)
    riaMud: [0.3, 0.8],                        // … less where the rivers' mud has filled the drowned valley (an estuary's flats, a delta)
    scour: [0.1, 0.6],                         // ground freed of an ice sheet this thick rebounds (the scour driver, none … all)
    activeYoung: 0.4,                          // an active margin rises: this much while its belt has stopped rising, all while it still does
    stepTectKm: 0.025, stepIceKm: 0.015,       // a terrace's step: on a margin lifted by its plates (km), on ground rebounding from its ice
    terraceKm: [3, 4.5], levels: 3,            // terraces out to this far inland (km, all … none); at most this many above the sea
    shoreKm: 1,                                // … eased in over this far from the picture's coastline (km)
    slope: [0.15, 0.3],                        // none on ground steeper than this (km per km, all … none: a cliff)
    bench: 0.25,                               // how much of a step is bench and riser, the riser eased over the whole step (the rest an even rise)
    tiltKm: 40, tilt: 0.25,                    // the old shores tilted by uneven uplift: their height wanders ±this share over this length
    warpKm: 5, warp: 0.3,                      // … and ±this share over this length: a bench crosses the slope's contours, not along one
    patchKm: 7, patch: [0, 0.5],               // a terrace runs in stretches this long (noise none … all): cut by gullies, buried by slopes
    fadeKm: 1,                             // drawn once the pixels hold a feature this wide
};
const Hs = HISTORY;

/**
 * Each pixel near the coast: how much it has risen (emerge, 0 … 1), the step between its old shores (km) and how far the
 * sea has risen into its valleys (drown, km: carveValleys). ctx: { ew, eh, at, val, d (the drivers), coastKm, seaB }.
 * @returns {{emerge: Float32Array, step: Float32Array, drown: Float32Array}|null}  null without the drivers it reads
 */
export function coastHistory({ ew, eh, at, val, d, coastKm, seaB }) {
    if (!d.active || !d.scour) return null;
    const N = ew * eh, emerge = new Float32Array(N), step = new Float32Array(N), drown = new Float32Array(N), far = Math.max(Hs.riaKm[1], Hs.terraceKm[1]);
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, x = coastKm[p];
        if (seaB[p] || !(x >= 0 && x < far)) continue;
        at(j, i);
        const et = val(d.active) * (Hs.activeYoung + (1 - Hs.activeYoung) * (d.young ? val(d.young) : 0)), eg = smooth(Hs.scour[0], Hs.scour[1], val(d.scour));
        const e = Math.max(et, eg);
        emerge[p] = e;
        step[p] = et + eg > 0 ? (Hs.stepTectKm * et + Hs.stepIceKm * eg) / (et + eg) : Hs.stepTectKm;
        // (a ria where the land has not risen; a fjord's cold coast is the carve's own, and a muddy river fills its valley)
        const cold = d.cold ? val(d.cold) : 0, fill = d.muddy ? smooth(Hs.riaMud[0], Hs.riaMud[1], val(d.muddy)) : 0;
        drown[p] = Hs.riaDepthKm * (1 - e) * (1 - cold) * (1 - 0.7 * fill) * (1 - smooth(Hs.riaKm[0], Hs.riaKm[1], x));
    }
    return { emerge, step, drown };
}

/**
 * The raised shores cut into the detail D (km, over the enlarged picture hb), on land near the coast where it has risen:
 * each old shore a gentle swell at a multiple of the step above today's sea, in stretches, every weight falling off across
 * the ground and never with height (a hillshade draws any narrow switch as a contour line), at most `levels` of them,
 * faded by the pixels. ctx: { hb, seaB, coastKm, gE, gN,
 * hist (coastHistory), ew, eh, place, P, seed, fade }.
 */
export function raiseTerraces(D, { hb, seaB, coastKm, gE, gN, hist, ew, eh, place, P, seed, fade }) {
    const fT = fade(Hs.fadeKm);
    if (!hist || !(fT > 0)) return;
    const { emerge, step } = hist, sc = 1 / Hs.tiltKm, sw = 1 / Hs.warpKm, sp = 1 / Hs.patchKm;
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, x = coastKm[p], e = emerge[p];
        if (seaB[p] || !(e > 0.05) || !(x >= 0 && x < Hs.terraceKm[1])) continue;
        // (the steps cut into the picture's own smooth rise from the coast, not into its finer detail: a bench is a shore,
        // running along the coast. Stepping the detail's height too stepped every knoll near an active coast into rings of
        // contour lines — the owner, 2026-11-20: "wtf is this?")
        // (every weight here falls off across the ground, never with height: a fade over a few tens of metres of height is a
        // band a few tens of metres wide on a steep flank, and the detail calmed inside it drew a contour line there)
        const dH = step[p], h = hb[p];
        // (and eased in from the picture's coastline: nothing is done on its sea side, and at full weight from its first land
        // pixel on the calm switched there at a stroke — a line along the coast on the land, wherever the waves and the
        // wiggle had moved the drawn coast out past it)
        const w = fT * e * smooth(0, Hs.shoreKm, x) * (1 - smooth(Hs.terraceKm[0], Hs.terraceKm[1], x)) * (1 - smooth(Hs.slope[0], Hs.slope[1], Math.hypot(gE[p], gN[p])));
        if (!(w > 0.01)) continue;
        place(j, i);
        // (in stretches along the coast, never a whole ring: the old shores ran round a risen island as rings in rings of
        // contour lines — the owner, 2026-11-20: "fix the obvious flaw")
        const wp = w * smooth(Hs.patch[0], Hs.patch[1], smoothNoise(P[0] * sp, P[1] * sp, P[2] * sp, seed * 5 + 93));
        if (!(wp > 0.01)) continue;
        // (the old shore's height here, tilted slowly along the coast and wandering across the slope's contours)
        const k = dH * (1 + Hs.tilt * smoothNoise(P[0] * sc, P[1] * sc, P[2] * sc, seed * 5 + 91) + Hs.warp * smoothNoise(P[0] * sw, P[1] * sw, P[2] * sw, seed * 5 + 92)), t = h / k;
        D[p] *= 1 - 0.5 * wp;
        if (!(t >= 1) || t > Hs.levels + 1) continue;
        // (the bench planed by the waves: above, the finer detail calmed over the whole stretch — calmed from a height on,
        // at a stroke or eased over half a step, the detail dropped along one contour and the hillshade drew it as a ring
        // round every risen island, or as streaks on a steep flank. Here the step, part of it, eased over the whole step:
        // a flat bench and a riser twice the slope drew each old shore as a contour line; the owner, 2026-11-20. The
        // levels' end faded over the top step's own rise, so the offset, at most a few metres, ends at zero)
        const n = Math.floor(t), f = t - n, stair = k * (n + Hs.bench * smooth(0, 1, f) + (1 - Hs.bench) * f);
        D[p] += wp * (1 - smooth(Hs.levels, Hs.levels + 1, t)) * (stair - h);
    }
}
