// A first sketch of a world, sent the moment its land and sea are known (js/planet-worker.js, after the plates are
// projected): the ground raised by distance from the coast — land rising inland, the sea deepening offshore — with a
// little rolling relief, and its hillshade. The page shows it (js/main.js) until the present-day world itself arrives,
// so a new planet never starts as an empty sphere. Nothing of it is kept: the world built after replaces it whole.

import { hillshade } from '../v2/js/view/terrain-shade.js';

const R_KM = 6371;

/** Hops from the coast for every cell (a breadth-first walk from both sides of each shore). */
function coastHops(tm, land) {
    const { numCells: n, adjOffset, adjList } = tm, hops = new Int32Array(n).fill(-1), queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (let c = 0; c < n; c++) {
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (land[adjList[k]] !== land[c]) { hops[c] = 0; queue[tail++] = c; break; }
    }
    while (head < tail) {
        const c = queue[head++];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const d = adjList[k];
            if (hops[d] < 0 && land[d] === land[c]) { hops[d] = hops[c] + 1; queue[tail++] = d; }
        }
    }
    return hops;
}

/** Smooth rolling relief in [-1, 1]: a few sine waves across the sphere, phased by the seed. */
function rolling(x, y, z, seed) {
    let s = 0, f = 3, a = 1, ph = seed % 997;
    for (let i = 0; i < 4; i++, f *= 2.1, a *= 0.5, ph += 1.7) s += a * Math.sin(f * x + ph) * Math.sin(f * y + 2.3 * ph) * Math.sin(f * z + 0.7 * ph);
    return s;
}

/** The sketch's heights (km) and hillshade on the terrain mesh `tm`; `land[c]` 1 on land. */
export function sketchGround(tm, land, seed) {
    const n = tm.numCells, hops = coastHops(tm, land), heightKm = new Float32Array(n), xyz = tm.xyz;
    const hopKm = Math.sqrt(4 * Math.PI * R_KM * R_KM / n);                       // (a cell's width)
    for (let c = 0; c < n; c++) {
        const km = (hops[c] < 0 ? 4000 : hops[c] + 0.5) * hopKm, r = rolling(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], seed);
        heightKm[c] = land[c]
            ? 0.05 + 1.1 * (1 - Math.exp(-km / 350)) * (0.75 + 0.5 * r) + 0.6 * Math.max(0, r) * (1 - Math.exp(-km / 600))
            : -0.15 - 3.9 * (1 - Math.exp(-km / 220)) * (0.9 + 0.15 * r);
    }
    return { heightKm, shade: hillshade(tm, heightKm) };
}
