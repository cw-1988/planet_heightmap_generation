// The edge rivers as walls on the valleys' map (fork addition, for region-flood.js): the lines the map draws
// (region-lines.js edgeLines: the map's own river points and reaches, smoothed as the map smooths them), rasterised so
// no valley's flood reaches across one. The walls only keep the floods apart; the edge itself is the line
// (region-lines.js cutAlong, and the side test of the pick and the globe's shader).

import { edgeLines } from './region-lines.js';

/** A wall mask (1 on an edge river's line) for a W × H grid (rows from the south), drawn 4-connected so no diagonal step slips through. Kept on V. */
export function wallMask(w, V, W, H) {
    if (V._walls?.length === W * H) return V._walls;
    const M = new Uint8Array(W * H), S = edgeLines(w, V, W, H).seg;
    for (let k = 0; k < S.length; k += 4) draw(M, W, H, S[k], S[k + 1], S[k + 2], S[k + 3]);
    return (V._walls = M);
}

/** A segment into M, every pixel it passes through, each step to an edge neighbour. */
function draw(M, W, H, x0, y0, x1, y1) {
    let pi = NaN, pj = NaN;
    const put = (i, j) => { if (j >= 0 && j < H) M[j * W + ((i % W) + W) % W] = 1; };
    const steps = Math.max(1, Math.ceil(4 * Math.hypot(x1 - x0, y1 - y0)));
    for (let t = 0; t <= steps; t++) {
        const i = Math.floor(x0 + (x1 - x0) * t / steps), j = Math.floor(y0 + (y1 - y0) * t / steps);
        if (i === pi && j === pj) continue;
        if (pi === pi && i !== pi && j !== pj) put(i, pj);                      // (a diagonal step closed)
        put(i, j); pi = i; pj = j;
    }
}
