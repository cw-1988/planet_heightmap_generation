// A zoom tile's ground (fork addition): a piece of an opened region drawn again at a finer cell, in the region's own
// projection. Its heights are the region's (worn down, with their valleys and coasts) read smoothly (bicubic), plus the
// region's detail noise carried on down its own octave ladder (region-relief.js detailWaves: the same seed and waves,
// only the ones finer than the region's cells), so the tile is the region's ground with more of it showing, not a new
// one. The sea, the lakes, the climate and the colour from space are the region's, read smoothly; the climate takes the
// added height down the lapse rate. region-tile-worker.js cuts the region's rivers in and wears it down.

import { placeAt, cellXY, xyCell, bicubic, R } from './region-frame.js';
import { detailWaves } from './region-relief.js';

const D = Math.PI / 180;

/** Bilinear across `A` (w × h, `per` values a pixel, value `k`) at the fractional pixel (fx, fy), held at the edges. */
function bilinear(A, w, h, fx, fy, per = 1, k = 0) {
    fx = Math.min(w - 1.001, Math.max(0, fx)); fy = Math.min(h - 1.001, Math.max(0, fy));
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y, c = y * w + x;
    return (A[c * per + k] * (1 - tx) + A[(c + 1) * per + k] * tx) * (1 - ty) + (A[(c + w) * per + k] * (1 - tx) + A[(c + w + 1) * per + k] * tx) * ty;
}

/**
 * The tile's ground over frame F from `cut`, the region's arrays over the tile and a margin ({ x0, y0, w, h } in the
 * region's cells; h, sea, lake (1 a lake), T, P, rgb), the region's frame Fp and detail ladder L, `f` tile cells a
 * region cell: { h, amp, ocean, lakeP, T, P, rgb } as region-relief.js relief() gives a region's.
 */
export function refineGround(F, Fp, cut, L, f, seed) {
    const N = F.n, n = N * N, h = new Float32Array(n), amp = new Float32Array(n), ocean = new Uint8Array(n), lakeP = new Uint8Array(n);
    const T = new Float32Array(n), P = new Float32Array(n), rgb = new Uint8Array(3 * n);
    const o0 = L.oct, o1 = L.oct + Math.round(Math.log2(f)), waves = detailWaves(seed), wv = { d: 0, A: 0 }, xy = [0, 0], q = [0, 0], ll = [0, 0];
    const W = cut.w, H = cut.h;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = j * N + i;
        cellXY(F, i, j, xy); xyCell(Fp, xy[0], xy[1], q);
        const fx = q[0] - 0.5 - cut.x0, fy = q[1] - 0.5 - cut.y0, b = bicubic(cut.hgt, W, H, fx, fy);
        placeAt(F, xy[0], xy[1], ll);
        const cl = Math.cos(ll[0] * D);
        waves(R * cl * Math.cos(ll[1] * D), R * cl * Math.sin(ll[1] * D), R * Math.sin(ll[0] * D), b, L, o0, o1, wv);
        h[c] = b + wv.d; amp[c] = wv.A + 10;
        ocean[c] = Math.round(255 * bilinear(cut.sea, W, H, fx, fy));
        lakeP[c] = bilinear(cut.lake, W, H, fx, fy) >= 0.5 ? 1 : 0;
        T[c] = bilinear(cut.T, W, H, fx, fy) - 0.0065 * wv.d; P[c] = bilinear(cut.P, W, H, fx, fy);
        for (let k = 0; k < 3; k++) rgb[3 * c + k] = bilinear(cut.rgb, W, H, fx, fy, 3, k);
    }
    return { h, amp, ocean, lakeP, T, P, rgb };
}
