// The lakes' shore when enlarged (docs/lake-water.md, lake-water.js lakeHere): a diagonal staircase of lake pixels on a
// coarse picture, enlarged 8× by its four nearest pixels, the ground everywhere 5 m under the lake's level (finer detail
// that sinks just under it). Prints the enlarged lake: the old rule (any lake neighbour: the pixels' square steps) beside
// the shore rule. Run: node v2/tools/lake-shore-demo.mjs

import { nearestLake, lakeHere } from '../js/evolution/lake-water.js';

const W = 6, S = 8, water = new Uint8Array(W * W), level = new Float32Array(W * W).fill(1000);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (x + y <= 5) water[y * W + x] = 1;
const hit = [0, NaN, 0], ground = 1 - 0.005;
const rows = [];
for (let Y = 0; Y < (W - 1) * S; Y++) {
    let oldRow = '', newRow = '';
    for (let X = 0; X < (W - 1) * S; X++) {
        const fx = X / S, fy = Y / S, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const a = y0 * W + x0, b = a + 1, c = a + W, d = c + 1;
        nearestLake(water, level, a, b, c, d, (1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty, hit);
        oldRow += hit[0] ? '#' : '.';
        newRow += hit[0] && lakeHere(hit[1], ground, hit[2]) ? '#' : '.';
    }
    rows.push(`${oldRow}   ${newRow}`);
}
console.log('old (any lake neighbour)                   shore rule\n' + rows.join('\n'));
