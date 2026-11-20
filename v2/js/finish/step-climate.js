// The climate of a Detail ladder step's water (finish-worker.js terrainOnly; js/rung-view.js; docs/progressive-detail.md).
// The climate is calculated on a lat-lon grid, so it is the same planet's at every detail: the build's first step with
// water calculates it on a grid about as fine as its own cells (the grid step nearest the cells' spacing: 3° at 5K cells,
// 1° from ~26K), and every later step reuses that grid, finishing only its last part again — each cell's own months from
// the grid's, at the step's own heights (core.js cellClimate). ~7 s at 1°, ~1.1 s at 3°, a few ms to reuse: the steps'
// water follows each other seconds apart. Only the rivers' rain comes from it, not their courses (the ground's slopes);
// the world's own finish calculates its own, at 1°. The worker lives one build (rung-view.js cancels it as the world
// lands), and the grid with it.

import { planetClimate } from '../climate/climate.js';
import { cellClimate, cellLatLon } from '../climate/core.js';

const STEPS = [3, 2, 1.5, 1];                                    // (grid steps, degrees, that divide 180 and 360)
let kept = null;                                                 // ({key, res}: this build's grid)

/** planetClimate's call and result, for a step: the build's grid reused, or calculated as fine as the step's cells. */
export function stepClimate(input, options = {}) {
    const n = input.elevKm.length, key = JSON.stringify(options);
    if (kept?.key === key) {
        const lat = new Float32Array(n), lon = new Float32Array(n), land = new Uint8Array(n);
        cellLatLon(input.xyz, input.axes, lat, lon);
        for (let c = 0; c < n; c++) land[c] = input.elevKm[c] > 0 ? 1 : 0;
        return { ...kept.res, cell: cellClimate({ ...kept.res, cell: { lat, lon } }, input.xyz, input.elevKm, land, options) };
    }
    const spacingDeg = Math.sqrt(4 * Math.PI / n) * 180 / Math.PI;
    const gridStepDeg = STEPS.reduce((a, s) => Math.abs(s - spacingDeg) < Math.abs(a - spacingDeg) ? s : a);
    const res = planetClimate(input, { ...options, gridStepDeg });
    kept = { key, res: { ...res, cell: null } };
    return res;
}
