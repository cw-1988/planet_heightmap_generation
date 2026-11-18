// The valleys' edges with no river under them, tidied (fork addition, for region-grid.js). The flood (region-flood.js)
// runs up every gully a pixel or two wide from the valley it drains into, so such an edge came out a comb of fingers up
// to a cell long, each drawn as a rounded nose (owner, 2026-11-18: "what are those weird noses?"). True to the pixels'
// drainage, not to the ridge a valley is made of; blurring the heights first made it worse (the slopes flattened, the
// floods met by queue order: 8 % more edge). So each pixel on such an edge takes the valley with the most weight of the
// land round it, a few passes: a finger or notch narrower than the window goes, a valley's own shape stays. The window is
// round and its weight falls off with distance (a Gaussian of SIGMA): a square one of equal votes pulled edges into rows
// and columns and off their ridges (owner, 2026-11-18: "weird rectangular shapes"; edges across a slope 20.1 % of their
// length against the flood's 18.2 %, this one 18.2 %, and 499 px of finger left against its 556). Near an edge river
// (within R of its wall) nothing changes and the wall's pixels cast no vote, so no valley reaches across a river; the
// sea casts none either, so the coast stays the map's.

const R = 2;        // (px: the window's reach, a disc)
const SIGMA = 1;    // (px: the votes' fall-off)
const PASSES = 8;   // (a pass rounds a finger's tip by about a pixel)
const WINDOW = [];  // ([di, dj, weight] of the disc)
for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) if (a * a + b * b <= R * R + R) WINDOW.push([a, b, Math.exp(-(a * a + b * b) / (2 * SIGMA * SIGMA))]);

/** G (rows from the south; −1 the sea) tidied in place along its edges away from the walls M (region-walls.js). */
export function tidyEdges(G, M, W, H) {
    const N = W * H, fixed = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
        if (!M[p]) continue;
        const i = p % W, j = (p - i) / W;
        for (let b = Math.max(0, j - R); b <= Math.min(H - 1, j + R); b++) for (let a = i - R; a <= i + R; a++) fixed[b * W + ((a % W) + W) % W] = 1;
    }
    const ids = new Int32Array(WINDOW.length), wt = new Float64Array(WINDOW.length);
    for (let pass = 0; pass < PASSES; pass++) {
        const set = [];
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const p = j * W + i, u = G[p];
            if (u < 0 || fixed[p] || !onEdge(G, p, i, j, W, H)) continue;
            let k = 0;
            for (const [a, b, x] of WINDOW) {
                if (j + b < 0 || j + b >= H) continue;
                const q = (j + b) * W + ((i + a) % W + W) % W, v = G[q];
                if (v < 0 || M[q]) continue;
                let m = 0;
                while (m < k && ids[m] !== v) m++;
                if (m === k) { ids[k] = v; wt[k++] = 0; }
                wt[m] += x;
            }
            let best = u, most = 0, mine = 0;
            for (let m = 0; m < k; m++) { if (ids[m] === u) mine = wt[m]; if (wt[m] > most) { most = wt[m]; best = ids[m]; } }
            if (best !== u && most > mine) set.push(p, best);
        }
        if (!set.length) return;
        for (let k = 0; k < set.length; k += 2) G[set[k]] = set[k + 1];
    }
}

/** Whether a land pixel borders another valley (4 neighbours, east–west round the planet). */
function onEdge(G, p, i, j, W, H) {
    const u = G[p], e = G[j * W + (i + 1) % W], w = G[j * W + (i + W - 1) % W];
    return (e >= 0 && e !== u) || (w >= 0 && w !== u) || (j > 0 && G[p - W] >= 0 && G[p - W] !== u) || (j < H - 1 && G[p + W] >= 0 && G[p + W] !== u);
}
