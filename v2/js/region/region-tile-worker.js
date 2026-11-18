// A zoom tile built off the page (fork addition): the region's ground drawn finer (region-refine.js), the region's
// drawn rivers cut in where they are drawn (region-relief.js carveRivers, no wander) with the water that comes in across
// the tile's edge, then worn down as a region is (region-wear.js), fewer rounds: the gullies and coves at this scale.

import { carveRivers } from './region-relief.js';
import { refineGround } from './region-refine.js';
import { wearDown, regionBuffers } from './region-wear.js';

const ROUNDS = 8;

self.onmessage = ({ data }) => {
    const { frame: F, parent: Fp, cut, waves, f, seed, rivers, box } = data, t = performance.now();
    const g = refineGround(F, Fp, cut, waves, f, seed);
    const inflow = carveRivers(F, rivers, g, Fp.cellKm, seed, 0);
    const w = wearDown(g, F, inflow, ROUNDS);
    const tile = { frame: F, h: g.h, ...w, T: g.T, P: g.P, rgb: g.rgb, box, f, ms: Math.round(performance.now() - t) };
    self.postMessage({ done: tile }, regionBuffers(tile));
};
