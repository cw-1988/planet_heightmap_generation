// The finish's domain warp of the terrain positions (finish.js F1): each position displaced by a smooth noise field
// (km-sized waves, three octaves) before the surface is read there. Per position only, so the terrain workers warp their
// own chunks (terrain-worker.js) instead of the finish's thread warping all of them first: the same values, bit for bit.

import { FastNoise } from '../core/fast-noise.js';

const R = 6371;

/** The warp's settings for a finish: { seed, km, scaleKm } (finish-config.js warpKm, warpScaleKm). */
export const surfaceWarp = (seed, F) => ({ seed, km: F.warpKm, scaleKm: F.warpScaleKm });

/** Warp the positions `xyz` (3 per point, unit sphere) in place, as `warp` (surfaceWarp) says. Returns xyz. */
export function warpInPlace(xyz, warp) {
    const n = xyz.length / 3, noise = new FastNoise((warp.seed | 0) * 53 + 11), f = R / warp.scaleKm, a = warp.km / R;
    for (let c = 0; c < n; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], w = xyz[3 * c + 2];
        const dx = noise.fbm(x * f + 1.3, y * f + 7.1, w * f + 4.2, 3, 0.5), dy = noise.fbm(x * f + 9.4, y * f + 2.6, w * f + 6.8, 3, 0.5), dz = noise.fbm(x * f + 5.7, y * f + 8.3, w * f + 0.9, 3, 0.5);
        let px = x + 1.6 * a * dx, py = y + 1.6 * a * dy, pz = w + 1.6 * a * dz;
        const l = Math.hypot(px, py, pz); px /= l; py /= l; pz /= l;
        xyz[3 * c] = px; xyz[3 * c + 1] = py; xyz[3 * c + 2] = pz;
    }
    return xyz;
}
