// Region overlay (fork addition): the valleys of the region pick (region-pick.js) drawn by the globe's own shader
// (globe-view.js REGION_GLSL), over the picture and over its zoomed-in tiles, rather than painted into them. The valley
// under each pixel of a 2048 × 1024 grid goes to the GPU once per cut of the land, the chosen valleys a byte each as they
// change, the one under the pointer as one number. So a hover costs no repaint, no texture upload and no tile drawn again
// (painted in, it was ~80 ms of repaint, then a 2048-px upload a hover and every tile in view painted again).

import { valleyGrid, W, H } from './region-grid.js';

const SW = 1024;                                    // (the chosen bytes' rows)

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
        waiting = unit;
        valleyGrid(w, C.V).then((G) => {
            if (waiting !== unit || unitShown !== unit) return;          // (cut again meanwhile)
            waiting = null;
            const data = new Uint8Array(4 * W * H);
            units = 0;
            for (let p = 0; p < W * H; p++) {
                const u = G[p] + 1;                                         // (0: the sea; row 0 the south, the texture's bottom)
                if (u > units) units = u;
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
