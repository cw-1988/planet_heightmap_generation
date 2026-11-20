// A river's shape from its flow and slope, by the laws measured on real rivers (fork addition; docs/river-shape-laws.md),
// in place of shapes set by eye (2026-11-20). Shared by the meanders (river-meander.js), the valleys (river-valleys.js)
// and the page's drawn rivers (river-draw.js). q the flow (m³/s), lengths km unless named.

/** Hydraulic geometry, at-a-station bankfull across rivers worldwide (Moody & Troutman 2002, after Leopold & Maddock
 *  1953): width 7.2 m · q^0.50, depth 0.27 m · q^0.39 — 40 m³/s ~46 m wide and 1.1 m deep, 1,000 ~230 m and 4.0 m,
 *  200,000 (the Amazon) ~3.2 km and 31 m. widthMax only bounds the page's margins. */
export const CHANNEL = { widthK: 0.0072, widthExp: 0.5, depthK: 0.00027, depthExp: 0.39, widthMax: 3.5 };
export const channelKm = q => Math.min(CHANNEL.widthMax, CHANNEL.widthK * Math.max(0, q) ** CHANNEL.widthExp);
export const channelDepthKm = q => CHANNEL.depthK * Math.max(0, q) ** CHANNEL.depthExp;

/** Meander geometry (Leopold & Wolman 1960): a bend's wave length ~10.9 channel widths, its belt (one side to the other)
 *  ~2.7 widths — each side 1.35 / 10.9 of the wave's length; longer waves (the valley's own bends) swing by the same share. */
export const MEANDER_LAW = { perWidth: 10.9, share: 1.35 / 10.9 };

/** Where a river meanders: below Leopold & Wolman's (1957) slope, 0.013 · q^-0.44, a single channel winds; above it the
 *  river braids or, steeper still, runs as a mountain torrent in its valley — straight, no bends of its own. */
export const braidSlope = q => 0.013 * Math.max(1e-3, q) ** -0.44;
/** How much of its own bends a river of flow q keeps on a slope (m/m): 1 well below the threshold, 0 well above it. */
export function meanderShare(q, slope) {
    const b = braidSlope(q), t = Math.min(1, Math.max(0, (slope - 0.5 * b) / b));
    return 1 - t * t * (3 - 2 * t);
}

/** The valleys' sides: hillslopes stand at most at the threshold angle of soil and broken rock (~35°, tan 0.7: Roering
 *  et al. 1999, Montgomery 2001), reached at the bank; the wall eases to the land at its rim, so its mean slope is half. */
export const VALLEY_LAW = { steepest: 0.7 };
