// Region overlay (fork addition): the valleys of the region pick (region-pick.js) drawn by the globe's own shader
// (globe-view.js REGION_GLSL), over the picture and over its zoomed-in tiles, rather than painted into them. The valley
// under each pixel of a 2048 × 1024 grid goes to the GPU once per cut of the land, the chosen valleys a byte each as they
// change, the one under the pointer as one number. So a hover costs no repaint, no texture upload and no tile drawn again
// (painted in, it was ~80 ms of repaint, then a 2048-px upload a hover and every tile in view painted again).

import { unitAt } from './region-bank.js';

const W = 2048, H = 1024, SW = 1024;                // (the grid; the chosen bytes' rows)
const SLICE_MS = 8;

/** Each pixel's nearest cell, kept on the world: built a few rows at a time between frames (~0.4 s in all). */
function pixelCells(w) {
    return (w._pixelCells ??= (async () => {
        const { index } = w.tMesh, out = new Int32Array(W * H);
        for (let j = 0; j < H;) {
            const t = performance.now();
            for (; j < H && performance.now() - t < SLICE_MS; j++) {
                // (row j from the south: the texture's first row is its bottom)
                const lat = -Math.PI / 2 + (j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
                for (let i = 0; i < W; i++) {
                    const lon = (i + 0.5) / W * 2 * Math.PI - Math.PI;
                    out[j * W + i] = index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl);
                }
            }
            if (j < H) await new Promise((r) => setTimeout(r, 0));
        }
        return out;
    })());
}

/**
 * The overlay on `globe` (a GlobeView) for the pick's state `C` ({ unit, ids, hover, world }): sync(world) each frame
 * sends what changed (nothing, mostly).
 */
export function regionOverlay(globe) {
    let unitShown = null, waiting = null, chosenKey = '', units = 0, hoverShown = -2;
    function cells(C) {
        const unit = C.unit, w = C.world;
        unitShown = unit; chosenKey = null;
        globe.setRegionCells(null);
        if (!unit) return;
        units = 0;
        for (let c = 0; c < unit.length; c++) if (unit[c] >= units) units = unit[c] + 1;
        waiting = unit;
        pixelCells(w).then((pc) => {
            if (waiting !== unit || unitShown !== unit) return;          // (cut again meanwhile)
            waiting = null;
            const data = new Uint8Array(4 * W * H), V = C.V, mesh = w.tMesh;
            for (let p = 0; p < W * H; p++) {
                const c = pc[p];
                let u = unit[c];
                // (a river cell's pixels go by the side of its line they lie on, so a valley's edge is the river: region-bank.js)
                if (V?.wall[c]) {
                    const i = p % W, j = (p - i) / W, lat = -Math.PI / 2 + (j + 0.5) / H * Math.PI, lon = (i + 0.5) / W * 2 * Math.PI - Math.PI;
                    u = unitAt(V, mesh, c, Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
                }
                u += 1;                                                     // (0: the sea)
                data[4 * p] = u & 255; data[4 * p + 1] = (u >> 8) & 255; data[4 * p + 2] = u >> 16;
            }
            globe.setRegionCells(data, W, H);
        });
    }
    return {
        sync(world, C) {
            const live = C.unit && C.world === world ? C : null;
            if ((live?.unit ?? null) !== unitShown) cells(live ?? { unit: null });
            if (!live) return;
            const key = [...C.ids].join(',');
            if (key !== chosenKey) {
                chosenKey = key;
                const rows = Math.max(1, Math.ceil(units / SW)), bytes = new Uint8Array(4 * SW * rows);
                for (const id of C.ids) if (id >= 0 && id < units) bytes[4 * id] = 255;
                globe.setRegionChosen(bytes, SW, rows);
            }
            if (C.hover !== hoverShown) { hoverShown = C.hover; globe.setRegionHover(C.hover); }
        },
    };
}
