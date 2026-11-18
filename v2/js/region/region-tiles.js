// A region's zoom tile (fork addition): zoomed in past a few screen pixels a cell, the piece of the region on screen is
// built again at a finer cell (2 … F_MAX to a region cell, about one and a half screen pixels a cell, at most
// TILE_MAX² cells) off the page (region-tile-worker.js) and drawn over the region. A tile is a smaller box in the
// region's own projection with a margin round it (padOf(f) region cells, PAD_CELLS tile cells or more, built and cut off
// when drawn, so its edges' erosion doesn't show; counted in region cells it would eat a fine tile whole). A new one is
// asked for once the view has rested (WAIT_MS) and the tile shown no longer covers it at the detail wanted; the one
// being built is dropped for it.

import { regionFrame } from './region-frame.js';
import { paintGround, shadeExag } from './region-paint.js';

const PAD_CELLS = 64, FADE = 2, TILE_MAX = 1024, F_MAX = 64, FROM_S = 2.5, WAIT_MS = 250;
/** The margin in region cells at `f` tile cells a region cell: 4 at ×16 and coarser, 1 at ×64. */
const padOf = (f) => Math.max(1, Math.min(4, Math.ceil(PAD_CELLS / f)));

/** The keeper of region `R`'s tile, its rivers' lines `lines` (region-rivers.js) cut in; ready() when one is shown. */
export function tileKeeper(R, lines, ready) {
    const Fp = R.frame, N = Fp.n;
    let tile = null, image = null, job = null, timer = 0, look = 'satellite', mask = null, shown = false;

    /** The view: zoom `s` (screen px a region cell) over x0…x1, y0…y1 (region cells). Zoomed out past FROM_S the tile is
     *  not shown (a sharper patch in the region's middle) and none is asked for. */
    function update(s, x0, y0, x1, y1) {
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(N, x1); y1 = Math.min(N, y1);
        shown = s >= FROM_S;
        if (!shown) { clearTimeout(timer); return; }
        if (x1 <= x0 || y1 <= y0) return;
        const span = Math.max(x1 - x0, y1 - y0) + 2;
        let f = Math.min(F_MAX, Math.max(2, 2 ** Math.ceil(Math.log2(s / 1.5))));
        while (f >= 2 && span > Math.floor(TILE_MAX / f) - 2 * padOf(f)) f /= 2;
        if (f < 2) return;
        const covers = (t) => t && t.f === f && t.box.a <= x0 && t.box.b <= y0 && t.box.a + t.box.wc >= x1 && t.box.b + t.box.wc >= y1;
        if (covers(tile) || covers(job)) { clearTimeout(timer); return; }
        const wc = Math.min(N, Math.floor(TILE_MAX / f) - 2 * padOf(f)), cl = (v) => Math.max(0, Math.min(N - wc, Math.round(v - wc / 2)));
        const box = { a: cl((x0 + x1) / 2), b: cl((y0 + y1) / 2), wc };
        clearTimeout(timer);
        timer = setTimeout(() => request(box, f), WAIT_MS);
    }

    function request(box, f) {
        job?.worker.terminate();
        const { a, b, wc } = box, PAD = padOf(f), K = wc + 2 * PAD, ox = (Fp.ox ?? 0) - Fp.km / 2 + (a + wc / 2) * Fp.cellKm, oy = (Fp.oy ?? 0) + Fp.km / 2 - (b + wc / 2) * Fp.cellKm;
        const F = regionFrame(Fp.lat, Fp.lon, K * Fp.cellKm, K * f, ox, oy), cut = cutOf(a - PAD - 2, b - PAD - 2, K + 4);
        const worker = new Worker(new URL('./region-tile-worker.js', import.meta.url), { type: 'module' });
        job = { worker, box, f };
        worker.onmessage = ({ data }) => {
            worker.terminate(); job = null;
            tile = Object.assign(data.done, { exag: shadeExag(R), parentCellKm: Fp.cellKm });
            console.info(`[region] zoom tile ${F.n}² at ${Math.round(F.cellKm * 1000)} m a cell in ${tile.ms} ms`);
            paint(); ready();
        };
        worker.onerror = (e) => { console.error('[region] zoom tile failed', e.message); job = null; };
        worker.postMessage({ frame: F, parent: Fp, cut, waves: R.waves, f, seed: R.seed, rivers: riversNear(a - PAD - 8, b - PAD - 8, K + 16), box },
            [cut.hgt, cut.sea, cut.lake, cut.T, cut.P, cut.rgb].map((A) => A.buffer));
    }

    /** The region's arrays over a square of `w` cells from (x0, y0), held at the region's edges. */
    function cutOf(x0, y0, w) {
        const n = w * w, hgt = new Float32Array(n), sea = new Float32Array(n), lake = new Float32Array(n), T = new Float32Array(n), P = new Float32Array(n), rgb = new Uint8Array(3 * n);
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
            const s = Math.min(N - 1, Math.max(0, y0 + y)) * N + Math.min(N - 1, Math.max(0, x0 + x)), d = y * w + x;
            hgt[d] = R.h[s]; sea[d] = R.sea[s]; lake[d] = R.lake[s] === 1 ? 1 : 0; T[d] = R.T[s]; P[d] = R.P[s];
            for (let k = 0; k < 3; k++) rgb[3 * d + k] = R.rgb[3 * s + k];
        }
        return { x0, y0, w, h: w, hgt, sea, lake, T, P, rgb };
    }

    /** The lines with a point in the square of `w` cells from (x0, y0), as x, y km in the projection (carveRivers'). */
    function riversNear(x0, y0, w) {
        const start = [], x = [], y = [], q = [], ox = (Fp.ox ?? 0) - Fp.km / 2, oy = (Fp.oy ?? 0) + Fp.km / 2;
        for (const L of lines) {
            let near = false;
            for (let k = 0; k < L.x.length && !near; k++) near = L.x[k] >= x0 && L.y[k] >= y0 && L.x[k] < x0 + w && L.y[k] < y0 + w;
            if (!near) continue;
            start.push(x.length);
            for (let k = 0; k < L.x.length; k++) { x.push(ox + L.x[k] * Fp.cellKm); y.push(oy - L.y[k] * Fp.cellKm); q.push(L.q[k]); }
        }
        return { start: Int32Array.from(start), x: Float32Array.from(x), y: Float32Array.from(y), q: Float32Array.from(q) };
    }

    // (the tile fades in over its edge's FADE region cells, so where the view has moved past it before the next one is
    // built, the finer detail eases into the region's rather than stopping at a line)
    function paint() {
        if (!tile) return;
        const n = tile.frame.n, f = tile.f, PAD = padOf(f), lo = PAD * f, hi = (PAD + tile.box.wc) * f, band = FADE * f, im = paintGround(tile, look, mask), px = im.data;
        for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) {
            const d = Math.min(i - lo, hi - 1 - i, j - lo, hi - 1 - j) + 0.5;
            if (d < band) { const t = d / band; px[4 * (j * n + i) + 3] = 255 * t * t * (3 - 2 * t); }
        }
        image = document.createElement('canvas'); image.width = image.height = n;
        image.getContext('2d').putImageData(im, 0, 0);
    }

    return {
        update,
        /** Draws the tile (its margin cut off) over the region drawn at (ox, oy), `s` px a region cell. */
        draw(g, ox, oy, s) {
            if (!image || s < FROM_S) return;
            const { a, b, wc } = tile.box, f = tile.f, PAD = padOf(f);
            g.drawImage(image, PAD * f, PAD * f, wc * f, wc * f, ox + a * s, oy + b * s, wc * s, wc * s);
        },
        /** The tile and its cell under (x, y) region cells, or null off it. */
        at(x, y) {
            if (!tile || !shown) return null;
            const { a, b, wc } = tile.box;
            if (x < a || y < b || x >= a + wc || y >= b + wc) return null;
            const PAD = padOf(tile.f);
            return { tile, i: Math.floor((x - a + PAD) * tile.f), j: Math.floor((y - b + PAD) * tile.f) };
        },
        restyle(l, m) { look = l; mask = m; paint(); },
        stop() { clearTimeout(timer); job?.worker.terminate(); job = null; },
    };
}
