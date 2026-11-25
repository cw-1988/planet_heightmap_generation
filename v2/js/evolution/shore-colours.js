// The shore's colours in the palette shown (docs/beach-look.md): a beach, a cliff, flats and marsh drawn in the
// palette's own colours, not fixed ones. A fixed pale sand (200·188·154) sat on the Relief's dark lowland green as a
// colour from another map (the owner, 2026-11-20: "you should pick the beach and coast colors from the relief colour
// palette"). Each colour is taken from the palette's own land ramp, so it sits in the palette's light and tone.

import { toLinear, toOklab } from './looks.js';

const SHORE_PICK = {
    sandKm: [0, 2],        // the sand: the palette's warmest light colour over its lowlands (km: up to 3 picked the
                           // ember-lit heights of Volcanic, not its black sand)
    sandHue: 75,           // … nearest this hue (OKLab degrees: a tan, between yellow and orange)
    hueFall: 16,           // … falling off as cos^this away from it (25° away counts 20%: at cos^8 the Relief's khaki
                           // at 1 km, dry grass, beat its tan)
    warmC: 0.025,          // … at full warmth from this chroma (along the hue: at 0.05 a dark brown beat a pale cream)
    rockKm: [1, 5],        // the rock: the palette's greyest colour over these heights, near mid light
    rockL: 0.6,
};
const P = SHORE_PICK, cache = new WeakMap();
const at = (L, i) => [L[3 * i], L[3 * i + 1], L[3 * i + 2]];
const lab = c => toOklab(c.map(toLinear));
const lerp = (a, b, t, k = 1) => [0, 1, 2].map(ch => (a[ch] + (b[ch] - a[ch]) * t) * k);

/** Each palette entry over [km0, km1] of a height table (looks.js heightLutOf), every 50 m. */
function* entries(lut, [km0, km1]) {
    for (let m = km0 * 1000; m <= km1 * 1000; m += 50) {
        const i = Math.min(lut.n - 1, lut.zero + Math.round(m / lut.stepM));
        yield { c: at(lut.rgb, i), lab: lab(at(lut.rgb, i)) };
    }
}

/** The best of a palette's entries by score (the first on a tie). */
function best(lut, range, score) {
    let top = null, s = -Infinity;
    for (const e of entries(lut, range)) { const v = score(e.lab); if (v > s) { s = v; top = e.c; } }
    return top;
}

/**
 * The shore's colours in a height palette: { sand, mud, marsh, rock, mangrove, gravel } (littoral.js paintLittoral). Sand
 * the palette's warmest light land colour (a palette with none warm gets its rock); rock its greyest at
 * mid light; the marsh its lowland toward the rock; the flats the sand and the rock, wet; the mangroves its lowland, dark.
 */
export function shoreColours(lut) {
    if (cache.has(lut)) return cache.get(lut);
    const h0 = (P.sandHue * Math.PI) / 180;
    const warmth = ([, a, b]) => Math.min(1, Math.hypot(a, b) * Math.max(0, Math.cos(Math.atan2(b, a) - h0)) ** P.hueFall / P.warmC);
    const warm = best(lut, P.sandKm, c => c[0] * warmth(c));
    const rock = best(lut, P.rockKm, ([L, a, b]) => -Math.hypot(a, b) - 0.3 * Math.abs(L - P.rockL));
    // (a palette with no tan in its lowlands — Lush, Frozen, Grey — gets its rock as sand: its lightest was its green)
    const sand = warmth(lab(warm)) >= 0.5 ? warm : rock;
    const low = at(lut.rgb, lut.zero);
    const rgb = {
        sand, rock,
        marsh: lerp(low, rock, 0.3, 0.9),
        mud: lerp(sand, rock, 0.5, 0.75),
        mangrove: lerp(low, low, 0, 0.65),
        gravel: lerp(sand, rock, 0.7),
    };
    cache.set(lut, rgb);
    return rgb;
}
